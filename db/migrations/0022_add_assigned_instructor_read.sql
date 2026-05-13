-- Migration: 0022_add_assigned_instructor_read
-- Date: 2026-05-13
-- Purpose: Reintroduce the prof_select_assigned_instructor policy that
--          was removed from migration 0012 for causing infinite
--          recursion. Allows trainees to read profiles of instructors
--          who assigned them competencies. Uses a SECURITY DEFINER
--          helper function to avoid the recursion that broke the
--          original inline subquery version.
-- Author: @novruzoff
--
-- Forward-looking - no current frontend feature requires this policy.
-- Added now to close out the audit-of-0012 thread while the
-- recursion-fix pattern is fresh.

-- SECURITY DEFINER helper. Returns true if instructor_id has assigned
-- at least one competency to trainee_id (via competency_assignments.
-- assigned_by). Bypasses RLS on competency_assignments to avoid the
-- recursion that would occur if the policy queried the table directly.
CREATE OR REPLACE FUNCTION public.auth_has_assigned_instructor(
  trainee_id uuid,
  instructor_id uuid
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT EXISTS (
    SELECT 1
    FROM public.competency_assignments ca
    WHERE ca.student_id = trainee_id
      AND ca.assigned_by = instructor_id
  );
$function$;

-- Allow trainees to read profiles of instructors who assigned them
-- competencies. Uses the SECURITY DEFINER helper to check the
-- relationship without triggering RLS recursion on
-- competency_assignments (which in turn references profiles for its
-- own policies).
CREATE POLICY prof_select_assigned_instructor
  ON public.profiles
  FOR SELECT
  TO authenticated
  USING (
    role = 'instructor'::user_role
    AND public.auth_has_assigned_instructor(auth.uid(), public.profiles.id)
  );