// Client-only component that subscribes to Supabase auth state changes
// and pushes the authenticated user into Sentry's scope.
//
// Mounted once near the top of the app tree in app/layout.tsx.
// Renders nothing, only side effects.

"use client";

import { useEffect } from "react";
import type { AuthChangeEvent } from "@supabase/supabase-js";
import { supabase } from "@/lib/supabaseClient";
import { attachUserToSentry, clearSentryUser } from "@/lib/sentry/user-context";

export function SentryAuthListener() {
  useEffect(() => {
    // Run once on mount in case the user is already signed in when the page loads.
    // This covers hard-refresh and initial-load cases where no auth event will fire.
    attachUserToSentry(supabase);

    // Subscribe to future auth state changes for the lifetime of this client.
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event: AuthChangeEvent) => {
      // SIGNED_IN fires on login.
      // TOKEN_REFRESHED fires periodically — we re-attach so the role tag stays fresh
      // in case the user's role was changed mid-session by an admin.
      // USER_UPDATED fires when the user record itself changes.
      if (
        event === "SIGNED_IN" ||
        event === "TOKEN_REFRESHED" ||
        event === "USER_UPDATED"
      ) {
        attachUserToSentry(supabase);
        return;
      }

      // SIGNED_OUT clears the scope so subsequent anonymous errors are not attributed to the previous user.
      if (event === "SIGNED_OUT") {
        clearSentryUser();
      }
    });

    // Clean up the subscription if this component ever unmounts.
    return () => {
      subscription.unsubscribe();
    };
  }, []);

  // Renders nothing.
  return null;
}
