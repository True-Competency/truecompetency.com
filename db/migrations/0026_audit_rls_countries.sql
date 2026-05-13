-- Migration: 0026_audit_rls_countries
-- Date: 2026-05-13
-- Purpose: Clean up RLS on public.countries. Normalizes policy name to
--          co_* prefix and adds a missing admin-all policy. Read access
--          intentionally remains open to public (unauthenticated) role
--          because the signup flow needs the country dropdown before
--          authentication.
-- Author: @novruzoff
--
-- No frontend changes.

DROP POLICY IF EXISTS "Countries are publicly readable" ON public.countries;

CREATE POLICY co_read_public
  ON public.countries
  FOR SELECT
  TO public
  USING (true);

CREATE POLICY co_admin_all
  ON public.countries
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