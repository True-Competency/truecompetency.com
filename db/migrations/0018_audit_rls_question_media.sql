-- Migration: 0018_audit_rls_question_media
-- Date: 2026-05-13
-- Purpose: Clean up RLS on public.question_media. Replaces a broad
--          read policy with role-scoped reads that match the access
--          pattern on competency_questions, broadens the delete policy
--          so any committee member can delete (not just the uploader),
--          and adds a missing admin-all policy for consistency.
-- Author: @novruzoff
--
-- No frontend changes. All existing call sites that read question_media
-- continue to work: trainees see media for their enrolled competencies,
-- instructors see all, committee sees all, admin sees all. Insert and
-- delete paths are unchanged for committee members.

-- Drop overly-permissive read policy.
-- "Authenticated users can view approved question media" allowed any
-- authenticated user to read media for any live question, regardless
-- of whether they had access to the underlying competency. Replaced
-- below with role-scoped reads matching cq_* policies.
DROP POLICY IF EXISTS "Authenticated users can view approved question media" ON public.question_media;

-- Drop uploader-only delete policy.
-- "Uploader can delete own media" restricted deletes to the original
-- uploader. The product model allows any committee member to manage
-- live question content, including media uploaded by other committee
-- members. Replaced below with qm_committee_delete.
DROP POLICY IF EXISTS "Uploader can delete own media" ON public.question_media;

-- Rename committee insert policy to qm_* convention.
DROP POLICY IF EXISTS "Committee can upload media" ON public.question_media;

CREATE POLICY qm_committee_insert
  ON public.question_media
  FOR INSERT
  TO authenticated
  WITH CHECK (
    uploaded_by = auth.uid()
    AND EXISTS (
      SELECT 1
      FROM public.profiles
      WHERE profiles.id = auth.uid()
        AND profiles.role = 'committee'::user_role
    )
  );

-- Admin-all policy for consistency with other tables.
CREATE POLICY qm_admin_all
  ON public.question_media
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

-- Committee read - any committee member reads all media.
-- Mirrors cq_committee_read on competency_questions.
CREATE POLICY qm_committee_read
  ON public.question_media
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

-- Instructor read - all instructors read all media.
-- Mirrors cq_instructor_read_all on competency_questions.
CREATE POLICY qm_instructor_read_all
  ON public.question_media
  FOR SELECT
  TO authenticated
  USING (
    public.auth_is_instructor(auth.uid())
  );

-- Trainee read - trainees read media only for questions in competencies
-- they are assigned to. Mirrors cq_trainee_read_enrolled on
-- competency_questions by joining through competency_questions to find
-- the competency.
CREATE POLICY qm_trainee_read_enrolled
  ON public.question_media
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.competency_questions q
      JOIN public.competency_assignments ca
        ON ca.competency_id = q.competency_id
      WHERE q.id = question_media.question_id
        AND ca.student_id = auth.uid()
    )
  );

-- Committee delete - any committee member can delete any media,
-- not just the uploader. Matches the product model where all committee
-- members can manage live question content.
CREATE POLICY qm_committee_delete
  ON public.question_media
  FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.profiles p
      WHERE p.id = auth.uid()
        AND p.role = 'committee'::user_role
    )
  );