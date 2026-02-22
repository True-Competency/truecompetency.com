-- Fix question_media.stage_id foreign key target.
-- It must reference staged QUESTIONS, not staged COMPETENCIES.

ALTER TABLE public.question_media
  DROP CONSTRAINT IF EXISTS question_media_stage_id_fkey;

ALTER TABLE public.question_media
  ADD CONSTRAINT question_media_stage_id_fkey
  FOREIGN KEY (stage_id)
  REFERENCES public.competency_questions_stage(id)
  ON DELETE CASCADE;

