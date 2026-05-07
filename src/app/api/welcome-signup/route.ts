// Server-side committee signup endpoint backing the /welcome page.
// Creates the auth user with email_confirm=true so no verification email is sent —
// the welcome flow exists specifically to bypass enterprise email scanners that
// pre-consume magic links. The on_auth_user_created trigger creates the profile
// from user_metadata.
//
// Security:
// - Service role key (via getSupabaseAdmin) never reaches the browser.
// - role='committee' and committee_role='editor' are hardcoded server-side.
//   Any role-related fields in the request body are ignored.
// - Rate-limited by IP via the shared invitationLimiter.

import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";
import { checkRateLimit, invitationLimiter } from "@/lib/rateLimit";

interface SignupRequestBody {
  email?: unknown;
  password?: unknown;
  first_name?: unknown;
  last_name?: unknown;
  country_code?: unknown;
  country_name?: unknown;
  hospital?: unknown;
}

function readString(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0
    ? value.trim()
    : null;
}

export async function POST(req: NextRequest) {
  const ip =
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
  const rateLimitResult = await checkRateLimit(
    invitationLimiter,
    `welcome-signup:${ip}`,
  );
  if (!rateLimitResult.allowed) {
    return NextResponse.json(
      {
        error: `Too many signup attempts. Please wait ${rateLimitResult.retryAfter} seconds.`,
      },
      { status: 429 },
    );
  }

  let body: SignupRequestBody;
  try {
    body = (await req.json()) as SignupRequestBody;
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  const email = readString(body.email)?.toLowerCase() ?? null;
  const password = typeof body.password === "string" ? body.password : null;
  const firstName = readString(body.first_name);
  const lastName = readString(body.last_name);
  const countryCodeRaw = readString(body.country_code);
  const countryName = readString(body.country_name);
  const hospital = readString(body.hospital);

  if (!email || !/^\S+@\S+\.\S+$/.test(email)) {
    return NextResponse.json(
      { error: "A valid email is required." },
      { status: 400 },
    );
  }
  if (!password || password.length < 8) {
    return NextResponse.json(
      { error: "Password must be at least 8 characters." },
      { status: 400 },
    );
  }
  if (!firstName || !lastName) {
    return NextResponse.json(
      { error: "First and last name are required." },
      { status: 400 },
    );
  }
  const countryCode = countryCodeRaw?.toUpperCase() ?? "";
  if (!/^[A-Z]{2}$/.test(countryCode)) {
    return NextResponse.json(
      { error: "A valid country must be selected." },
      { status: 400 },
    );
  }
  if (!hospital) {
    return NextResponse.json({ error: "Hospital is required." }, { status: 400 });
  }

  const userMetadata = {
    role: "committee",
    committee_role: "editor",
    first_name: firstName,
    last_name: lastName,
    full_name: `${firstName} ${lastName}`,
    country_code: countryCode,
    country_name: countryName,
    hospital,
  };

  try {
    const admin = getSupabaseAdmin();
    const { data, error } = await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: userMetadata,
    });

    if (error) {
      if (error.message.toLowerCase().includes("already")) {
        return NextResponse.json(
          {
            error:
              "An account with this email already exists. Please sign in instead.",
          },
          { status: 409 },
        );
      }
      console.error("[welcome-signup] createUser failed:", error);
      return NextResponse.json(
        { error: "Account creation failed. Please try again." },
        { status: 500 },
      );
    }

    if (!data.user) {
      console.error(
        "[welcome-signup] createUser returned no user without error",
      );
      return NextResponse.json(
        { error: "Account creation failed. Please try again." },
        { status: 500 },
      );
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[welcome-signup] unexpected error:", err);
    return NextResponse.json(
      { error: "Account creation failed. Please try again." },
      { status: 500 },
    );
  }
}
