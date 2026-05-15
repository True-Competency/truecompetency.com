-- Migration: 0031_fix_qo_trainee_read_recursion
-- Date: 2026-05-15
-- Purpose: Fix infinite recursion in the trainee-side RLS policies for
--          question_options and question_media that was introduced by
--          migration 0030.
-- Author: @novruzoff
--
-- Root cause: the rewritten qo_trainee_read_enrolled policy reads
-- question_media inline via EXISTS to enforce the "body IS NOT NULL OR
-- has media" invariant. The qm_trainee_read_enrolled policy reads
-- question_options inline via EXISTS (for the option_id branch).
-- Reading either table triggers the other's policy, which triggers
-- the first table's policy, which loops. Postgres returns a 500 to
-- PostgREST without a clean error message.
--
-- Fix: extract the media-existence check into a SECURITY DEFINER
-- helper function. Definer functions don't fire RLS on tables they
-- read internally, breaking the cycle. Same pattern as auth_is_committee,
-- auth_is_instructor, and the other auth_* helpers already in the
-- codebase. We add this as a new helper rather than reusing one of
-- those because the predicate is purely data-shape (does this option
-- have live media?), not an auth predicate.
--
-- The qm policy keeps its inline EXISTS on question_options. That
-- direction is fine on its own; the cycle only forms when both
-- directions exist.

BEGIN;

-- ============================================================
-- 1. Helper: _option_has_live_media(p_option_id uuid)
-- ============================================================
-- Returns true if the given option has at least one live attached
-- question_media row. SECURITY DEFINER so it bypasses RLS on
-- question_media internally. STABLE because it doesn't modify data
-- and returns the same value within a single query.
-- The underscore prefix matches the existing convention for internal
-- helpers (_make_full_name).

CREATE OR REPLACE FUNCTION public._option_has_live_media(p_option_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.question_media
    WHERE option_id = p_option_id
      AND deleted_at IS NULL
  );
$$;

REVOKE ALL ON FUNCTION public._option_has_live_media(uuid) FROM public;
GRANT EXECUTE ON FUNCTION public._option_has_live_media(uuid) TO authenticated;


-- ============================================================
-- 2. Replace qo_trainee_read_enrolled to use the helper
-- ============================================================
-- Same semantics as the 0030 version (deleted_at IS NULL, body or
-- media, enrollment), but the media check goes through the helper
-- to break the policy cycle.

DROP POLICY IF EXISTS qo_trainee_read_enrolled ON public.question_options;
CREATE POLICY qo_trainee_read_enrolled
  ON public.question_options
  FOR SELECT
  TO authenticated
  USING (
    deleted_at IS NULL
    AND (
      body IS NOT NULL
      OR public._option_has_live_media(id)
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

COMMIT;