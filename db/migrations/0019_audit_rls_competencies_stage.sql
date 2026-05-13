-- Migration: 0019_audit_rls_competencies_stage
-- Date: 2026-05-13
-- Purpose: Clean up RLS on public.competencies_stage. Tightens the
--          insert policy to require committee role and proper audit
--          attribution. Adds a missing admin-all policy and normalizes
--          naming to cs_* prefix.
-- Author: @novruzoff
--
-- No frontend changes. Existing committee_propose_competency flows
-- already set suggested_by = auth.uid() correctly. UPDATE and DELETE
-- intentionally have no policies - those operations go through
-- SECURITY DEFINER RPCs (committee proposal logic, delete_user_account,
-- and the upcoming competency lifecycle RPCs).

-- Drop the overly-permissive insert policy.
-- The original policy allowed any authenticated user to insert a stage
-- row with suggested_by = NULL, bypassing the audit trail. Also did not
-- restrict to committee role - a trainee could propose competencies.
DROP POLICY IF EXISTS competencies_stage_insert_own ON public.competencies_stage;

-- Drop and recreate the governance read policy with the cs_* prefix.
DROP POLICY IF EXISTS committee_stage_select_governance ON public.competencies_stage;

CREATE POLICY cs_governance_read
  ON public.competencies_stage
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.profiles p
      WHERE p.id = auth.uid()
        AND p.role = ANY (ARRAY['committee'::user_role, 'admin'::user_role])
    )
  );

-- Tightened committee insert policy. Requires the caller to be a
-- committee member and to set suggested_by to their own user id.
-- The previous IS NULL escape hatch is removed.
CREATE POLICY cs_committee_insert
  ON public.competencies_stage
  FOR INSERT
  TO authenticated
  WITH CHECK (
    suggested_by = auth.uid()
    AND EXISTS (
      SELECT 1
      FROM public.profiles p
      WHERE p.id = auth.uid()
        AND p.role = 'committee'::user_role
    )
  );

-- Admin-all policy for consistency with other tables.
CREATE POLICY cs_admin_all
  ON public.competencies_stage
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