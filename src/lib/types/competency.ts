// Canonical row types shared across competency-related pages.

export type TagRow = {
  id: string;
  name: string;
};

// Instructor-side assignment row (full shape).
export type AssignmentRow = {
  student_id: string;
  competency_id: string;
};

// Trainee-side reference: trainees only ever see their own assignments,
// so the student_id is implicit and the row is just the competency reference.
export type TraineeAssignmentRef = {
  competency_id: string;
};

/**
 * Competency difficulty levels. Mirrors the CHECK constraint on
 * public.competencies.difficulty in the production DB.
 */
export type CompetencyDifficulty =
  | "Beginner"
  | "Intermediate"
  | "Advanced"
  | "Expert";

/**
 * Canonical Competency shape — mirrors public.competencies in the production DB.
 * The legacy `test_question` column is excluded; it's marked unused in
 * database.md and no frontend code reads it.
 *
 * For page-specific subsets, use Pick<Competency, ...>.
 */
export type Competency = {
  id: string;
  name: string;
  difficulty: CompetencyDifficulty;
  position: number | null;
  tags: string[] | null; // uuid[] in DB, string[] in TS
  subgoal_id: string | null;
  created_at: string;
};

/**
 * CompetencyRaw is now an alias for Competency.
 *
 * Historically this type expressed "tags may be NULL from the DB" before the
 * canonical Competency reflected that nullability. With Competency.tags now
 * typed as `string[] | null` per the DB schema, CompetencyRaw and Competency
 * are equivalent. The alias is kept for migration ergonomics during Tasks 4-5;
 * it will be removed once all call sites use Competency directly.
 *
 * @deprecated Use Competency directly.
 */
export type CompetencyRaw = Competency;

/**
 * The minimal Competency subset used by trainee-side list pages
 * (progress, competencies). Derived from canonical Competency.
 */
export type CompetencyRow = Pick<
  Competency,
  "id" | "name" | "difficulty" | "tags" | "position"
>;

/**
 * Canonical row shape returned by the student_competency_progress view.
 * Mirrors the view's column list.
 *
 * Some call sites only consume a subset (e.g. {competency_id, pct}). Those
 * will use Pick<ProgressRow, ...> in Task 5.
 */
export type ProgressRow = {
  student_id: string;
  competency_id: string;
  total_questions: number;
  answered_questions: number;
  pct: number;
};

export type DiffFilter = "all" | "beginner" | "intermediate" | "expert";
