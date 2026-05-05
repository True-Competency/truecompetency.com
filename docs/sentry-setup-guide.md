# Sentry Error Monitoring — True Competency Setup Guide

This guide takes you from zero to fully wired error monitoring on staging and production, with privacy-safe defaults and authenticated-user context.

**What you get when this is done:**
- Every uncaught error on the client, server, edge, and middleware is captured in Sentry.
- Errors are tagged with `environment` (staging or production) and `role` (trainee, instructor, committee, admin).
- Errors include the user's Supabase ID — but never email, name, IP, cookies, or request bodies.
- Supabase queries appear as spans with breadcrumbs leading up to errors.
- Source maps are uploaded automatically by Vercel so stack traces are readable.
- Local development does not send events to Sentry.

**Estimated time:** 45–75 minutes including verification.

**Branch:** all work happens on a feature branch off `dev`. Merge to `main` only after staging verification passes.

---

## Pre-flight checklist

Do all of these before touching code.

### 1. Create the Sentry account and project

- Sign up at sentry.io.
- **Pick the EU data region** if any of your users are in the EU/UK or you anticipate them. This choice cannot be changed later — it requires creating a new org. For an Azerbaijan-based project with international users, EU is the safer default. Pick US only if you are certain your user base is US-only.
- Create an organization, then create a project. When asked for the platform, choose **Next.js**.
- Copy the **DSN** from the project. You'll need it.
- Note your **org slug** and **project slug** from the Sentry URL: `sentry.io/organizations/<org-slug>/projects/<project-slug>/`.

### 2. Configure Sentry's project-level privacy

In your Sentry project settings:
- Go to **Security & Privacy**.
- Enable **Prevent Storing of IP Addresses**.
- Enable **Data Scrubber** (it should be on by default — confirm).

This is server-side belt-and-suspenders alongside our SDK-level scrubbing.

### 3. Set a spend cap

In Sentry's billing/subscription settings, set a spend cap (or stay on the free tier with no upgrade allowed). Free tier is 5,000 errors per month. With deduplication this is hard to exceed, but a runaway error loop in production should not cost you money.

### 4. Find your Supabase client paths

You weren't sure where these are. Run from your project root:

```bash
grep -r "createBrowserClient" --include="*.ts" --include="*.tsx" -l
grep -r "createServerClient" --include="*.ts" --include="*.tsx" -l
```

The first command finds your **browser client** file. The second finds your **server client** file. They should be in different files. Common locations:
- `lib/supabase/client.ts` and `lib/supabase/server.ts`
- `utils/supabase/client.ts` and `utils/supabase/server.ts`

The import path is the file path with `@/` prefix and without the `.ts` extension. Example: `lib/supabase/client.ts` becomes `@/lib/supabase/client`. Note these two import paths — you'll plug them into Steps 7 and 8 below.

If both come back from the same file, your client/server boundary is mixed and that's a separate concern worth fixing later. For now, you can still proceed with this guide.

### 5. Privacy policy

You said you'll update privacy and terms pages — confirming the disclosure: Sentry processes error telemetry as a sub-processor. PII is scrubbed by the SDK and Sentry's server-side rules, and IP storage is disabled. Make sure the policy update ships in the same release as this code.

### 6. Branch

```bash
git checkout dev
git pull
git checkout -b feat/sentry-error-monitoring
```

All steps below happen on this branch. We merge `dev` to `main` only after staging verification.

---

## Step 1 — Run the Sentry wizard

```bash
npx @sentry/wizard@latest -i nextjs
```

The wizard will:
- Install `@sentry/nextjs`.
- Ask you to log into Sentry, then pick the org and project you created.
- Create these files: `instrumentation.ts`, `instrumentation-client.ts`, `sentry.server.config.ts`, `sentry.edge.config.ts`, `app/global-error.tsx`.
- Wrap your `next.config.ts` with `withSentryConfig`.
- Create `.env.sentry-build-plugin` containing `SENTRY_AUTH_TOKEN`, and add it to `.gitignore`.
- Create `app/sentry-example-page/page.tsx` and `app/api/sentry-example-api/route.ts` for testing.

**Stop here.** Do not commit yet. The wizard's defaults send PII. The next step overwrites them.

---

## Step 2 — Overwrite the three Sentry config files

Replace each of these files **completely** with the content below. The wizard's versions are unsafe for your privacy stance.

### `instrumentation-client.ts`

```ts
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
      tracing: true,      // Spans for queries and auth calls.
      breadcrumbs: true,  // Breadcrumb per query so we can see what led up to an error.
      errors: true,       // Forward Supabase-returned errors as captured exceptions.
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
```

### `sentry.server.config.ts`

```ts
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
```

### `sentry.edge.config.ts`

```ts
// Sentry edge-runtime initialization. Runs in middleware and edge route handlers on Vercel.
// Imported by instrumentation.ts when NEXT_RUNTIME === "edge".

import * as Sentry from "@sentry/nextjs";
import { SupabaseClient } from "@supabase/supabase-js";
import { supabaseIntegration } from "@supabase/sentry-js-integration";

const environment = process.env.NEXT_PUBLIC_ENV ?? "local";
const enabled = environment === "staging" || environment === "production";

Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,

  environment,
  enabled,

  sendDefaultPii: false,

  tracesSampleRate: environment === "production" ? 0.1 : 1.0,

  integrations: [
    supabaseIntegration(SupabaseClient, Sentry, {
      tracing: true,
      breadcrumbs: true,
      errors: true,
    }),
  ],

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
      if (event.request.headers) {
        delete event.request.headers["cookie"];
        delete event.request.headers["authorization"];
        delete event.request.headers["x-supabase-auth"];
      }
    }

    return event;
  },
});
```

### `instrumentation.ts` and `app/global-error.tsx`

The wizard's defaults for these two files are fine. Open them, confirm they match what the Sentry docs show, and leave them alone.

---

## Step 3 — Verify `next.config.ts`

The wizard wraps your existing config with `withSentryConfig`. Open `next.config.ts` and confirm the bottom of the file looks like this. **Replace `YOUR_ORG_SLUG` and `YOUR_PROJECT_SLUG` with your actual Sentry slugs from pre-flight Step 1.**

```ts
import { withSentryConfig } from "@sentry/nextjs";
// ... your other imports

const nextConfig: NextConfig = {
  // ... your existing config, untouched
};

export default withSentryConfig(nextConfig, {
  // Your Sentry org slug from the Sentry URL.
  org: "YOUR_ORG_SLUG",

  // Your Sentry project slug from the Sentry URL.
  project: "YOUR_PROJECT_SLUG",

  // Suppress source map upload logs except in CI.
  silent: !process.env.CI,

  // Tunnel Sentry requests through our own domain to bypass ad blockers that block sentry.io.
  // Reports route through /monitoring-tunnel on our domain instead of directly to Sentry.
  tunnelRoute: "/monitoring-tunnel",

  // Source maps are uploaded to Sentry but should not be served from our origin.
  hideSourceMaps: true,

  // Disable Sentry's logger statements in production bundles to reduce bundle size.
  disableLogger: true,
});
```

---

## Step 4 — Install the Supabase-Sentry community integration

```bash
npm install @supabase/sentry-js-integration
```

This is the package that powers the `supabaseIntegration` import we added to all three configs in Step 2. The integration patches the `SupabaseClient` class prototype, so every client — browser singleton, per-request server clients, edge clients — gets instrumented automatically. The package bundled in `@sentry/nextjs` requires an instance and doesn't fit SSR cleanly.

---

## Step 5 — Create the user-context helper

Create **`lib/sentry/user-context.ts`**:

```ts
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
export async function attachUserToSentry(supabase: SupabaseClient): Promise<void> {
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

  // Set only the ID. No email, no username.
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
```

---

## Step 6 — Create the client-side auth listener

Create **`components/providers/sentry-auth-listener.tsx`**.

**Before pasting:** replace the import path `@/lib/supabase/client` below with the actual import path you discovered in pre-flight Step 4.

```tsx
// Client-only component that subscribes to Supabase auth state changes
// and pushes the authenticated user into Sentry's scope.
//
// Mounted once near the top of the app tree in app/layout.tsx.
// Renders nothing, only side effects.

"use client";

import { useEffect } from "react";
import { createClient } from "@/lib/supabase/client"; // REPLACE with your actual browser client import path.
import { attachUserToSentry, clearSentryUser } from "@/lib/sentry/user-context";

export function SentryAuthListener() {
  useEffect(() => {
    const supabase = createClient();

    // Run once on mount in case the user is already signed in when the page loads.
    // This covers hard-refresh and initial-load cases where no auth event will fire.
    attachUserToSentry(supabase);

    // Subscribe to future auth state changes for the lifetime of this client.
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event) => {
      // SIGNED_IN fires on login.
      // TOKEN_REFRESHED fires periodically — we re-attach so the role tag stays fresh
      // in case the user's role was changed mid-session by an admin.
      // USER_UPDATED fires when the user record itself changes.
      if (event === "SIGNED_IN" || event === "TOKEN_REFRESHED" || event === "USER_UPDATED") {
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
```

---

## Step 7 — Mount the listener in the root layout

Open **`app/layout.tsx`** and make two changes.

**Add to imports:**

```tsx
import { SentryAuthListener } from "@/components/providers/sentry-auth-listener";
```

**Inside the root `<body>`, before `{children}`:**

```tsx
<SentryAuthListener />
{children}
```

If you already have an AuthProvider component, you can alternatively move the `useEffect` body from `SentryAuthListener` directly into that provider and skip the separate component. Either approach works.

---

## Step 8 — Wire user context on the server

Server components and route handlers each create their own per-request Supabase client. To attach user context to errors thrown by server code, call the helper at the top of any **authenticated layout** — the layout that already gates access to the trainee/instructor/committee dashboards.

**Before pasting:** replace `@/lib/supabase/server` below with the actual import path you discovered in pre-flight Step 4.

Open your authenticated dashboard layout (likely something like `app/(dashboard)/layout.tsx` or `app/dashboard/layout.tsx`) and add this near the top of the layout component:

```ts
import { createClient } from "@/lib/supabase/server"; // REPLACE with your actual server client import path.
import { attachUserToSentry } from "@/lib/sentry/user-context";

// Inside the async layout/page server component, before rendering children:
const supabase = await createClient();
await attachUserToSentry(supabase);
```

Once attached, any error thrown deeper in the tree during that same request — server component, server action, route handler — gets tagged with the user. You don't need to call this in every individual route.

For unauthenticated routes (login, marketing pages), don't add this. Errors there will be anonymous, which is correct.

---

## Step 9 — Add environment variables

### Local (`.env.local`)

Add this line. You can omit it if you want to keep local dev silent — the SDK is `enabled: false` for `local` anyway, so it's fine either way:

```
NEXT_PUBLIC_SENTRY_DSN=<your DSN from pre-flight Step 1>
```

### Vercel — both staging and production projects

In Vercel project settings → Environment Variables:

- `NEXT_PUBLIC_SENTRY_DSN` — same DSN value, set in both Staging and Production environments. The `environment` field in our config separates them in Sentry's UI.
- `SENTRY_AUTH_TOKEN` — copy the value from your local `.env.sentry-build-plugin` file (the wizard created it). Set in **both** Staging and Production. Mark as **Sensitive**. This is what lets the Vercel build upload source maps to Sentry.

Confirm `.env.sentry-build-plugin` is in `.gitignore`. The wizard adds it automatically — verify before committing.

---

## Step 10 — Verify on staging

1. Commit and push to your feature branch:
   ```bash
   git add .
   git commit -m "feat(observability): add Sentry error monitoring with privacy-safe defaults"
   git push -u origin feat/sentry-error-monitoring
   ```
2. Open a PR to `dev`, merge it, and let Vercel deploy to staging.
3. Sign in to staging with a test account.
4. Visit `https://staging-truecompetency.vercel.app/sentry-example-page` and click the test-error button.
5. Open your Sentry project dashboard.

**You should see within 30–60 seconds:**

- An issue appears in the Issues tab.
- The issue's tag panel shows `environment: staging` and `role: <whatever role your test account has>`.
- The User panel shows an anonymous user with only an `id` field — no email, no IP, no username.
- The Breadcrumbs section shows your most recent navigation events and any Supabase queries leading up to the error.
- The stack trace shows your **original TypeScript source**, not minified JavaScript. If you see minified code, the `SENTRY_AUTH_TOKEN` env var is wrong or missing in Vercel — check the Vercel build log for "Uploading source maps" or errors from the Sentry plugin.

**Also verify:**
- Click into the event payload and confirm there are no cookies, no Authorization headers, no form data, and no query strings on the request URL.

If any of the above is wrong, fix it on the feature branch before continuing. Do not merge to `main` until staging is fully verified.

---

## Step 11 — Cleanup before merging to `main`

The wizard created a deliberate-error page that production users should not be able to hit. Delete it:

```bash
rm -rf app/sentry-example-page
rm -rf app/api/sentry-example-api
```

Commit:

```bash
git add .
git commit -m "chore(observability): remove Sentry example test routes"
git push
```

This matches your dev guide rule: do not keep temporary scripts or test routes in production code.

---

## Step 12 — Promote to production

After staging verification passes and the test routes are removed:

1. Open a PR from `dev` to `main`.
2. Verify the diff one more time — config files, env-var setup, no leftover test routes.
3. Merge.
4. Vercel deploys to production.
5. Spot-check production: log in, do something normal, then check Sentry to confirm production session is tracked under `environment: production`. Real errors will start appearing as users hit them.

---

## Conventional commits reference

If you split commits as you go (recommended for cleaner history and easier rollback):

```
chore(deps): add @sentry/nextjs and run setup wizard
feat(observability): configure Sentry with privacy-safe scrubbing and env separation
chore(deps): add @supabase/sentry-js-integration for SSR-compatible query instrumentation
feat(observability): wire user id and role context into Sentry scope
chore(observability): remove Sentry example test routes
```

If you prefer one squashed commit:

```
feat(observability): add Sentry error monitoring with user context and Supabase tracing
```

---

## What's intentionally NOT in this setup

These are deliberate omissions, not gaps. Add later only if you have a specific need.

- **Session Replay.** Records DOM and user input. Privacy risk even with masking, and you have no current debugging need that justifies it.
- **Custom error boundaries beyond `global-error.tsx`.** The default Next.js error boundary plus Sentry's automatic React error capture covers the common cases. Add per-route `error.tsx` files only when a specific route needs custom recovery UX.
- **Manual `Sentry.captureException` calls.** With automatic instrumentation, uncaught errors are captured for free. Only call `captureException` manually for errors you've intentionally caught and handled but still want visibility into.
- **Alerts and Slack/email integrations.** Configure these in Sentry's UI after you have a week of data and know what your normal error rate looks like. Configuring alerts before that gives you noisy thresholds.

---

## Troubleshooting quick reference

**No errors appearing in Sentry after staging deploy:**
- Verify `NEXT_PUBLIC_SENTRY_DSN` is set in the staging Vercel environment.
- Check the staging deploy's build log for source map upload activity from the Sentry build plugin.
- Browser network tab: confirm requests to `/monitoring-tunnel` are firing when you hit the test page. If those return 404, `tunnelRoute` is misconfigured.
- Check for ad blockers — even with the tunnel, some block requests with "sentry" in the path. Test in incognito with extensions disabled.

**Errors appear but show no user/role:**
- Verify the `SentryAuthListener` is mounted in `app/layout.tsx`.
- Verify the import path in `sentry-auth-listener.tsx` matches your actual browser client.
- Check the browser console — the listener's `attachUserToSentry` call may be erroring silently. Temporarily add a `console.log` inside the helper to confirm execution.

**Stack traces are minified:**
- `SENTRY_AUTH_TOKEN` is missing or wrong in Vercel. Re-copy from `.env.sentry-build-plugin`, set in Vercel, redeploy.

**Build fails after wizard ran:**
- The wizard occasionally double-wraps `next.config.ts`. Open the file and confirm there's exactly one `withSentryConfig(...)` call.
