-- Migration: 0011_drop_question_voting
-- Date: 2026-05-12
-- Purpose: Remove the question-voting workflow. Committees now write
--          questions directly to live competencies instead of proposing
--          them through a staging table with a voting threshold.
--          Drops three RPCs, three tables, the now-unused stage_id column
--          and FK on question_media, the staged-media RLS policy, and
--          rewrites delete_user_account to remove references to the
--          dropped tables.
-- Author: @novruzoff
--
-- Pre-flight: target tables verified empty in production before this
-- migration was written:
--   competency_questions_stage:         0 rows
--   competency_question_options_stage:  0 rows
--   committee_question_votes:           0 rows
--   question_media.stage_id:            no rows with non-NULL stage_id
-- No data is lost by this migration.
--
-- Frontend references to the dropped RPCs and tables were removed in the
-- preceding refactor commit on dev (see: refactor(committee): remove
-- question-voting workflow ahead of direct-write model).

-- Drop RPCs first. Function bodies reference the tables.
DROP FUNCTION IF EXISTS public.committee_vote_on_question(uuid, boolean);
DROP FUNCTION IF EXISTS public.committee_propose_question(uuid, text, text[], integer);
DROP FUNCTION IF EXISTS public.committee_submit_question_proposal(uuid, text, jsonb);

-- Drop the staged-media RLS policy that depends on stage_id.
-- With staged questions removed, governance has nothing to view via
-- this code path; the policy has no purpose in the new model.
DROP POLICY IF EXISTS "Governance can view staged question media" ON public.question_media;

-- Drop the stage_id FK on question_media before dropping the referenced
-- table. The FK is dropped explicitly rather than via CASCADE so the
-- migration record is unambiguous about what's being removed.
ALTER TABLE public.question_media
  DROP CONSTRAINT IF EXISTS question_media_stage_id_fkey;

-- Drop the stage_id column from question_media. With competency_questions_stage
-- gone, the column has no referent and no purpose in the new direct-write model.
ALTER TABLE public.question_media
  DROP COLUMN IF EXISTS stage_id;

-- Drop tables in FK dependency order.
-- committee_question_votes and competency_question_options_stage both
-- reference competency_questions_stage via FK, so they must be dropped
-- before competency_questions_stage itself.
DROP TABLE IF EXISTS public.committee_question_votes;
DROP TABLE IF EXISTS public.competency_question_options_stage;
DROP TABLE IF EXISTS public.competency_questions_stage;

-- Rewrite delete_user_account to remove references to the dropped tables.
CREATE OR REPLACE FUNCTION public.delete_user_account(p_user_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $function$
BEGIN
  -- Verify the calling user is deleting their own account
  IF auth.uid() != p_user_id THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  -- Delete in FK dependency order
  DELETE FROM public.student_answers WHERE student_id = p_user_id;
  DELETE FROM public.competency_assignments WHERE student_id = p_user_id;
  DELETE FROM public.student_competency_overrides WHERE student_id = p_user_id;
  DELETE FROM public.committee_votes WHERE voter_id = p_user_id;
  DELETE FROM public.competencies_stage WHERE suggested_by = p_user_id;
  DELETE FROM public.question_media WHERE uploaded_by = p_user_id;
  DELETE FROM public.profiles WHERE id = p_user_id;
END;
$function$;