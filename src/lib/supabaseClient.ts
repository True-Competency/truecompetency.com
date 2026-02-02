// src/lib/supabaseClient.ts
import { createBrowserClient } from "@supabase/ssr";

/**
 * HARD SAFETY GUARD (non-negotiable default)
 * ------------------------------------------
 * Prevents local/dev/staging from accidentally pointing at PRODUCTION Supabase.
 *
 * To intentionally bypass in an emergency, set:
 *   NEXT_PUBLIC_ALLOW_PROD_SUPABASE=1
 *
 * NOTE: If the production Supabase project ref ever changes, update PROD_SUPABASE_REF.
 */
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const NEXT_PUBLIC_ENV = process.env.NEXT_PUBLIC_ENV ?? "";

const PROD_SUPABASE_REF = "stkwpilbzvzmgrxbsvcx"; // production project ref (update if prod project changes)
const ALLOW_PROD_BYPASS = process.env.NEXT_PUBLIC_ALLOW_PROD_SUPABASE === "0";

if (!ALLOW_PROD_BYPASS) {
  const isNonProdRuntime = process.env.NODE_ENV !== "production";
  const isExplicitlyNonProdEnv = NEXT_PUBLIC_ENV !== "" && NEXT_PUBLIC_ENV !== "production";
  const looksLikeProdSupabase = SUPABASE_URL.includes(`${PROD_SUPABASE_REF}.supabase.co`);

  if ((isNonProdRuntime || isExplicitlyNonProdEnv) && looksLikeProdSupabase) {
    throw new Error(
      "SAFETY STOP: This build is pointing at PRODUCTION Supabase.\n" +
        "Fix your environment variables to use STAGING Supabase.\n" +
        "If you must bypass intentionally, set NEXT_PUBLIC_ALLOW_PROD_SUPABASE=1 (temporary)."
    );
  }
}

export const supabase = createBrowserClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
  },
});