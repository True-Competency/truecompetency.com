// Sentry server-side initialization. Runs in the Node.js runtime on Vercel.
// Imported by instrumentation.ts when NEXT_RUNTIME === "nodejs".

import * as Sentry from "@sentry/nextjs";
import { SupabaseClient } from "@supabase/supabase-js";
import { supabaseIntegration } from "@supabase/sentry-js-integration";

// NEXT_PUBLIC_ENV is accessible on the server too since it's a build-time replacement.
const environment = process.env.NEXT_PUBLIC_ENV ?? "local";
const enabled = environment === "staging" || environment === "production";

Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,

  environment,
  enabled,

  // Same privacy stance as the client.
  sendDefaultPii: false,

  tracesSampleRate: environment === "production" ? 0.1 : 1.0,

  integrations: [
    supabaseIntegration(SupabaseClient, Sentry, {
      tracing: true,
      breadcrumbs: true,
      errors: true,
    }),
  ],

  // Server-side scrubber.
  beforeSend(event) {
    if (event.user) {
      delete event.user.email;
      delete event.user.ip_address;
      delete event.user.username;
    }

    if (event.request?.url) {
      try {
        const url = new URL(event.request.url);
        url.search = "";
        event.request.url = url.toString();
      } catch {
        // Swallow parse errors.
      }
    }

    if (event.request) {
      delete event.request.cookies;
      delete event.request.data;
      // Strip auth-bearing headers explicitly. Sentry redacts some of these by default but we are explicit.
      if (event.request.headers) {
        delete event.request.headers["cookie"];
        delete event.request.headers["authorization"];
        delete event.request.headers["x-supabase-auth"];
      }
    }

    return event;
  },
});
