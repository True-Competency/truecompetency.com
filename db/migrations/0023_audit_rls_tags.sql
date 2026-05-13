-- Migration: 0023_audit_rls_tags
-- Date: 2026-05-13
-- Purpose: Clean up RLS on public.tags. Normalizes policy names to
--          tg_* prefix and adds a missing admin-all policy.
-- Author: @novruzoff
--
-- No frontend changes. All effective access is unchanged - chair can
-- still insert and delete, all authenticated users can still read,
-- and tag renames continue to go through chair_rename_tag (SECURITY
-- DEFINER, RLS-bypassing).

-- Rename chair delete policy.
DROP POLICY IF EXISTS "Chair can delete tags" ON public.tags;

CREATE POLICY tg_chair_delete
  ON public.tags
  FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.profiles p
      WHERE p.id = auth.uid()
        AND p.role = 'committee'::user_role
        AND p.committee_role = 'chief_editor'
    )
  );

-- Rename chair insert policy.
DROP POLICY IF EXISTS "Chair can create tags" ON public.tags;

CREATE POLICY tg_chair_insert
  ON public.tags
  FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.profiles p
      WHERE p.id = auth.uid()
        AND p.role = 'committee'::user_role
        AND p.committee_role = 'chief_editor'
    )
  );

-- Rename read-all policy.
DROP POLICY IF EXISTS "Authenticated users can read tags" ON public.tags;

CREATE POLICY tg_read_all_authenticated
  ON public.tags
  FOR SELECT
  TO authenticated
  USING (true);

-- Admin-all policy for consistency with other tables.
CREATE POLICY tg_admin_all
  ON public.tags
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