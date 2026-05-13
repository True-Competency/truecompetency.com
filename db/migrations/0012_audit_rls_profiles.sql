-- Migration: 0012_audit_rls_profiles
-- Date: 2026-05-12
-- Purpose: Clean up RLS on public.profiles. Removes duplicate policies
--          that have built up over time, removes a broad "qual = true"
--          policy that leaked PII across all authenticated users, and
--          replaces it with a public-fields view plus targeted
--          per-relationship read policies. Also normalizes policy names
--          to a consistent prof_* prefix.
-- Author: @novruzoff
--
-- Frontend changes required AFTER this migration:
--   - src/app/trainee/page.tsx leaderboard query must read from
--     profiles_public instead of profiles. Tracked in a separate commit.

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

-- New: committee members can read other committee members' profiles.
-- Supports collaboration features such as future mailto buttons and
-- proposal discussion threads. Restricted to committee role only -
-- trainees and instructors cannot use this policy to read committee data.
CREATE POLICY prof_select_committee_peers
  ON public.profiles
  FOR SELECT
  TO authenticated
  USING (
    role = 'committee'::user_role
    AND EXISTS (
      SELECT 1
      FROM public.profiles caller
      WHERE caller.id = auth.uid()
        AND caller.role = 'committee'::user_role
    )
  );

-- New: trainees can read profiles of instructors who assigned them
-- competencies. Supports future "contact your instructor" features.
-- The relationship is derived from competency_assignments.assigned_by.
-- Trainees with no instructor-assigned competencies see no instructor
-- profiles via this policy.
CREATE POLICY prof_select_assigned_instructor
  ON public.profiles
  FOR SELECT
  TO authenticated
  USING (
    role = 'instructor'::user_role
    AND EXISTS (
      SELECT 1
      FROM public.competency_assignments ca
      WHERE ca.student_id = auth.uid()
        AND ca.assigned_by = public.profiles.id
    )
  );

-- New: profiles_public view. Exposes only the columns needed for
-- displaying users in lists where contact info is not appropriate
-- (leaderboards, public-facing aggregates). Reads from this view do not
-- expose email, university, hospital, committee_role, or any other
-- sensitive field.
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

-- Grant SELECT on the view to authenticated users. The view inherits RLS
-- from the underlying table by default in PostgreSQL, which would defeat
-- the purpose - so we set it to security_invoker = false so the view
-- runs with the privileges of the view owner (postgres) and bypasses
-- profiles RLS. The view itself exposes only safe columns, so this is
-- the intended behavior.
ALTER VIEW public.profiles_public SET (security_invoker = false);

GRANT SELECT ON public.profiles_public TO authenticated;