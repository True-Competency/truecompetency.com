-- Migration: 0016_audit_rls_student_answers
-- Date: 2026-05-13
-- Purpose: Clean up RLS on public.student_answers. Drops a duplicate
--          admin-all policy, four per-command trainee policies redundant
--          with the existing trainee FOR ALL policy, a duplicate
--          trainee-read policy, a duplicate instructor-read policy, and
--          a dead qual = true policy. Renames remaining policies to the
--          sa_* convention used by sa_read_for_instructors.
-- Author: @novruzoff
--
-- No frontend changes. All call sites of student_answers are either
-- trainee-own writes/reads, instructor reads, or admin operations -
-- all covered by the remaining policies.

-- Drop duplicate admin-all policy.
DROP POLICY IF EXISTS "admin full access - student_answers all" ON public.student_answers;

-- Drop per-command trainee policies. The students_manage_their_answers
-- policy (renamed below to sa_trainee_manage_own) covers ALL operations
-- on the trainee's own rows.
DROP POLICY IF EXISTS "trainee delete own answers" ON public.student_answers;
DROP POLICY IF EXISTS "trainee insert own answers" ON public.student_answers;
DROP POLICY IF EXISTS "trainee update own answers" ON public.student_answers;
DROP POLICY IF EXISTS "trainee read own answers" ON public.student_answers;

-- Drop duplicate trainee-read policy.
-- sa_read_own had identical effect to students_manage_their_answers SELECT.
DROP POLICY IF EXISTS sa_read_own ON public.student_answers;

-- Drop duplicate instructor-read policy.
-- sa_read_for_instructors covers the same (instructor OR admin).
DROP POLICY IF EXISTS "instructor read all answers" ON public.student_answers;

-- Drop the dead "qual = true" policy.
-- No code path needs cross-user reads of student_answers. All existing
-- call sites are either trainee-own, instructor, or admin.
DROP POLICY IF EXISTS "read answers for leaderboard" ON public.student_answers;

-- Rename remaining policies to the sa_* convention.

DROP POLICY IF EXISTS "admin all - answers" ON public.student_answers;

CREATE POLICY sa_admin_all
  ON public.student_answers
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

DROP POLICY IF EXISTS students_manage_their_answers ON public.student_answers;

CREATE POLICY sa_trainee_manage_own
  ON public.student_answers
  FOR ALL
  TO authenticated
  USING (student_id = auth.uid())
  WITH CHECK (student_id = auth.uid());