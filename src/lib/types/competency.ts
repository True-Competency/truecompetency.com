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

export type CompetencyRow = {
  id: string;
  name: string;
  difficulty: string | null;
  tags: string[] | null;
  position: number | null;
};

export type ProgressRow = {
  competency_id: string;
  pct: number;
  total_questions: number;
  answered_questions: number;
};

export type DiffFilter = "all" | "beginner" | "intermediate" | "expert";
