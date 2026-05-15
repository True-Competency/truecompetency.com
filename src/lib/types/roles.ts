// Canonical role types. Mirrors the profiles.role and profiles.committee_role
// values in the database.

export type UserRole = "trainee" | "instructor" | "committee" | "admin";
export type CommitteeRole = "editor" | "chief_editor";

/** Roles available at the self-signup form. Admin cannot self-signup. */
export type SignupRole = Exclude<UserRole, "admin">;
