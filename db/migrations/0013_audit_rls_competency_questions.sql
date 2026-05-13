-- Migration: 0013_audit_rls_competency_questions
-- Date: 2026-05-13
-- Purpose: Clean up RLS on public.competency_questions and
--          public.question_options. Drops a broad "qual = true" policy
--          that gave every authenticated user read access to every
--          question regardless of enrollment, drops a redundant admin
--          read policy on question_options, and normalizes policy names
--          to consistent cq_* and qo_* prefixes.
-- Author: @novruzoff
--
-- No frontend changes are required. The dropped "read questions for
-- leaderboard" policy is not used by any code path - the about page
-- queries question counts using the service-role client (which
-- bypasses RLS), and the leaderboard itself reads from
-- student_competency_progress and profiles, not competency_questions.

-- Drop the dead "qual = true" policy on competency_questions.
-- It allowed any authenticated user to read every row of every question
-- regardless of role or enrollment. The codebase has no remaining caller
-- that depends on this policy.
DROP POLICY IF EXISTS "read questions for leaderboard" ON public.competency_questions;

-- Drop the redundant admin read policy on question_options.
-- qo_admin_read_all checked profiles.role = 'admin' while admin all - options
-- (renamed below to qo_admin_all) uses the app_admins table membership
-- check. The two are kept in sync by the set_admin_role_on_profiles
-- trigger, but having two separate definitions of "admin" on the same
-- table is fragile. qo_admin_all covers SELECT (the ALL command includes
-- SELECT), so qo_admin_read_all adds nothing.
DROP POLICY IF EXISTS qo_admin_read_all ON public.question_options;

-- Rename policies on competency_questions to the cq_* convention.
-- PostgreSQL has no ALTER POLICY ... RENAME, so we drop and recreate.

DROP POLICY IF EXISTS "admin all - questions" ON public.competency_questions;

CREATE POLICY cq_admin_all
  ON public.competency_questions
  FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.app_admins a
      WHERE a.user_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.app_admins a
      WHERE a.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "committee read questions" ON public.competency_questions;

CREATE POLICY cq_committee_read
  ON public.competency_questions
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.profiles p
      WHERE p.id = auth.uid()
        AND p.role = 'committee'::user_role
    )
  );

-- Rename policies on question_options to the qo_* convention.

DROP POLICY IF EXISTS "admin all - options" ON public.question_options;

CREATE POLICY qo_admin_all
  ON public.question_options
  FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.app_admins a
      WHERE a.user_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.app_admins a
      WHERE a.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "committee read options" ON public.question_options;

CREATE POLICY qo_committee_read
  ON public.question_options
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.profiles p
      WHERE p.id = auth.uid()
        AND p.role = 'committee'::user_role
    )
  );