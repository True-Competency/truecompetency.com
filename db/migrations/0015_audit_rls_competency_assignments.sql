-- Migration: 0015_audit_rls_competency_assignments
-- Date: 2026-05-13
-- Purpose: Clean up RLS on public.competency_assignments. Drops four
--          per-command admin policies that are redundant with the
--          existing admin-all policy, two duplicate read policies for
--          instructor and trainee, and a dead qual = true policy. Renames
--          the remaining admin policy to the ca_* convention used by the
--          other policies on this table.
-- Author: @novruzoff
--
-- No frontend changes. All reads either go through the trainee-own,
-- instructor-all, or admin-all policies. Verified by grepping the
-- codebase for from('competency_assignments') call sites.

-- Drop per-command admin policies. The "admin all - comp_assign" policy
-- (FOR ALL) already covers SELECT, INSERT, UPDATE, and DELETE for admins.
DROP POLICY IF EXISTS "admin full access - ca select" ON public.competency_assignments;
DROP POLICY IF EXISTS "admin full access - ca insert" ON public.competency_assignments;
DROP POLICY IF EXISTS "admin full access - ca update" ON public.competency_assignments;
DROP POLICY IF EXISTS "admin full access - ca delete" ON public.competency_assignments;

-- Drop duplicate instructor-read policy.
-- ca_instructor_read_all covers the same access (admin OR instructor)
-- but admin is already covered separately, so both policies are
-- functionally equivalent for instructor access.
DROP POLICY IF EXISTS "instructor read all assignments" ON public.competency_assignments;

-- Drop duplicate trainee-read policy.
-- ca_trainee_read_own has identical effect.
DROP POLICY IF EXISTS "trainee reads own assignment rows" ON public.competency_assignments;

-- Drop the dead "qual = true" policy.
-- No code path needs cross-user reads of competency_assignments. All
-- existing call sites are either trainee-own, instructor-all, or admin.
DROP POLICY IF EXISTS "read assignments for leaderboard" ON public.competency_assignments;

-- Rename the admin-all policy to the ca_* convention.
DROP POLICY IF EXISTS "admin all - comp_assign" ON public.competency_assignments;

CREATE POLICY ca_admin_all
  ON public.competency_assignments
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