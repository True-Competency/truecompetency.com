-- Migration: 0029_committee_question_editing
-- Date: 2026-05-15
-- Purpose: Enables all committee members to edit and soft-delete questions
--          and their options on live competencies. Establishes an audit log
--          for every change. Adds optimistic locking via version columns to
--          prevent silent overwrites when multiple committee members edit
--          the same row concurrently.
-- Author: @novruzoff
--
-- Course-syllabus semantics (Marc's guidance):
--   - student_answers.is_correct is frozen at answer time. Editing a question
--     or its options does NOT regrade existing answers. The grading trigger
--     only fires on writes to student_answers, not on writes to questions or
--     options. This migration preserves that.
--   - Soft-deleted questions are removed from a competency's total question
--     count: a trainee's percentage may go UP after a deletion (A1).
--   - Existing correct answers on a soft-deleted question still count in the
--     numerator (B2). The percentage is capped at 100 so a trainee whose
--     correct-answer count exceeds the new live-question count does not
--     see >100%. Trainees never see their progress drop because of a
--     curriculum change.
--
-- This migration is atomic: schema, indexes, view, RLS policies, and RPCs
-- all ship together. Frontend work (consuming the new RPCs and surfacing
-- version columns to the client) ships separately and must be deployed
-- before the committee edit UI is exposed.

BEGIN;

-- ============================================================
-- 1. Soft-delete and version columns
-- ============================================================
-- updated_at / updated_by: stamped by every successful RPC write.
-- deleted_at / deleted_by: NULL means live. Set by the soft-delete RPCs.
-- version: starts at 1, bumped by 1 on every write. The client must send
--          the expected version with every update; mismatch raises.

ALTER TABLE public.competency_questions
  ADD COLUMN updated_at  timestamptz NOT NULL DEFAULT now(),
  ADD COLUMN updated_by  uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  ADD COLUMN deleted_at  timestamptz,
  ADD COLUMN deleted_by  uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  ADD COLUMN version     integer NOT NULL DEFAULT 1;

ALTER TABLE public.question_options
  ADD COLUMN updated_at  timestamptz NOT NULL DEFAULT now(),
  ADD COLUMN updated_by  uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  ADD COLUMN deleted_at  timestamptz,
  ADD COLUMN deleted_by  uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  ADD COLUMN version     integer NOT NULL DEFAULT 1;


-- ============================================================
-- 2. Index adjustments for soft-delete semantics
-- ============================================================
-- The existing uniqueness rules ((question_id, sort_order) unique, and
-- "at most one correct option per question") only make sense for live
-- options. Restricting both to deleted_at IS NULL lets a sort_order
-- slot or the correct flag be re-used after a soft delete.

-- (question_id, sort_order) uniqueness, live only.
ALTER TABLE public.question_options
  DROP CONSTRAINT IF EXISTS question_options_question_id_sort_order_key;

CREATE UNIQUE INDEX question_options_question_id_sort_order_active_idx
  ON public.question_options (question_id, sort_order)
  WHERE deleted_at IS NULL;

-- "At most one correct option per question", live only.
-- The existing partial index name was not consistent across earlier
-- migrations, so look it up dynamically and drop it before recreating.
DO $$
DECLARE
  v_idx_name text;
BEGIN
  SELECT indexname INTO v_idx_name
  FROM pg_indexes
  WHERE schemaname = 'public'
    AND tablename = 'question_options'
    AND indexdef ILIKE '%is_correct%'
    AND indexdef ILIKE '%UNIQUE%'
  LIMIT 1;

  IF v_idx_name IS NOT NULL THEN
    EXECUTE format('DROP INDEX public.%I', v_idx_name);
  END IF;
END $$;

CREATE UNIQUE INDEX question_options_one_correct_active_idx
  ON public.question_options (question_id)
  WHERE is_correct = true AND deleted_at IS NULL;


-- ============================================================
-- 3. audit_log table
-- ============================================================
-- Append-only history of every change made through the committee_* RPCs.
-- old_values and new_values are full row snapshots; an auditor can
-- reconstruct any past state without the row needing to still exist.

CREATE TABLE public.audit_log (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  table_name  text NOT NULL,
  row_id      uuid NOT NULL,
  action      text NOT NULL,
  actor_id    uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  old_values  jsonb,
  new_values  jsonb,
  created_at  timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT audit_log_action_chk
    CHECK (action IN ('insert', 'update', 'soft_delete'))
);

-- "History of this row" lookup pattern.
CREATE INDEX audit_log_row_idx
  ON public.audit_log (table_name, row_id, created_at DESC);

-- "Activity by this actor" lookup pattern.
CREATE INDEX audit_log_actor_idx
  ON public.audit_log (actor_id, created_at DESC);

ALTER TABLE public.audit_log ENABLE ROW LEVEL SECURITY;

-- Admin-read only. All writes go through SECURITY DEFINER RPCs which
-- bypass RLS, so the absence of INSERT/UPDATE/DELETE policies means no
-- direct client writes are possible.
CREATE POLICY al_admin_read
  ON public.audit_log
  FOR SELECT
  TO authenticated
  USING (public.is_app_admin(auth.uid()));


-- ============================================================
-- 4. student_competency_progress view (A1 + B2)
-- ============================================================
-- total_questions  - live questions only (A1).
-- correct numerator - includes correct answers on deleted questions (B2).
-- pct - capped at 100 so >100% can't appear after deletions.
-- answered_questions - displayed count, live questions only, so the
--   "X of Y answered" UI math remains coherent after deletions.

CREATE OR REPLACE VIEW public.student_competency_progress AS
SELECT
  ca.student_id,
  ca.competency_id,
  COALESCE(qc.total, 0) AS total_questions,
  COALESCE(answered_live.cnt, 0) AS answered_questions,
  COALESCE(
    sco.pct,
    CASE
      WHEN COALESCE(qc.total, 0) = 0 THEN 0
      ELSE LEAST(
        100,
        ROUND(100.0 * COALESCE(correct_all.cnt, 0) / qc.total)::integer
      )
    END
  ) AS pct
FROM public.competency_assignments ca
LEFT JOIN (
  -- Denominator: live questions only.
  SELECT competency_id, COUNT(*)::integer AS total
  FROM public.competency_questions
  WHERE deleted_at IS NULL
  GROUP BY competency_id
) qc ON qc.competency_id = ca.competency_id
LEFT JOIN (
  -- Numerator: distinct correct answers across ALL questions (live + deleted).
  -- This is B2: a trainee keeps credit for correct answers on questions
  -- that were later removed from the curriculum.
  SELECT sa.student_id, cq.competency_id,
         COUNT(DISTINCT sa.question_id)::integer AS cnt
  FROM public.student_answers sa
  JOIN public.competency_questions cq ON cq.id = sa.question_id
  WHERE sa.is_correct = true
  GROUP BY sa.student_id, cq.competency_id
) correct_all
  ON correct_all.student_id = ca.student_id
 AND correct_all.competency_id = ca.competency_id
LEFT JOIN (
  -- Answered-count display: live questions only, to keep the UI math
  -- "X of Y answered" coherent.
  SELECT sa.student_id, cq.competency_id,
         COUNT(DISTINCT sa.question_id)::integer AS cnt
  FROM public.student_answers sa
  JOIN public.competency_questions cq
    ON cq.id = sa.question_id
   AND cq.deleted_at IS NULL
  GROUP BY sa.student_id, cq.competency_id
) answered_live
  ON answered_live.student_id = ca.student_id
 AND answered_live.competency_id = ca.competency_id
LEFT JOIN public.student_competency_overrides sco
  ON sco.student_id = ca.student_id
 AND sco.competency_id = ca.competency_id;


-- ============================================================
-- 5. RLS: hide soft-deleted content from trainees
-- ============================================================
-- Trainees must not see deleted questions, their options, or their media.
-- Committee, instructor, and admin keep full visibility - they need it
-- for audit review and any future undelete (admin-via-SQL).

DROP POLICY IF EXISTS cq_trainee_read_enrolled ON public.competency_questions;
CREATE POLICY cq_trainee_read_enrolled
  ON public.competency_questions
  FOR SELECT
  TO authenticated
  USING (
    deleted_at IS NULL
    AND EXISTS (
      SELECT 1
      FROM public.competency_assignments ca
      WHERE ca.student_id = auth.uid()
        AND ca.competency_id = competency_questions.competency_id
    )
  );

DROP POLICY IF EXISTS qo_trainee_read_enrolled ON public.question_options;
CREATE POLICY qo_trainee_read_enrolled
  ON public.question_options
  FOR SELECT
  TO authenticated
  USING (
    deleted_at IS NULL
    AND EXISTS (
      SELECT 1
      FROM public.competency_questions cq
      JOIN public.competency_assignments ca
        ON ca.competency_id = cq.competency_id
      WHERE cq.id = question_options.question_id
        AND cq.deleted_at IS NULL
        AND ca.student_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS qm_trainee_read_enrolled ON public.question_media;
CREATE POLICY qm_trainee_read_enrolled
  ON public.question_media
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.competency_questions cq
      JOIN public.competency_assignments ca
        ON ca.competency_id = cq.competency_id
      WHERE cq.id = question_media.question_id
        AND cq.deleted_at IS NULL
        AND ca.student_id = auth.uid()
    )
  );


-- ============================================================
-- 6. Committee RPCs
-- ============================================================
-- All RPCs:
--   - Require an authenticated committee member or admin.
--   - Use optimistic locking via the version column.
--   - Write to audit_log inside the same transaction.
--   - Bump version on every successful write.
-- Error codes used:
--   42501  - permission / not authenticated
--   22023  - invalid parameter (empty body, negative sort_order)
--   P0001  - business rule violation (version mismatch, deleted target,
--            cannot delete correct option)
--   P0002  - row not found

-- ------------------------------------------------------------
-- committee_update_question(p_id, p_body, p_expected_version)
-- Returns the new version number.
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.committee_update_question(
  p_id uuid,
  p_body text,
  p_expected_version integer
) RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_caller uuid := auth.uid();
  v_old jsonb;
  v_new jsonb;
  v_current_version integer;
  v_deleted_at timestamptz;
BEGIN
  IF v_caller IS NULL THEN
    RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '42501';
  END IF;

  IF NOT (public.auth_is_committee(v_caller) OR public.is_app_admin(v_caller)) THEN
    RAISE EXCEPTION 'Forbidden: committee role required' USING ERRCODE = '42501';
  END IF;

  IF p_body IS NULL OR length(trim(p_body)) = 0 THEN
    RAISE EXCEPTION 'Question body cannot be empty' USING ERRCODE = '22023';
  END IF;

  -- Lock the row and capture pre-update state.
  SELECT version, deleted_at, to_jsonb(cq.*)
    INTO v_current_version, v_deleted_at, v_old
  FROM public.competency_questions cq
  WHERE id = p_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Question not found' USING ERRCODE = 'P0002';
  END IF;

  IF v_deleted_at IS NOT NULL THEN
    RAISE EXCEPTION 'Question is deleted' USING ERRCODE = 'P0001';
  END IF;

  IF v_current_version <> p_expected_version THEN
    RAISE EXCEPTION 'Version mismatch: expected %, got %. Refresh and retry.',
      p_expected_version, v_current_version USING ERRCODE = 'P0001';
  END IF;

  UPDATE public.competency_questions
     SET body = p_body,
         version = version + 1,
         updated_at = now(),
         updated_by = v_caller
   WHERE id = p_id
  RETURNING to_jsonb(competency_questions.*), version
       INTO v_new, v_current_version;

  INSERT INTO public.audit_log (table_name, row_id, action, actor_id, old_values, new_values)
  VALUES ('competency_questions', p_id, 'update', v_caller, v_old, v_new);

  RETURN v_current_version;
END;
$$;

REVOKE ALL ON FUNCTION public.committee_update_question(uuid, text, integer) FROM public;
GRANT EXECUTE ON FUNCTION public.committee_update_question(uuid, text, integer) TO authenticated;


-- ------------------------------------------------------------
-- committee_update_option(p_id, p_body, p_sort_order, p_expected_version)
-- Updates body and sort_order only. is_correct is changed via
-- committee_set_correct_option to preserve the one-correct-per-question
-- invariant atomically.
-- Returns the new version number.
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.committee_update_option(
  p_id uuid,
  p_body text,
  p_sort_order integer,
  p_expected_version integer
) RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_caller uuid := auth.uid();
  v_old jsonb;
  v_new jsonb;
  v_current_version integer;
  v_deleted_at timestamptz;
BEGIN
  IF v_caller IS NULL THEN
    RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '42501';
  END IF;

  IF NOT (public.auth_is_committee(v_caller) OR public.is_app_admin(v_caller)) THEN
    RAISE EXCEPTION 'Forbidden: committee role required' USING ERRCODE = '42501';
  END IF;

  IF p_body IS NULL OR length(trim(p_body)) = 0 THEN
    RAISE EXCEPTION 'Option body cannot be empty' USING ERRCODE = '22023';
  END IF;

  IF p_sort_order IS NULL OR p_sort_order < 0 THEN
    RAISE EXCEPTION 'sort_order must be a non-negative integer' USING ERRCODE = '22023';
  END IF;

  SELECT version, deleted_at, to_jsonb(qo.*)
    INTO v_current_version, v_deleted_at, v_old
  FROM public.question_options qo
  WHERE id = p_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Option not found' USING ERRCODE = 'P0002';
  END IF;

  IF v_deleted_at IS NOT NULL THEN
    RAISE EXCEPTION 'Option is deleted' USING ERRCODE = 'P0001';
  END IF;

  IF v_current_version <> p_expected_version THEN
    RAISE EXCEPTION 'Version mismatch: expected %, got %.',
      p_expected_version, v_current_version USING ERRCODE = 'P0001';
  END IF;

  UPDATE public.question_options
     SET body = p_body,
         sort_order = p_sort_order,
         version = version + 1,
         updated_at = now(),
         updated_by = v_caller
   WHERE id = p_id
  RETURNING to_jsonb(question_options.*), version
       INTO v_new, v_current_version;

  INSERT INTO public.audit_log (table_name, row_id, action, actor_id, old_values, new_values)
  VALUES ('question_options', p_id, 'update', v_caller, v_old, v_new);

  RETURN v_current_version;
END;
$$;

REVOKE ALL ON FUNCTION public.committee_update_option(uuid, text, integer, integer) FROM public;
GRANT EXECUTE ON FUNCTION public.committee_update_option(uuid, text, integer, integer) TO authenticated;


-- ------------------------------------------------------------
-- committee_set_correct_option(p_question_id, p_new_correct_option_id)
-- Atomically demotes the current correct option and promotes the
-- specified one. Locks the question row to serialize concurrent
-- attempts. Both options get version-bumped and logged.
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.committee_set_correct_option(
  p_question_id uuid,
  p_new_correct_option_id uuid
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_caller uuid := auth.uid();
  v_old_correct_id uuid;
  v_old_correct_old jsonb;
  v_old_correct_new jsonb;
  v_new_correct_old jsonb;
  v_new_correct_new jsonb;
  v_q_deleted timestamptz;
BEGIN
  IF v_caller IS NULL THEN
    RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '42501';
  END IF;

  IF NOT (public.auth_is_committee(v_caller) OR public.is_app_admin(v_caller)) THEN
    RAISE EXCEPTION 'Forbidden: committee role required' USING ERRCODE = '42501';
  END IF;

  -- Lock the question to serialize concurrent correct-option changes
  -- on the same question.
  SELECT deleted_at INTO v_q_deleted
  FROM public.competency_questions
  WHERE id = p_question_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Question not found' USING ERRCODE = 'P0002';
  END IF;

  IF v_q_deleted IS NOT NULL THEN
    RAISE EXCEPTION 'Question is deleted' USING ERRCODE = 'P0001';
  END IF;

  -- Find the currently-correct option for this question (may be NULL
  -- if the question is in a temporarily-no-correct state for some
  -- reason; the swap will still create exactly one correct option).
  SELECT id INTO v_old_correct_id
  FROM public.question_options
  WHERE question_id = p_question_id
    AND is_correct = true
    AND deleted_at IS NULL;

  -- Verify the candidate belongs to this question and is live.
  PERFORM 1 FROM public.question_options
  WHERE id = p_new_correct_option_id
    AND question_id = p_question_id
    AND deleted_at IS NULL;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Option does not belong to this question, or is deleted' USING ERRCODE = 'P0002';
  END IF;

  -- No-op if already correct.
  IF v_old_correct_id IS NOT NULL AND v_old_correct_id = p_new_correct_option_id THEN
    RETURN;
  END IF;

  -- Demote existing correct option (if any).
  IF v_old_correct_id IS NOT NULL THEN
    SELECT to_jsonb(qo.*) INTO v_old_correct_old
    FROM public.question_options qo WHERE id = v_old_correct_id;

    UPDATE public.question_options
       SET is_correct = false,
           version = version + 1,
           updated_at = now(),
           updated_by = v_caller
     WHERE id = v_old_correct_id
    RETURNING to_jsonb(question_options.*) INTO v_old_correct_new;

    INSERT INTO public.audit_log (table_name, row_id, action, actor_id, old_values, new_values)
    VALUES ('question_options', v_old_correct_id, 'update', v_caller, v_old_correct_old, v_old_correct_new);
  END IF;

  -- Promote the new correct option.
  SELECT to_jsonb(qo.*) INTO v_new_correct_old
  FROM public.question_options qo WHERE id = p_new_correct_option_id;

  UPDATE public.question_options
     SET is_correct = true,
         version = version + 1,
         updated_at = now(),
         updated_by = v_caller
   WHERE id = p_new_correct_option_id
  RETURNING to_jsonb(question_options.*) INTO v_new_correct_new;

  INSERT INTO public.audit_log (table_name, row_id, action, actor_id, old_values, new_values)
  VALUES ('question_options', p_new_correct_option_id, 'update', v_caller, v_new_correct_old, v_new_correct_new);
END;
$$;

REVOKE ALL ON FUNCTION public.committee_set_correct_option(uuid, uuid) FROM public;
GRANT EXECUTE ON FUNCTION public.committee_set_correct_option(uuid, uuid) TO authenticated;


-- ------------------------------------------------------------
-- committee_add_option(p_question_id, p_body, p_sort_order)
-- New options are always created with is_correct = false. Use
-- committee_set_correct_option to change correctness afterward.
-- Returns the new option id.
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.committee_add_option(
  p_question_id uuid,
  p_body text,
  p_sort_order integer
) RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_caller uuid := auth.uid();
  v_new_id uuid;
  v_new jsonb;
  v_q_deleted timestamptz;
BEGIN
  IF v_caller IS NULL THEN
    RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '42501';
  END IF;

  IF NOT (public.auth_is_committee(v_caller) OR public.is_app_admin(v_caller)) THEN
    RAISE EXCEPTION 'Forbidden: committee role required' USING ERRCODE = '42501';
  END IF;

  IF p_body IS NULL OR length(trim(p_body)) = 0 THEN
    RAISE EXCEPTION 'Option body cannot be empty' USING ERRCODE = '22023';
  END IF;

  IF p_sort_order IS NULL OR p_sort_order < 0 THEN
    RAISE EXCEPTION 'sort_order must be a non-negative integer' USING ERRCODE = '22023';
  END IF;

  SELECT deleted_at INTO v_q_deleted
  FROM public.competency_questions
  WHERE id = p_question_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Question not found' USING ERRCODE = 'P0002';
  END IF;

  IF v_q_deleted IS NOT NULL THEN
    RAISE EXCEPTION 'Question is deleted' USING ERRCODE = 'P0001';
  END IF;

  INSERT INTO public.question_options (question_id, body, is_correct, sort_order, updated_by)
  VALUES (p_question_id, p_body, false, p_sort_order, v_caller)
  RETURNING id, to_jsonb(question_options.*) INTO v_new_id, v_new;

  INSERT INTO public.audit_log (table_name, row_id, action, actor_id, old_values, new_values)
  VALUES ('question_options', v_new_id, 'insert', v_caller, NULL, v_new);

  RETURN v_new_id;
END;
$$;

REVOKE ALL ON FUNCTION public.committee_add_option(uuid, text, integer) FROM public;
GRANT EXECUTE ON FUNCTION public.committee_add_option(uuid, text, integer) TO authenticated;


-- ------------------------------------------------------------
-- committee_delete_option(p_id, p_expected_version)
-- Soft-delete. Rejects deletion of the currently-correct option to
-- protect the one-correct-per-question invariant. To delete the
-- correct option, first call committee_set_correct_option to move
-- correctness elsewhere.
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.committee_delete_option(
  p_id uuid,
  p_expected_version integer
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_caller uuid := auth.uid();
  v_old jsonb;
  v_new jsonb;
  v_current_version integer;
  v_deleted_at timestamptz;
  v_is_correct boolean;
BEGIN
  IF v_caller IS NULL THEN
    RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '42501';
  END IF;

  IF NOT (public.auth_is_committee(v_caller) OR public.is_app_admin(v_caller)) THEN
    RAISE EXCEPTION 'Forbidden: committee role required' USING ERRCODE = '42501';
  END IF;

  SELECT version, deleted_at, is_correct, to_jsonb(qo.*)
    INTO v_current_version, v_deleted_at, v_is_correct, v_old
  FROM public.question_options qo
  WHERE id = p_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Option not found' USING ERRCODE = 'P0002';
  END IF;

  IF v_deleted_at IS NOT NULL THEN
    RAISE EXCEPTION 'Option already deleted' USING ERRCODE = 'P0001';
  END IF;

  IF v_current_version <> p_expected_version THEN
    RAISE EXCEPTION 'Version mismatch: expected %, got %.',
      p_expected_version, v_current_version USING ERRCODE = 'P0001';
  END IF;

  IF v_is_correct THEN
    RAISE EXCEPTION 'Cannot delete the correct option. Set a different correct option first.'
      USING ERRCODE = 'P0001';
  END IF;

  UPDATE public.question_options
     SET deleted_at = now(),
         deleted_by = v_caller,
         version = version + 1,
         updated_at = now(),
         updated_by = v_caller
   WHERE id = p_id
  RETURNING to_jsonb(question_options.*) INTO v_new;

  INSERT INTO public.audit_log (table_name, row_id, action, actor_id, old_values, new_values)
  VALUES ('question_options', p_id, 'soft_delete', v_caller, v_old, v_new);
END;
$$;

REVOKE ALL ON FUNCTION public.committee_delete_option(uuid, integer) FROM public;
GRANT EXECUTE ON FUNCTION public.committee_delete_option(uuid, integer) TO authenticated;


-- ------------------------------------------------------------
-- committee_delete_question(p_id, p_expected_version)
-- Soft-deletes the question and cascades the soft-delete to all
-- live options of that question, each with its own audit entry.
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.committee_delete_question(
  p_id uuid,
  p_expected_version integer
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_caller uuid := auth.uid();
  v_old jsonb;
  v_new jsonb;
  v_current_version integer;
  v_deleted_at timestamptz;
  v_opt RECORD;
BEGIN
  IF v_caller IS NULL THEN
    RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '42501';
  END IF;

  IF NOT (public.auth_is_committee(v_caller) OR public.is_app_admin(v_caller)) THEN
    RAISE EXCEPTION 'Forbidden: committee role required' USING ERRCODE = '42501';
  END IF;

  SELECT version, deleted_at, to_jsonb(cq.*)
    INTO v_current_version, v_deleted_at, v_old
  FROM public.competency_questions cq
  WHERE id = p_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Question not found' USING ERRCODE = 'P0002';
  END IF;

  IF v_deleted_at IS NOT NULL THEN
    RAISE EXCEPTION 'Question already deleted' USING ERRCODE = 'P0001';
  END IF;

  IF v_current_version <> p_expected_version THEN
    RAISE EXCEPTION 'Version mismatch: expected %, got %.',
      p_expected_version, v_current_version USING ERRCODE = 'P0001';
  END IF;

  -- Soft-delete the question itself.
  UPDATE public.competency_questions
     SET deleted_at = now(),
         deleted_by = v_caller,
         version = version + 1,
         updated_at = now(),
         updated_by = v_caller
   WHERE id = p_id
  RETURNING to_jsonb(competency_questions.*) INTO v_new;

  INSERT INTO public.audit_log (table_name, row_id, action, actor_id, old_values, new_values)
  VALUES ('competency_questions', p_id, 'soft_delete', v_caller, v_old, v_new);

  -- Cascade soft-delete to all live options on this question. Each
  -- option gets its own audit entry so the history is reconstructable.
  FOR v_opt IN
    SELECT id, to_jsonb(qo.*) AS old_row
    FROM public.question_options qo
    WHERE question_id = p_id AND deleted_at IS NULL
    FOR UPDATE
  LOOP
    UPDATE public.question_options
       SET deleted_at = now(),
           deleted_by = v_caller,
           version = version + 1,
           updated_at = now(),
           updated_by = v_caller
     WHERE id = v_opt.id
    RETURNING to_jsonb(question_options.*) INTO v_new;

    INSERT INTO public.audit_log (table_name, row_id, action, actor_id, old_values, new_values)
    VALUES ('question_options', v_opt.id, 'soft_delete', v_caller, v_opt.old_row, v_new);
  END LOOP;
END;
$$;

REVOKE ALL ON FUNCTION public.committee_delete_question(uuid, integer) FROM public;
GRANT EXECUTE ON FUNCTION public.committee_delete_question(uuid, integer) TO authenticated;

COMMIT;