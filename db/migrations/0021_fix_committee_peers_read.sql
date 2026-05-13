-- Migration: 0020_fix_committee_peers_read
-- Date: 2026-05-13
-- Purpose: Restore committee members' ability to read each other's
--          profiles after migration 0012 dropped the broad PII policy.
--          The previous attempt (in the original 0012 draft) used an
--          inline subquery against profiles which caused infinite
--          recursion. This version uses a SECURITY DEFINER helper to
--          break the recursion, mirroring the auth_is_instructor pattern.
-- Author: @novruzoff
--
-- Affects /committee/members (committee directory) and committee vote
-- tally displays on /committee/review-queue/competencies, both of
-- which were broken on production after 0012 shipped.

-- SECURITY DEFINER helper. Returns true if the given user is a committee
-- member. Bypasses RLS on profiles (definer-rights), avoiding the
-- recursion that broke the inline-subquery version of this check.
CREATE OR REPLACE FUNCTION public.auth_is_committee(uid uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT EXISTS (
    SELECT 1
    FROM public.profiles p
    WHERE p.id = uid
      AND p.role = 'committee'::user_role
  );
$function$;

-- Allow committee members to read other committee members' profiles.
-- Uses the SECURITY DEFINER helper to check the caller's role without
-- triggering RLS recursion on profiles.
CREATE POLICY prof_select_committee_peers
  ON public.profiles
  FOR SELECT
  TO authenticated
  USING (
    role = 'committee'::user_role
    AND public.auth_is_committee(auth.uid())
  );