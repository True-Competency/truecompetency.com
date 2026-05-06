// Sentry client-side initialization. Runs in the user's browser.
// Picked up automatically by Next.js via the instrumentation-client convention.

import * as Sentry from "@sentry/nextjs";
// Class import lets the Supabase integration patch the prototype, instrumenting all clients.
import { SupabaseClient } from "@supabase/supabase-js";
// Community-maintained Sentry integration for Supabase that works correctly with SSR.
import { supabaseIntegration } from "@supabase/sentry-js-integration";

// Read deployment environment from our existing env var. Values: "local", "staging", "production".
const environment = process.env.NEXT_PUBLIC_ENV ?? "local";

// Only send events from staging and production. Local errors should not pollute Sentry.
const enabled = environment === "staging" || environment === "production";

Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,

  // Tag every event with the environment so staging and prod are filterable in the Sentry UI.
  environment,

  // Master switch. When false, the SDK loads but no events are sent.
  enabled,

  // Route browser-side events through our own /monitoring route to bypass ad blockers.
  // This replaces withSentryConfig's tunnelRoute option, which doesn't work with Turbopack production builds.
  tunnel: "/monitoring",

  // Privacy: do not attach IPs, request headers, or cookies to events.
  // This is the opposite of Sentry's default and is intentional for our privacy stance.
  sendDefaultPii: false,

  // Performance tracing sample rate.
  // Staging captures everything for QA; production samples 10% to control quota.
  tracesSampleRate: environment === "production" ? 0.1 : 1.0,

  // Session Replay is intentionally NOT enabled.
  // It records DOM interactions which has PII risk even with masking, and we have no business need for it.

  // Instrument Supabase at the class level so every client (singleton or per-request) is tracked.
  integrations: [
    supabaseIntegration(SupabaseClient, Sentry, {
      tracing: true, // Spans for queries and auth calls.
      breadcrumbs: true, // Breadcrumb per query so we can see what led up to an error.
      errors: true, // Forward Supabase-returned errors as captured exceptions.
    }),
  ],

  // Final scrubber. Runs right before any event is sent. Strips PII that may have slipped through.
  beforeSend(event) {
    if (event.user) {
      delete event.user.email;
      delete event.user.ip_address;
      delete event.user.username;
    }

    // Strip query strings from request URLs since they may contain tokens or user-entered data.
    if (event.request?.url) {
      try {
        const url = new URL(event.request.url);
        url.search = "";
        event.request.url = url.toString();
      } catch {
        // Leave URL unchanged if parsing fails rather than crashing the scrubber.
      }
    }

    // Drop request body and cookies entirely. Form data and session cookies have no place in error reports.
    if (event.request) {
      delete event.request.cookies;
      delete event.request.data;
    }

    return event;
  },
});

// Required by Sentry to instrument App Router client-side navigations.
export const onRouterTransitionStart = Sentry.captureRouterTransitionStart;
