-- Migration: 0027_audit_rls_app_admins
-- Date: 2026-05-13
-- Purpose: Clean up RLS on public.app_admins. Normalizes policy name to
--          aa_* prefix and adds an admin-read-all policy. Intentionally
--          does NOT add INSERT/UPDATE/DELETE policies - admin grants are
--          a privilege boundary that requires direct database access,
--          not RLS-mediated DML.
-- Author: @novruzoff
--
-- No frontend changes.

DROP POLICY IF EXISTS "Users can check own admin status" ON public.app_admins;

CREATE POLICY aa_read_own
  ON public.app_admins
  FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

-- Admin can read all admin rows (to see peer admins). Uses the
-- existing is_app_admin SECURITY DEFINER helper to avoid the recursion
-- that would occur if the policy queried app_admins directly.
-- Note: SELECT only, not FOR ALL. Writes to app_admins must continue
-- to require direct database access as a privilege boundary.
CREATE POLICY aa_admin_read_all
  ON public.app_admins
  FOR SELECT
  TO authenticated
  USING (public.is_app_admin(auth.uid()));