// Helpers for attaching authenticated-user context to Sentry events.
// We deliberately attach only the Supabase user ID and the role tag.
// We never attach email, name, or any profile field that could identify the user to Sentry.

import * as Sentry from "@sentry/nextjs";
import type { SupabaseClient } from "@supabase/supabase-js";

// Mirrors the profiles.role enum in the database.
export type UserRole = "trainee" | "instructor" | "committee" | "admin";

/**
 * Attach the current authenticated user to Sentry's scope.
 * Errors captured after this call will be tagged with the user ID and role.
 *
 * Pass the Supabase client appropriate to the runtime:
 * - On the client, the browser client from createBrowserClient.
 * - On the server, the per-request server client from createServerClient.
 */
export async function attachUserToSentry(
  supabase: SupabaseClient,
): Promise<void> {
  // getUser hits the Supabase auth server and validates the session.
  // It returns null cleanly when there is no session, so this is safe to call unconditionally.
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  // If the auth call itself failed or there is no user, log a breadcrumb and bail.
  // We do not setUser in this case because we cannot trust the identity.
  if (authError || !user) {
    Sentry.addBreadcrumb({
      category: "auth",
      message: "attachUserToSentry: no authenticated user",
      level: "info",
    });
    return;
  }

  // Set only the ID without email or username.
  Sentry.setUser({ id: user.id });

  // Fetch the role from the profiles table so we can tag errors by role.
  // Role is not PII and lets us filter "all errors hitting Committee role" in the Sentry UI.
  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();

  if (profileError) {
    // If we cannot read the profile, leave the role tag unset rather than guess.
    Sentry.addBreadcrumb({
      category: "auth",
      message: "attachUserToSentry: failed to load profile role",
      level: "warning",
    });
    return;
  }

  if (profile?.role) {
    Sentry.setTag("role", profile.role as UserRole);
  }
}

/**
 * Clear the user from Sentry's scope.
 * Call on sign-out so subsequent errors are not falsely attributed to the previous user.
 */
export function clearSentryUser(): void {
  Sentry.setUser(null);
}
