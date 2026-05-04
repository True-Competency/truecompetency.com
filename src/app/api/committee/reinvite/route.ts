// src/app/api/committee/reinvite/route.ts
// Allows the committee chair to re-invite a user whose invitation has expired.
// Deletes the stuck auth.users row and sends a fresh invitation email.

import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";
import { getSupabaseServer } from "@/lib/supabaseServer";
import { checkRateLimit, invitationLimiter } from "@/lib/rateLimit";

function isValidEmail(email: string) {
  return /^\S+@\S+\.\S+$/.test(email);
}

export async function POST(req: NextRequest) {
  const supabase = await getSupabaseServer();

  // ── Auth check ──────────────────────────────────────────────────────────
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();
  if (authError || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // ── Chair-only gate ─────────────────────────────────────────────────────
  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select("role, committee_role, hospital, first_name, last_name")
    .eq("id", user.id)
    .maybeSingle<{
      role: string | null;
      committee_role: string | null;
      hospital: string | null;
      first_name: string | null;
      last_name: string | null;
    }>();

  if (profileError) {
    return NextResponse.json(
      { error: "Unable to verify committee permissions." },
      { status: 500 },
    );
  }

  if (
    profile?.role !== "committee" ||
    profile?.committee_role !== "chief_editor"
  ) {
    return NextResponse.json(
      { error: "Only the committee chair can re-invite members." },
      { status: 403 },
    );
  }

  // ── Rate limit ──────────────────────────────────────────────────────────
  const rateLimitResult = await checkRateLimit(invitationLimiter, user.id);
  if (!rateLimitResult.allowed) {
    return NextResponse.json(
      {
        error: `Too many requests. Please wait ${rateLimitResult.retryAfter} seconds.`,
      },
      { status: 429 },
    );
  }

  // ── Parse body ──────────────────────────────────────────────────────────
  const body = (await req.json().catch(() => null)) as {
    email?: unknown;
    userId?: unknown;
  } | null;
  const email =
    typeof body?.email === "string" ? body.email.trim().toLowerCase() : "";
  const userId = typeof body?.userId === "string" ? body.userId.trim() : "";

  if (!email || !isValidEmail(email)) {
    return NextResponse.json(
      { error: "Please provide a valid email address." },
      { status: 400 },
    );
  }

  if (!userId) {
    return NextResponse.json({ error: "Missing user ID." }, { status: 400 });
  }

  try {
    const admin = getSupabaseAdmin();

    // ── Step 1: Verify the user is actually stuck (invited but unconfirmed) ──
    // This prevents misuse of this endpoint to delete confirmed users
    const {
      data: { user: stuckUser },
      error: getUserError,
    } = await admin.auth.admin.getUserById(userId);

    if (getUserError || !stuckUser) {
      return NextResponse.json({ error: "User not found." }, { status: 404 });
    }

    if (stuckUser.email_confirmed_at) {
      return NextResponse.json(
        {
          error:
            "This user has already confirmed their invitation and cannot be re-invited.",
        },
        { status: 409 },
      );
    }

    if (!stuckUser.invited_at) {
      return NextResponse.json(
        {
          error: "This user was not invited via the committee invitation flow.",
        },
        { status: 409 },
      );
    }

    // ── Step 2: Delete the stuck auth user ──────────────────────────────────
    const { error: deleteError } = await admin.auth.admin.deleteUser(userId);
    if (deleteError) {
      console.error(
        "[committee/reinvite] Failed to delete stuck user:",
        deleteError,
      );
      return NextResponse.json(
        { error: "Failed to clear the expired invitation. Please try again." },
        { status: 500 },
      );
    }

    // ── Step 3: Send fresh invitation ──────────────────────────────────────
    const origin = process.env.NEXT_PUBLIC_SITE_URL ?? req.nextUrl.origin;
    const redirectTo = `${origin}/welcome?email=${encodeURIComponent(email)}`;

    const { error: inviteError } = await admin.auth.admin.inviteUserByEmail(
      email,
      {
        redirectTo,
        data: {
          role: "committee",
          committee_role: "editor",
          hospital: profile.hospital ?? null,
          invited_by:
            `${profile.first_name ?? ""} ${profile.last_name ?? ""}`.trim(),
        },
      },
    );

    if (inviteError) {
      console.error(
        "[committee/reinvite] Failed to send re-invitation:",
        inviteError,
      );
      return NextResponse.json(
        { error: inviteError.message || "Failed to send re-invitation email." },
        { status: 500 },
      );
    }

    return NextResponse.json({
      ok: true,
      message: `Re-invitation sent to ${email}. The previous expired link is now invalid.`,
    });
  } catch (error) {
    console.error("[committee/reinvite] Unexpected error:", error);
    return NextResponse.json(
      { error: "Failed to process re-invitation." },
      { status: 500 },
    );
  }
}
