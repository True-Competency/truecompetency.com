-- Migration: 0017_audit_rls_student_competency_overrides
-- Date: 2026-05-13
-- Purpose: Clean up RLS on public.student_competency_overrides. Drops a
--          dead qual = true policy and adds a missing admin-all policy
--          for consistency with the rest of the schema.
-- Author: @novruzoff
--
-- No frontend changes. The frontend does not read this table directly -
-- overrides are surfaced through student_competency_progress (a view).
-- Writes happen exclusively through instructor_mark_competency_complete
-- (SECURITY DEFINER), so no INSERT/UPDATE/DELETE policies are needed for
-- non-admin roles.

-- Drop the dead "qual = true" policy.
-- No frontend code reads this table directly, so the broad read access
-- is unused.
DROP POLICY IF EXISTS "read overrides for leaderboard" ON public.student_competency_overrides;

-- Add admin-all policy for consistency with other tables. Allows admins
-- to read and modify overrides directly via SQL editor if needed for
-- data fixes. Admin SELECT was already covered by sco_read_for_instructors
-- but write access required.
CREATE POLICY sco_admin_all
  ON public.student_competency_overrides
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