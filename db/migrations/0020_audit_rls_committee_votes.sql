-- Migration: 0020_audit_rls_committee_votes
-- Date: 2026-05-13
-- Purpose: Clean up RLS on public.committee_votes. Splits the existing
--          combined admin-or-committee policies into a dedicated
--          admin-all policy and committee-specific policies, matching
--          the pattern used on other audited tables. Renames to cv_*
--          prefix.
-- Author: @novruzoff
--
-- No frontend changes. The new policies grant identical effective
-- access to all roles - just reorganized into clearer, table-prefixed
-- policies.

-- Drop existing policies.
DROP POLICY IF EXISTS committee_votes_upsert ON public.committee_votes;
DROP POLICY IF EXISTS committee_votes_select ON public.committee_votes;

-- Admin-all policy for consistency with other tables.
CREATE POLICY cv_admin_all
  ON public.committee_votes
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

-- Committee can manage their own vote rows (insert, update, delete).
-- voter_id must match the caller's auth.uid() to prevent voting on
-- behalf of others.
CREATE POLICY cv_committee_manage_own
  ON public.committee_votes
  FOR ALL
  TO authenticated
  USING (
    voter_id = auth.uid()
    AND EXISTS (
      SELECT 1
      FROM public.profiles p
      WHERE p.id = auth.uid()
        AND p.role = 'committee'::user_role
    )
  )
  WITH CHECK (
    voter_id = auth.uid()
    AND EXISTS (
      SELECT 1
      FROM public.profiles p
      WHERE p.id = auth.uid()
        AND p.role = 'committee'::user_role
    )
  );

-- Committee can read all vote rows (for vote tallies and audit views).
CREATE POLICY cv_committee_read_all
  ON public.committee_votes
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