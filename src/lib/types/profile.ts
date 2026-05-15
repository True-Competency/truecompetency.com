import type { UserRole, CommitteeRole } from "./roles";

/**
 * Canonical Profile shape — mirrors public.profiles in the production DB.
 * For page-specific subsets, use Pick<Profile, ...> or define a named view
 * (e.g. LayoutProfile, ProfileIdentity).
 */
export type Profile = {
  id: string;
  email: string;
  full_name: string | null;
  first_name: string | null;
  last_name: string | null;
  role: UserRole | null;
  committee_role: CommitteeRole | null;
  country_code: string | null;
  country_name: string | null;
  university: string | null;
  hospital: string | null;
  avatar_path: string | null;
  created_at: string | null;
};

/**
 * Profile subset used by layout shells — id, email, names, avatar.
 * Used in admin/instructor layout-client files today.
 */
export type LayoutProfile = Pick<
  Profile,
  "id" | "email" | "full_name" | "first_name" | "last_name" | "avatar_path"
>;

/**
 * Profile subset used by code paths that only need identity + role.
 * E.g. role-based redirects at /, /about.
 */
export type ProfileIdentity = Pick<Profile, "id" | "role">;
