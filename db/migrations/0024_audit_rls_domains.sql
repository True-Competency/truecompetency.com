-- Migration: 0024_audit_rls_domains
-- Date: 2026-05-13
-- Purpose: Clean up RLS on public.domains. Normalizes policy name to
--          dom_* prefix and adds a missing admin-all policy.
-- Author: @novruzoff
--
-- No frontend changes. Domains are a small fixed taxonomy of medical
-- fields, currently managed manually via SQL Editor. Read access for
-- all authenticated users is unchanged.

DROP POLICY IF EXISTS "domains readable by authenticated" ON public.domains;

CREATE POLICY dom_read_all_authenticated
  ON public.domains
  FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY dom_admin_all
  ON public.domains
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