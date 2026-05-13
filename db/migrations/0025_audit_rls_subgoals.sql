-- Migration: 0025_audit_rls_subgoals
-- Date: 2026-05-13
-- Purpose: Clean up RLS on public.subgoals. Normalizes policy name to
--          sg_* prefix and adds a missing admin-all policy.
-- Author: @novruzoff
--
-- No frontend changes. Subgoals are part of the fixed competency
-- taxonomy, currently managed manually via SQL Editor. Read access
-- for all authenticated users is unchanged.

DROP POLICY IF EXISTS "subgoals readable by authenticated" ON public.subgoals;

CREATE POLICY sg_read_all_authenticated
  ON public.subgoals
  FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY sg_admin_all
  ON public.subgoals
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