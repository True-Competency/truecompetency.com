-- Migration: 0014_audit_rls_competencies
-- Date: 2026-05-13
-- Purpose: Clean up RLS on public.competencies. Drops duplicate read
--          policies and a redundant committee-read policy. Normalizes
--          remaining policy names to a comp_* prefix and tightens the
--          admin policy to apply to authenticated role only.
-- Author: @novruzoff
--
-- No frontend changes. competencies is read by every role across the
-- platform (trainee catalog, committee management, instructor assignment,
-- admin views, about page). The qual = true read access is intentional
-- and product-required.

-- Drop duplicate read-all policy.
-- "Allow read for all authenticated users" and "public read competencies"
-- had identical effect (qual = true, role authenticated).
DROP POLICY IF EXISTS "Allow read for all authenticated users" ON public.competencies;

-- Drop redundant committee-read policy.
-- Every authenticated user already has SELECT access via the read-all
-- policy. Restricting "committee can read" on top of "everyone can read"
-- adds no protection.
DROP POLICY IF EXISTS "committee read competencies" ON public.competencies;

-- Rename remaining policies to the comp_* convention.

DROP POLICY IF EXISTS "admin all - competencies" ON public.competencies;

CREATE POLICY comp_admin_all
  ON public.competencies
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

DROP POLICY IF EXISTS "public read competencies" ON public.competencies;

CREATE POLICY comp_read_all_authenticated
  ON public.competencies
  FOR SELECT
  TO authenticated
  USING (true);