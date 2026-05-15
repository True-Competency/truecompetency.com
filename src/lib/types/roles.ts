// Canonical role types. Mirrors the profiles.role and profiles.committee_role
// values in the database.

export type UserRole = "trainee" | "instructor" | "committee" | "admin";
export type CommitteeRole = "editor" | "chief_editor";
