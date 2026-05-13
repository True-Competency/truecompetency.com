-- Migration: 0028_drop_duplicate_indexes
-- Date: 2026-05-13
-- Purpose: Drop redundant indexes and duplicate UNIQUE constraints
--          that accumulated across earlier migrations. Each dropped
--          item is functionally covered by a remaining index or
--          constraint - no uniqueness guarantees or query patterns
--          are weakened by this migration.
-- Author: @novruzoff
--
-- No frontend changes. No behavioral change. Reduces write overhead
-- on affected tables (every INSERT/UPDATE/DELETE previously had to
-- update redundant indexes).

-- committee_votes: drop standalone duplicate index and one of two
-- duplicate UNIQUE constraints on (stage_id, voter_id). The remaining
-- constraint, committee_votes_unique_voter_per_stage, enforces the
-- same uniqueness.
DROP INDEX IF EXISTS public.uq_votes_stage_voter;
ALTER TABLE public.committee_votes
  DROP CONSTRAINT IF EXISTS committee_votes_stage_id_voter_id_key;

-- competencies: drop duplicate PK-shaped index and duplicate
-- case-insensitive name index. The real PK (ic_competency_pkey)
-- and the kept case-insensitive index (idx_competencies_name_unique)
-- continue to enforce uniqueness.
DROP INDEX IF EXISTS public.competencies_pkey;
DROP INDEX IF EXISTS public.ux_competencies_lower_name;

-- competency_assignments: drop duplicate UNIQUE constraint (the PK
-- already enforces uniqueness on the same columns) and two pairs of
-- duplicate per-column indexes.
ALTER TABLE public.competency_assignments
  DROP CONSTRAINT IF EXISTS competency_assignments_unique;
DROP INDEX IF EXISTS public.idx_ca_comp;
DROP INDEX IF EXISTS public.idx_comp_assign_comp;
DROP INDEX IF EXISTS public.idx_ca_student;
DROP INDEX IF EXISTS public.idx_comp_assign_student;

-- competency_questions: drop duplicate competency_id index.
DROP INDEX IF EXISTS public.idx_qs_comp;

-- profiles: drop duplicate case-insensitive email index. The kept
-- ux_profiles_email enforces the same case-insensitive uniqueness.
DROP INDEX IF EXISTS public.idx_profiles_email_lower;

-- student_answers: drop duplicate UNIQUE constraint and per-column
-- index duplicates. The PK enforces the same composite uniqueness;
-- one index per column remains for query performance.
ALTER TABLE public.student_answers
  DROP CONSTRAINT IF EXISTS student_answers_unique;
DROP INDEX IF EXISTS public.idx_ans_q;
DROP INDEX IF EXISTS public.idx_ans_student;