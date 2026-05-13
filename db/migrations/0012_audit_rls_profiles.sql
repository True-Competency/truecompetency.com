-- Migration: 0012_audit_rls_profiles
-- Date: 2026-05-12
-- Purpose: Clean up RLS on public.profiles. Removes duplicate policies
--          that had built up over time, removes a broad "qual = true"
--          policy that leaked PII across all authenticated users, and
--          replaces it with a profiles_public view exposing only safe
--          columns for leaderboard display. Also normalizes the
--          instructor-reads-trainees policy name to the prof_* prefix
--          used by the rest of the policies on this table.
-- Author: @novruzoff
--
-- Frontend changes required AFTER this migration:
--   - src/app/trainee/page.tsx leaderboard query reads from
--     profiles_public instead of profiles.
--
-- Note: an earlier draft of this migration also added two new policies
-- (prof_select_committee_peers and prof_select_assigned_instructor) for
-- future committee-collaboration and trainee-to-instructor contact
-- features. Both caused infinite recursion at runtime and were dropped
-- before this migration was finalized. They are not included here. When
-- those features are actually built, the correct implementation will use
-- SECURITY DEFINER helper functions (following the existing
-- auth_is_instructor pattern) to avoid the recursion.

-- Drop duplicate INSERT policy.
-- prof_insert_own and profiles_insert_own had identical effect.
DROP POLICY IF EXISTS profiles_insert_own ON public.profiles;

-- Drop duplicate UPDATE policy.
-- prof_update_own and profiles_update_own had identical effect.
DROP POLICY IF EXISTS profiles_update_own ON public.profiles;

-- Drop duplicate "read own" SELECT policy.
-- read_own_profile and prof_select_self had identical effect; the only
-- difference was the role (public vs authenticated), but anonymous users
-- have no auth.uid() so the public-role version returned nothing anyway.
DROP POLICY IF EXISTS read_own_profile ON public.profiles;

-- Drop the broad "qual = true" policy that gave every authenticated user
-- read access to every column of every profile (emails, university,
-- hospital, committee_role, etc.). Its only legitimate use was the
-- leaderboard query, which is now served by the profiles_public view
-- created below.
DROP POLICY IF EXISTS "public profile fields readable by trainees" ON public.profiles;

-- Rename the instructor-reads-trainees policy to match the prof_* convention.
-- PostgreSQL has no ALTER POLICY ... RENAME, so we drop and recreate.
DROP POLICY IF EXISTS profiles_instructor_reads_trainees ON public.profiles;

CREATE POLICY prof_select_instructor_reads_trainees
  ON public.profiles
  FOR SELECT
  TO authenticated
  USING (
    role = 'trainee'::user_role
    AND public.auth_is_instructor(auth.uid())
  );

-- profiles_public view. Exposes only the columns needed for displaying
-- users in lists where contact info is not appropriate (leaderboards,
-- public-facing aggregates). Reads from this view do not expose email,
-- university, hospital, committee_role, or any other sensitive field.
CREATE OR REPLACE VIEW public.profiles_public AS
SELECT
  id,
  full_name,
  first_name,
  last_name,
  country_name,
  country_code,
  role
FROM public.profiles;

-- The view runs with the privileges of the view owner (postgres) so it
-- bypasses RLS on the underlying profiles table. Access control is
-- enforced by the column list above, not by RLS. Do not widen this
-- column list without redesigning the access pattern.
ALTER VIEW public.profiles_public SET (security_invoker = false);

GRANT SELECT ON public.profiles_public TO authenticated;