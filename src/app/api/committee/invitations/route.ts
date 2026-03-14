import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";
import { getSupabaseServer } from "@/lib/supabaseServer";

function isValidEmail(email: string) {
  return /^\S+@\S+\.\S+$/.test(email);
}

export async function POST(req: NextRequest) {
  const supabase = await getSupabaseServer();

  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();
  if (authError || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select("role, committee_role, hospital")
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
      { error: "Only the committee chair can send invitations." },
      { status: 403 },
    );
  }

  const body = (await req.json().catch(() => null)) as {
    email?: unknown;
  } | null;
  const email =
    typeof body?.email === "string" ? body.email.trim().toLowerCase() : "";

  if (!email || !isValidEmail(email)) {
    return NextResponse.json(
      { error: "Please provide a valid email address." },
      { status: 400 },
    );
  }

  const { data: existingProfile, error: existingProfileError } = await supabase
    .from("profiles")
    .select("role, committee_role")
    .ilike("email", email)
    .maybeSingle<{ role: string | null; committee_role: string | null }>();

  if (existingProfileError) {
    return NextResponse.json(
      { error: "Unable to check for an existing member." },
      { status: 500 },
    );
  }

  if (existingProfile?.role === "committee") {
    return NextResponse.json(
      { error: "That email already belongs to a committee member." },
      { status: 409 },
    );
  }

  try {
    const admin = getSupabaseAdmin();
    const origin = req.nextUrl.origin;
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
      const message = inviteError.message.toLowerCase();
      if (message.includes("already") || message.includes("registered")) {
        return NextResponse.json(
          {
            error:
              "That email is already registered. Ask the user to sign in, or update their committee access manually.",
          },
          { status: 409 },
        );
      }

      console.error(
        "[committee/invitations] inviteUserByEmail error:",
        inviteError,
      );
      return NextResponse.json(
        { error: inviteError.message || "Failed to send invitation email." },
        { status: 500 },
      );
    }

    return NextResponse.json({
      ok: true,
      message: `Invitation sent to ${email}. They will join as a committee editor after accepting the invite.`,
    });
  } catch (error) {
    console.error("[committee/invitations] unexpected error:", error);
    const message =
      error instanceof Error
        ? error.message
        : "Failed to initialize invitation service.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
