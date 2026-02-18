// src/lib/ensureProfile.ts
import type { SupabaseClient } from "@supabase/supabase-js";

export type AppRole = "trainee" | "instructor" | "committee" | "admin";
export type CommitteeRole = "editor" | "chief_editor";

/**
 * Ensure a row exists in public.profiles for the current auth user.
 *
 * Behavior:
 * - If a profile exists, it will NOT be downgraded. If the user is an admin (in public.app_admins),
 *   the profile.role is promoted to "admin".
 * - If a profile does not exist, it is created using the best-available data from:
 *   1) app_admins (forces "admin")
 *   2) auth.user.user_metadata.role
 *   3) function argument `role`
 *   4) default "trainee"
 * - On first creation (and on existing profiles missing values), enrich with metadata for:
 *   first_name, last_name, full_name, email, country_code, country_name, university, hospital.
 */
export async function ensureProfile(
  supabase: SupabaseClient,
  role?: AppRole
) {
  // Who am I?
  const { data: u, error: uErr } = await supabase.auth.getUser();
  if (uErr) throw uErr;
  if (!u.user) return null;

  const userId = u.user.id;
  const userEmail = u.user.email ?? null;

  // Helpers to safely read string-ish metadata
  const md = (u.user.user_metadata ?? {}) as Record<string, unknown>;
  const getStr = (v: unknown): string | null =>
    typeof v === "string" && v.trim().length > 0 ? v.trim() : null;

  const mdFirst = getStr(md.first_name);
  const mdLast = getStr(md.last_name);
  const mdFull =
    getStr([mdFirst ?? "", mdLast ?? ""].join(" ").trim()) ??
    getStr(md.full_name);
  const mdRoleRaw = getStr(md.role);
  const mdRole: Exclude<AppRole, "admin"> | null =
    mdRoleRaw === "trainee" ||
    mdRoleRaw === "instructor" ||
    mdRoleRaw === "committee"
      ? mdRoleRaw
      : null;
  const mdCountryCode = getStr(md.country_code)?.toUpperCase() ?? null; // keep upper for CHECK
  const mdCountryName = getStr(md.country_name);
  const mdUniversity = getStr(md.university);
  const mdHospital = getStr(md.hospital);
  const mdCommitteeRoleRaw = getStr(md.committee_role);
  const mdCommitteeRole: CommitteeRole | null =
    mdCommitteeRoleRaw === "editor" || mdCommitteeRoleRaw === "chief_editor"
      ? mdCommitteeRoleRaw
      : null;

  // Is this user an admin (from server-controlled table)?
  const { data: adminRow, error: adminErr } = await supabase
    .from("app_admins")
    .select("user_id")
    .eq("user_id", userId)
    .maybeSingle();
  if (adminErr) throw adminErr;
  const isAdmin = !!adminRow;

  // Attempt to load existing profile
  const { data: existing, error: selErr } = await supabase
    .from("profiles")
    .select(
      "id, email, full_name, first_name, last_name, role, committee_role, country_code, country_name, university, hospital, created_at"
    )
    .eq("id", userId)
    .maybeSingle();
  if (selErr) throw selErr;

  // Decide role: admin trumps everything, else metadata -> argument -> default "trainee"
  const desiredRole: AppRole = (isAdmin ? "admin" : mdRole) ?? role ?? "trainee";

  if (existing) {
    // No downgrades; only promote to admin if needed or enrich missing fields.
    const updates: {
      role?: AppRole;
      email?: string | null;
      first_name?: string | null;
      last_name?: string | null;
      full_name?: string | null;
      country_code?: string | null;
      country_name?: string | null;
      university?: string | null;
      hospital?: string | null;
      committee_role?: CommitteeRole | null;
    } = {};

    // Promote to admin if applicable
    if (desiredRole === "admin" && existing.role !== "admin") {
      updates.role = "admin";
    }

    // Enrich missing basics
    if (!existing.email && userEmail) updates.email = userEmail;
    if (!existing.first_name && mdFirst) updates.first_name = mdFirst;
    if (!existing.last_name && mdLast) updates.last_name = mdLast;
    if (!existing.full_name && (mdFull || (mdFirst || mdLast))) {
      updates.full_name = mdFull ?? ([mdFirst ?? "", mdLast ?? ""].join(" ").trim() || null);
    }

    // Enrich optional location/org data if absent
    if (!existing.country_code && mdCountryCode) updates.country_code = mdCountryCode;
    if (!existing.country_name && mdCountryName) updates.country_name = mdCountryName;
    if (!existing.university && mdUniversity) updates.university = mdUniversity;
    if (!existing.hospital && mdHospital) updates.hospital = mdHospital;
    if (
      desiredRole === "committee" &&
      !existing.committee_role &&
      (mdCommitteeRole || "editor")
    ) {
      updates.committee_role = mdCommitteeRole ?? "editor";
    }

    if (Object.keys(updates).length > 0) {
      const { error: updErr } = await supabase
        .from("profiles")
        .update(updates)
        .eq("id", userId);
      if (updErr) throw updErr;

      const { data: refreshed, error: refErr } = await supabase
        .from("profiles")
        .select(
          "id, email, full_name, first_name, last_name, role, committee_role, country_code, country_name, university, hospital, created_at"
        )
        .eq("id", userId)
        .single();
      if (refErr) throw refErr;
      return refreshed;
    }

    return existing;
  }

  // Create new profile
  const insertRow = {
    id: userId,
    email: userEmail,
    first_name: mdFirst,
    last_name: mdLast,
    full_name: mdFull ?? (([mdFirst ?? "", mdLast ?? ""].join(" ").trim()) || null),
    role: desiredRole,
    country_code: mdCountryCode,
    country_name: mdCountryName,
    university: desiredRole === "trainee" ? mdUniversity : mdUniversity ?? null,
    hospital: desiredRole === "instructor" ? mdHospital : mdHospital ?? null,
    committee_role:
      desiredRole === "committee" ? (mdCommitteeRole ?? "editor") : null,
  };

  const { error: insErr } = await supabase.from("profiles").insert(insertRow);
  if (insErr) throw insErr;

  const { data: prof, error: afterSelErr } = await supabase
    .from("profiles")
    .select(
      "id, email, full_name, first_name, last_name, role, committee_role, country_code, country_name, university, hospital, created_at"
    )
    .eq("id", userId)
    .single();
  if (afterSelErr) throw afterSelErr;

  return prof;
}
