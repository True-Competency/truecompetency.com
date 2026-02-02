-- ============================================
-- True Competency — STAGING CLEANUP SCRIPT
-- ============================================
-- PURPOSE:
-- Reset STAGING by removing runtime / progress data
-- while preserving canonical curriculum and governance data.
--
-- ⚠️ NEVER RUN THIS ON PRODUCTION ⚠️
-- ============================================

BEGIN;

-- --------------------------------------------
-- Trainee runtime / progress data
-- --------------------------------------------
TRUNCATE TABLE
  public.student_answers,
  public.student_competency_overrides,
  public.competency_assignments
RESTART IDENTITY CASCADE;

-- --------------------------------------------
-- OPTIONAL: Committee activity cleanup
-- Uncomment ONLY if you want a fully clean staging
-- --------------------------------------------
-- TRUNCATE TABLE
--   public.committee_votes,
--   public.committee_question_votes,
--   public.competencies_stage,
--   public.competency_questions_stage,
--   public.competency_question_options_stage
-- RESTART IDENTITY CASCADE;

COMMIT;

-- --------------------------------------------
-- Optional verification (run manually)
-- --------------------------------------------
-- SELECT
--   (SELECT COUNT(*) FROM public.student_answers) AS student_answers,
--   (SELECT COUNT(*) FROM public.competency_assignments) AS competency_assignments,
--   (SELECT COUNT(*) FROM public.student_competency_overrides) AS overrides;