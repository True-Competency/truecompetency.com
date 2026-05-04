// src/app/api/committee/pending-invites/route.ts
// Returns a list of users who were invited but never confirmed their invitation.
// Chair-only endpoint — uses admin client to query auth.users.

import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";
import { getSupabaseServer } from "@/lib/supabaseServer";

export async function GET() {
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
    .select("role, committee_role")
    .eq("id", user.id)
    .maybeSingle<{ role: string | null; committee_role: string | null }>();

  if (profileError) {
    return NextResponse.json(
      { error: "Unable to verify permissions." },
      { status: 500 },
    );
  }

  const isAdmin = profile?.role === "admin";
  const isChair =
    profile?.role === "committee" && profile?.committee_role === "chief_editor";
  if (!isAdmin && !isChair) {
    return NextResponse.json(
      { error: "Only the committee chair can view pending invitations." },
      { status: 403 },
    );
  }

  try {
    const admin = getSupabaseAdmin();

    // Fetch all auth users — we filter client-side since Supabase admin
    // list API doesn't support filtering by invited_at/confirmed_at directly
    const {
      data: { users },
      error: listError,
    } = await admin.auth.admin.listUsers({
      perPage: 1000,
    });

    if (listError) {
      console.error("[pending-invites] Failed to list users:", listError);
      return NextResponse.json(
        { error: "Failed to fetch pending invitations." },
        { status: 500 },
      );
    }

    // Filter: invited but never confirmed
    const pending = (users ?? [])
      .filter((u) => u.invited_at && !u.email_confirmed_at)
      .map((u) => ({
        id: u.id,
        email: u.email,
        invited_at: u.invited_at,
        hours_since_invite: Math.round(
          (Date.now() - new Date(u.invited_at!).getTime()) / 3600000,
        ),
      }))
      .sort(
        (a, b) =>
          new Date(b.invited_at!).getTime() - new Date(a.invited_at!).getTime(),
      );

    return NextResponse.json({ pending });
  } catch (error) {
    console.error("[pending-invites] Unexpected error:", error);
    return NextResponse.json(
      { error: "Failed to fetch pending invitations." },
      { status: 500 },
    );
  }
}
