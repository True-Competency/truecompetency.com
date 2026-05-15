-- Migration: 0030_committee_question_creation_and_option_media
-- Date: 2026-05-15
-- Purpose:
--   1. Renames chair_create_question to committee_create_question with a
--      widened role check (committee + admin). Writes audit_log entries
--      for the new question and each of its 4 options.
--   2. Allows question_media to attach to either a question OR an
--      individual option. Adds soft-delete and version columns so media
--      participates in the same audit/version/cascade machinery as 0029.
--   3. Makes question_options.body nullable, conditional on the option
--      having at least one live attached media row. Enforced in RPCs and
--      in trainee-read RLS (defensive: trainees never see "broken"
--      options with NULL body and zero media).
--   4. Adds three media RPCs: attach to question, attach to option,
--      soft-delete. All audited, version-checked where applicable,
--      gated on committee role.
--   5. Updates committee_update_option, committee_add_option,
--      committee_delete_question, and committee_delete_option from 0029
--      to handle the new invariants and cascade to attached media.
-- Author: @novruzoff
--
-- Note: storage files in the question-media bucket are NOT deleted when
-- the database row is soft-deleted. They become orphaned until manual
-- cleanup, matching the behavior already documented in database.md.

BEGIN;

-- ============================================================
-- 1. Schema changes on question_media
-- ============================================================

ALTER TABLE public.question_media
  ADD COLUMN option_id   uuid REFERENCES public.question_options(id) ON DELETE CASCADE,
  ADD COLUMN updated_at  timestamptz NOT NULL DEFAULT now(),
  ADD COLUMN updated_by  uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  ADD COLUMN deleted_at  timestamptz,
  ADD COLUMN deleted_by  uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  ADD COLUMN version     integer NOT NULL DEFAULT 1;

-- A media row attaches to either a question or an option, not both.
-- DROP NOT NULL is a no-op if question_id was already nullable.
ALTER TABLE public.question_media
  ALTER COLUMN question_id DROP NOT NULL;

-- Exactly one parent. Enforced at the schema level.
ALTER TABLE public.question_media
  ADD CONSTRAINT question_media_one_parent_chk
  CHECK ((question_id IS NOT NULL) <> (option_id IS NOT NULL));

-- Partial index for "live media on this option" lookups. Most reads
-- want live media only, so the WHERE clause keeps the index small.
CREATE INDEX question_media_option_active_idx
  ON public.question_media (option_id)
  WHERE option_id IS NOT NULL AND deleted_at IS NULL;

COMMENT ON COLUMN public.question_media.option_id IS
  'When set, this media row is attached to an option (and question_id is NULL). Exactly one of question_id, option_id must be set; enforced by question_media_one_parent_chk.';

-- ============================================================
-- 2. question_options.body becomes conditionally nullable
-- ============================================================
-- The invariant "body is NULL only when at least one live media is
-- attached" is enforced in the RPCs (committee_update_option,
-- committee_delete_media) and in trainee-read RLS, not by a CHECK
-- constraint, because CHECK constraints can't reference other tables.

ALTER TABLE public.question_options
  ALTER COLUMN body DROP NOT NULL;

COMMENT ON COLUMN public.question_options.body IS
  'Option label text. May be NULL only when the option has at least one live attached question_media row. Enforced by committee_* RPCs and by trainee-read RLS (which hides options with NULL body and zero live media).';

-- ============================================================
-- 3. RLS: trainee read on question_media
-- ============================================================
-- Trainee sees a media row if:
--   - the row is live, AND
--   - either (attached to a live question whose competency the trainee
--     is enrolled in) OR (attached to a live option whose live question
--     belongs to a competency the trainee is enrolled in).

DROP POLICY IF EXISTS qm_trainee_read_enrolled ON public.question_media;
CREATE POLICY qm_trainee_read_enrolled
  ON public.question_media
  FOR SELECT
  TO authenticated
  USING (
    deleted_at IS NULL
    AND (
      -- Media attached directly to a question
      (question_id IS NOT NULL AND EXISTS (
        SELECT 1
        FROM public.competency_questions cq
        JOIN public.competency_assignments ca
          ON ca.competency_id = cq.competency_id
        WHERE cq.id = question_media.question_id
          AND cq.deleted_at IS NULL
          AND ca.student_id = auth.uid()
      ))
      OR
      -- Media attached to an option
      (option_id IS NOT NULL AND EXISTS (
        SELECT 1
        FROM public.question_options qo
        JOIN public.competency_questions cq ON cq.id = qo.question_id
        JOIN public.competency_assignments ca
          ON ca.competency_id = cq.competency_id
        WHERE qo.id = question_media.option_id
          AND qo.deleted_at IS NULL
          AND cq.deleted_at IS NULL
          AND ca.student_id = auth.uid()
      ))
    )
  );

-- ============================================================
-- 4. RLS: defensive read on question_options (trainee)
-- ============================================================
-- Hide options from trainees when body is NULL AND no live media is
-- attached. Such an option is "broken" mid-construction. Committee,
-- instructor, and admin still see it through their own policies so
-- they can fix it.

DROP POLICY IF EXISTS qo_trainee_read_enrolled ON public.question_options;
CREATE POLICY qo_trainee_read_enrolled
  ON public.question_options
  FOR SELECT
  TO authenticated
  USING (
    deleted_at IS NULL
    AND (
      body IS NOT NULL
      OR EXISTS (
        SELECT 1
        FROM public.question_media qm
        WHERE qm.option_id = question_options.id
          AND qm.deleted_at IS NULL
      )
    )
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

-- ============================================================
-- 5. Drop chair_create_question
-- ============================================================
-- Verified by grep: no frontend call sites. Safe to drop without a
-- backward-compat wrapper.

DROP FUNCTION IF EXISTS public.chair_create_question(uuid, text, text[], integer);

-- ============================================================
-- 6. committee_create_question
-- ============================================================
-- Same shape as the old chair_create_question, with two differences:
--   - Role check is committee or admin (not chief_editor only).
--   - Writes audit_log entries for the question and each of its 4
--     options (matching the pattern in committee_add_option).
-- Option bodies are required non-empty at creation. To create a
-- media-only option, create with a placeholder label, attach media,
-- then call committee_update_option to NULL the body.

CREATE OR REPLACE FUNCTION public.committee_create_question(
  p_competency_id uuid,
  p_question_text text,
  p_options text[],
  p_correct_index integer
) RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_caller uuid := auth.uid();
  v_new_question_id uuid;
  v_new_option_id uuid;
  v_question_row jsonb;
  v_option_row jsonb;
  v_i integer;
  v_option_text text;
BEGIN
  IF v_caller IS NULL THEN
    RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '42501';
  END IF;

  IF NOT (public.auth_is_committee(v_caller) OR public.is_app_admin(v_caller)) THEN
    RAISE EXCEPTION 'Forbidden: committee role required' USING ERRCODE = '42501';
  END IF;

  IF p_question_text IS NULL OR length(trim(p_question_text)) = 0 THEN
    RAISE EXCEPTION 'Question text cannot be empty' USING ERRCODE = '22023';
  END IF;

  IF p_options IS NULL OR array_length(p_options, 1) <> 4 THEN
    RAISE EXCEPTION 'Exactly 4 options required' USING ERRCODE = '22023';
  END IF;

  FOR v_i IN 1..4 LOOP
    v_option_text := p_options[v_i];
    IF v_option_text IS NULL OR length(trim(v_option_text)) = 0 THEN
      RAISE EXCEPTION 'Option % text cannot be empty', v_i USING ERRCODE = '22023';
    END IF;
  END LOOP;

  IF p_correct_index IS NULL OR p_correct_index < 1 OR p_correct_index > 4 THEN
    RAISE EXCEPTION 'p_correct_index must be 1, 2, 3, or 4' USING ERRCODE = '22023';
  END IF;

  PERFORM 1 FROM public.competencies WHERE id = p_competency_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Competency not found' USING ERRCODE = 'P0002';
  END IF;

  INSERT INTO public.competency_questions (competency_id, body, updated_by)
  VALUES (p_competency_id, p_question_text, v_caller)
  RETURNING id, to_jsonb(competency_questions.*) INTO v_new_question_id, v_question_row;

  INSERT INTO public.audit_log (table_name, row_id, action, actor_id, old_values, new_values)
  VALUES ('competency_questions', v_new_question_id, 'insert', v_caller, NULL, v_question_row);

  FOR v_i IN 1..4 LOOP
    INSERT INTO public.question_options (question_id, body, is_correct, sort_order, updated_by)
    VALUES (v_new_question_id, p_options[v_i], (v_i = p_correct_index), v_i - 1, v_caller)
    RETURNING id, to_jsonb(question_options.*) INTO v_new_option_id, v_option_row;

    INSERT INTO public.audit_log (table_name, row_id, action, actor_id, old_values, new_values)
    VALUES ('question_options', v_new_option_id, 'insert', v_caller, NULL, v_option_row);
  END LOOP;

  RETURN v_new_question_id;
END;
$$;

REVOKE ALL ON FUNCTION public.committee_create_question(uuid, text, text[], integer) FROM public;
GRANT EXECUTE ON FUNCTION public.committee_create_question(uuid, text, text[], integer) TO authenticated;

-- ============================================================
-- 7. committee_update_option (REPLACE)
-- ============================================================
-- Now accepts NULL or empty body, but only if the option has at least
-- one live attached media row. Empty/whitespace body is normalized to
-- NULL. Returns the new version number.

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
  v_normalized_body text;
  v_has_media boolean;
BEGIN
  IF v_caller IS NULL THEN
    RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '42501';
  END IF;

  IF NOT (public.auth_is_committee(v_caller) OR public.is_app_admin(v_caller)) THEN
    RAISE EXCEPTION 'Forbidden: committee role required' USING ERRCODE = '42501';
  END IF;

  IF p_sort_order IS NULL OR p_sort_order < 0 THEN
    RAISE EXCEPTION 'sort_order must be a non-negative integer' USING ERRCODE = '22023';
  END IF;

  v_normalized_body := CASE
    WHEN p_body IS NULL OR length(trim(p_body)) = 0 THEN NULL
    ELSE p_body
  END;

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

  -- If body is going NULL, verify at least one live media is attached.
  IF v_normalized_body IS NULL THEN
    SELECT EXISTS (
      SELECT 1 FROM public.question_media
      WHERE option_id = p_id AND deleted_at IS NULL
    ) INTO v_has_media;

    IF NOT v_has_media THEN
      RAISE EXCEPTION 'Option body cannot be empty when no media is attached. Attach media first or provide a non-empty body.'
        USING ERRCODE = 'P0001';
    END IF;
  END IF;

  UPDATE public.question_options
     SET body = v_normalized_body,
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

-- ============================================================
-- 8. committee_add_option (REPLACE)
-- ============================================================
-- Accepts NULL or empty body. Empty/whitespace is normalized to NULL.
-- The "half-built option" window (NULL body, no media yet) is bounded
-- by trainee-read RLS, which hides such options. Frontend is
-- responsible for attaching media in a follow-up call.

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
  v_normalized_body text;
BEGIN
  IF v_caller IS NULL THEN
    RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '42501';
  END IF;

  IF NOT (public.auth_is_committee(v_caller) OR public.is_app_admin(v_caller)) THEN
    RAISE EXCEPTION 'Forbidden: committee role required' USING ERRCODE = '42501';
  END IF;

  IF p_sort_order IS NULL OR p_sort_order < 0 THEN
    RAISE EXCEPTION 'sort_order must be a non-negative integer' USING ERRCODE = '22023';
  END IF;

  v_normalized_body := CASE
    WHEN p_body IS NULL OR length(trim(p_body)) = 0 THEN NULL
    ELSE p_body
  END;

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
  VALUES (p_question_id, v_normalized_body, false, p_sort_order, v_caller)
  RETURNING id, to_jsonb(question_options.*) INTO v_new_id, v_new;

  INSERT INTO public.audit_log (table_name, row_id, action, actor_id, old_values, new_values)
  VALUES ('question_options', v_new_id, 'insert', v_caller, NULL, v_new);

  RETURN v_new_id;
END;
$$;

REVOKE ALL ON FUNCTION public.committee_add_option(uuid, text, integer) FROM public;
GRANT EXECUTE ON FUNCTION public.committee_add_option(uuid, text, integer) TO authenticated;

-- ============================================================
-- 9. committee_delete_question (REPLACE: cascade to media)
-- ============================================================
-- In addition to cascading to options (from 0029), now also cascades to:
--   - live media attached directly to the question
--   - live media attached to each of the question's live options
-- Every cascaded soft-delete gets its own audit_log entry.

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
  v_media RECORD;
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

  -- Soft-delete the question.
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

  -- Cascade: live media on the question.
  FOR v_media IN
    SELECT id, to_jsonb(qm.*) AS old_row
    FROM public.question_media qm
    WHERE qm.question_id = p_id AND qm.deleted_at IS NULL
    FOR UPDATE
  LOOP
    UPDATE public.question_media
       SET deleted_at = now(),
           deleted_by = v_caller,
           version = version + 1,
           updated_at = now(),
           updated_by = v_caller
     WHERE id = v_media.id
    RETURNING to_jsonb(question_media.*) INTO v_new;

    INSERT INTO public.audit_log (table_name, row_id, action, actor_id, old_values, new_values)
    VALUES ('question_media', v_media.id, 'soft_delete', v_caller, v_media.old_row, v_new);
  END LOOP;

  -- Cascade: each live option, and any media on each option.
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

    FOR v_media IN
      SELECT id, to_jsonb(qm.*) AS old_row
      FROM public.question_media qm
      WHERE qm.option_id = v_opt.id AND qm.deleted_at IS NULL
      FOR UPDATE
    LOOP
      UPDATE public.question_media
         SET deleted_at = now(),
             deleted_by = v_caller,
             version = version + 1,
             updated_at = now(),
             updated_by = v_caller
       WHERE id = v_media.id
      RETURNING to_jsonb(question_media.*) INTO v_new;

      INSERT INTO public.audit_log (table_name, row_id, action, actor_id, old_values, new_values)
      VALUES ('question_media', v_media.id, 'soft_delete', v_caller, v_media.old_row, v_new);
    END LOOP;
  END LOOP;
END;
$$;

REVOKE ALL ON FUNCTION public.committee_delete_question(uuid, integer) FROM public;
GRANT EXECUTE ON FUNCTION public.committee_delete_question(uuid, integer) TO authenticated;

-- ============================================================
-- 10. committee_delete_option (REPLACE: cascade to media)
-- ============================================================
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
  v_media RECORD;
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

  -- Soft-delete the option.
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

  -- Cascade: live media on this option.
  FOR v_media IN
    SELECT id, to_jsonb(qm.*) AS old_row
    FROM public.question_media qm
    WHERE qm.option_id = p_id AND qm.deleted_at IS NULL
    FOR UPDATE
  LOOP
    UPDATE public.question_media
       SET deleted_at = now(),
           deleted_by = v_caller,
           version = version + 1,
           updated_at = now(),
           updated_by = v_caller
     WHERE id = v_media.id
    RETURNING to_jsonb(question_media.*) INTO v_new;

    INSERT INTO public.audit_log (table_name, row_id, action, actor_id, old_values, new_values)
    VALUES ('question_media', v_media.id, 'soft_delete', v_caller, v_media.old_row, v_new);
  END LOOP;
END;
$$;

REVOKE ALL ON FUNCTION public.committee_delete_option(uuid, integer) FROM public;
GRANT EXECUTE ON FUNCTION public.committee_delete_option(uuid, integer) TO authenticated;

-- ============================================================
-- 11. committee_attach_media_to_question
-- ============================================================
-- Writes the metadata row. The actual file upload to Supabase Storage
-- happens in the frontend before this RPC is called; this RPC is given
-- the storage_path and file metadata to record.

CREATE OR REPLACE FUNCTION public.committee_attach_media_to_question(
  p_question_id uuid,
  p_storage_path text,
  p_file_name text,
  p_file_type text,
  p_mime_type text,
  p_file_size bigint
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

  IF p_storage_path IS NULL OR length(trim(p_storage_path)) = 0 THEN
    RAISE EXCEPTION 'storage_path cannot be empty' USING ERRCODE = '22023';
  END IF;
  IF p_file_name IS NULL OR length(trim(p_file_name)) = 0 THEN
    RAISE EXCEPTION 'file_name cannot be empty' USING ERRCODE = '22023';
  END IF;
  IF p_file_type IS NULL OR p_file_type NOT IN ('image', 'video') THEN
    RAISE EXCEPTION 'file_type must be image or video' USING ERRCODE = '22023';
  END IF;
  IF p_mime_type IS NULL OR length(trim(p_mime_type)) = 0 THEN
    RAISE EXCEPTION 'mime_type cannot be empty' USING ERRCODE = '22023';
  END IF;
  IF p_file_size IS NULL OR p_file_size <= 0 THEN
    RAISE EXCEPTION 'file_size must be positive' USING ERRCODE = '22023';
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

  INSERT INTO public.question_media (
    question_id, uploaded_by, storage_path, file_name, file_type, mime_type, file_size, updated_by
  )
  VALUES (
    p_question_id, v_caller, p_storage_path, p_file_name, p_file_type, p_mime_type, p_file_size, v_caller
  )
  RETURNING id, to_jsonb(question_media.*) INTO v_new_id, v_new;

  INSERT INTO public.audit_log (table_name, row_id, action, actor_id, old_values, new_values)
  VALUES ('question_media', v_new_id, 'insert', v_caller, NULL, v_new);

  RETURN v_new_id;
END;
$$;

REVOKE ALL ON FUNCTION public.committee_attach_media_to_question(uuid, text, text, text, text, bigint) FROM public;
GRANT EXECUTE ON FUNCTION public.committee_attach_media_to_question(uuid, text, text, text, text, bigint) TO authenticated;

-- ============================================================
-- 12. committee_attach_media_to_option
-- ============================================================
-- Validates the option is live AND its parent question is live before
-- inserting the media row.

CREATE OR REPLACE FUNCTION public.committee_attach_media_to_option(
  p_option_id uuid,
  p_storage_path text,
  p_file_name text,
  p_file_type text,
  p_mime_type text,
  p_file_size bigint
) RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_caller uuid := auth.uid();
  v_new_id uuid;
  v_new jsonb;
  v_opt_deleted timestamptz;
  v_q_deleted timestamptz;
  v_question_id uuid;
BEGIN
  IF v_caller IS NULL THEN
    RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '42501';
  END IF;

  IF NOT (public.auth_is_committee(v_caller) OR public.is_app_admin(v_caller)) THEN
    RAISE EXCEPTION 'Forbidden: committee role required' USING ERRCODE = '42501';
  END IF;

  IF p_storage_path IS NULL OR length(trim(p_storage_path)) = 0 THEN
    RAISE EXCEPTION 'storage_path cannot be empty' USING ERRCODE = '22023';
  END IF;
  IF p_file_name IS NULL OR length(trim(p_file_name)) = 0 THEN
    RAISE EXCEPTION 'file_name cannot be empty' USING ERRCODE = '22023';
  END IF;
  IF p_file_type IS NULL OR p_file_type NOT IN ('image', 'video') THEN
    RAISE EXCEPTION 'file_type must be image or video' USING ERRCODE = '22023';
  END IF;
  IF p_mime_type IS NULL OR length(trim(p_mime_type)) = 0 THEN
    RAISE EXCEPTION 'mime_type cannot be empty' USING ERRCODE = '22023';
  END IF;
  IF p_file_size IS NULL OR p_file_size <= 0 THEN
    RAISE EXCEPTION 'file_size must be positive' USING ERRCODE = '22023';
  END IF;

  SELECT deleted_at, question_id INTO v_opt_deleted, v_question_id
  FROM public.question_options
  WHERE id = p_option_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Option not found' USING ERRCODE = 'P0002';
  END IF;

  IF v_opt_deleted IS NOT NULL THEN
    RAISE EXCEPTION 'Option is deleted' USING ERRCODE = 'P0001';
  END IF;

  SELECT deleted_at INTO v_q_deleted
  FROM public.competency_questions
  WHERE id = v_question_id;

  IF v_q_deleted IS NOT NULL THEN
    RAISE EXCEPTION 'Parent question is deleted' USING ERRCODE = 'P0001';
  END IF;

  INSERT INTO public.question_media (
    option_id, uploaded_by, storage_path, file_name, file_type, mime_type, file_size, updated_by
  )
  VALUES (
    p_option_id, v_caller, p_storage_path, p_file_name, p_file_type, p_mime_type, p_file_size, v_caller
  )
  RETURNING id, to_jsonb(question_media.*) INTO v_new_id, v_new;

  INSERT INTO public.audit_log (table_name, row_id, action, actor_id, old_values, new_values)
  VALUES ('question_media', v_new_id, 'insert', v_caller, NULL, v_new);

  RETURN v_new_id;
END;
$$;

REVOKE ALL ON FUNCTION public.committee_attach_media_to_option(uuid, text, text, text, text, bigint) FROM public;
GRANT EXECUTE ON FUNCTION public.committee_attach_media_to_option(uuid, text, text, text, text, bigint) TO authenticated;

-- ============================================================
-- 13. committee_delete_media
-- ============================================================
-- Blocks deletion of the last live media on an option whose body is
-- NULL, since that would leave a trainee-unreadable option. The error
-- message tells the caller exactly what they need to do (add a label
-- or delete the option entirely).

CREATE OR REPLACE FUNCTION public.committee_delete_media(
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
  v_option_id uuid;
  v_opt_body text;
  v_other_media_count integer;
BEGIN
  IF v_caller IS NULL THEN
    RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '42501';
  END IF;

  IF NOT (public.auth_is_committee(v_caller) OR public.is_app_admin(v_caller)) THEN
    RAISE EXCEPTION 'Forbidden: committee role required' USING ERRCODE = '42501';
  END IF;

  SELECT version, deleted_at, option_id, to_jsonb(qm.*)
    INTO v_current_version, v_deleted_at, v_option_id, v_old
  FROM public.question_media qm
  WHERE id = p_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Media not found' USING ERRCODE = 'P0002';
  END IF;

  IF v_deleted_at IS NOT NULL THEN
    RAISE EXCEPTION 'Media already deleted' USING ERRCODE = 'P0001';
  END IF;

  IF v_current_version <> p_expected_version THEN
    RAISE EXCEPTION 'Version mismatch: expected %, got %.',
      p_expected_version, v_current_version USING ERRCODE = 'P0001';
  END IF;

  -- Last-media-on-NULL-body-option protection.
  IF v_option_id IS NOT NULL THEN
    SELECT body INTO v_opt_body
    FROM public.question_options
    WHERE id = v_option_id;

    IF v_opt_body IS NULL THEN
      SELECT count(*) INTO v_other_media_count
      FROM public.question_media
      WHERE option_id = v_option_id
        AND deleted_at IS NULL
        AND id <> p_id;

      IF v_other_media_count = 0 THEN
        RAISE EXCEPTION 'Cannot delete the last media on an option with no text. Add an option label first, or delete the option entirely.'
          USING ERRCODE = 'P0001';
      END IF;
    END IF;
  END IF;

  UPDATE public.question_media
     SET deleted_at = now(),
         deleted_by = v_caller,
         version = version + 1,
         updated_at = now(),
         updated_by = v_caller
   WHERE id = p_id
  RETURNING to_jsonb(question_media.*) INTO v_new;

  INSERT INTO public.audit_log (table_name, row_id, action, actor_id, old_values, new_values)
  VALUES ('question_media', p_id, 'soft_delete', v_caller, v_old, v_new);
END;
$$;

REVOKE ALL ON FUNCTION public.committee_delete_media(uuid, integer) FROM public;
GRANT EXECUTE ON FUNCTION public.committee_delete_media(uuid, integer) TO authenticated;

COMMIT;