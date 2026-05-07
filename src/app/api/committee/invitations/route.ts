// Sends a committee invitation email containing a plain link to /welcome.
// We do NOT use Supabase's inviteUserByEmail because that delivers a one-time
// magic-link token that enterprise email scanners (Microsoft Defender Safe Links
// at hospitals/universities) auto-visit and consume before the recipient ever
// clicks. The new /welcome page is a self-service signup form that does not
// require any token.

import { NextRequest, NextResponse } from "next/server";
import { Resend } from "resend";
import { getSupabaseServer } from "@/lib/supabaseServer";
import { checkRateLimit, invitationLimiter } from "@/lib/rateLimit";

function isValidEmail(email: string) {
  return /^\S+@\S+\.\S+$/.test(email);
}

function escapeHtml(s: string) {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
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
    .select("role, committee_role, hospital, first_name, last_name, email")
    .eq("id", user.id)
    .maybeSingle<{
      role: string | null;
      committee_role: string | null;
      hospital: string | null;
      first_name: string | null;
      last_name: string | null;
      email: string | null;
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

  const rateLimitResult = await checkRateLimit(invitationLimiter, user.id);
  if (!rateLimitResult.allowed) {
    return NextResponse.json(
      {
        error: `Too many requests. Please wait ${rateLimitResult.retryAfter} seconds.`,
      },
      { status: 429 },
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

  if (!process.env.RESEND_API_KEY) {
    console.error("[committee/invitations] RESEND_API_KEY not configured");
    return NextResponse.json(
      { error: "Invitation email service is not configured." },
      { status: 500 },
    );
  }

  const origin = process.env.NEXT_PUBLIC_SITE_URL ?? req.nextUrl.origin;
  const welcomeUrl = `${origin}/welcome?email=${encodeURIComponent(email)}`;
  const chairName =
    `${profile.first_name ?? ""} ${profile.last_name ?? ""}`.trim() ||
    profile.email ||
    "The committee chair";

  try {
    const resend = new Resend(process.env.RESEND_API_KEY);
    await resend.emails.send({
      to: email,
      from: "True Competency <noreply@truecompetency.com>",
      subject: "You've been invited to join True Competency",
      text: [
        "Hi,",
        "",
        `${chairName} has invited you to join the True Competency committee.`,
        "",
        "True Competency is the assessment platform for the TCIP APSC IVUS competency program.",
        "",
        "Click the link below to set up your account:",
        welcomeUrl,
        "",
        "If you have any questions, reply to this email.",
        "",
        "— True Competency Team",
      ].join("\n"),
      html: `
        <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; max-width: 560px; margin: 0 auto; color: #1a1a1a; line-height: 1.6;">
          <p>Hi,</p>
          <p><strong>${escapeHtml(chairName)}</strong> has invited you to join the True Competency committee.</p>
          <p>True Competency is the assessment platform for the TCIP APSC IVUS competency program.</p>
          <p>Click the button below to set up your account:</p>
          <p style="margin: 28px 0;">
            <a href="${welcomeUrl}"
               style="display: inline-block; background: #5170FF; color: #ffffff; text-decoration: none; padding: 12px 24px; border-radius: 8px; font-weight: 600;">
              Set up your account
            </a>
          </p>
          <p style="font-size: 13px; color: #666;">
            Or paste this link into your browser:<br>
            <a href="${welcomeUrl}" style="color: #5170FF; word-break: break-all;">${welcomeUrl}</a>
          </p>
          <p>If you have any questions, reply to this email.</p>
          <p style="margin-top: 32px; color: #666;">— True Competency Team</p>
        </div>
      `,
    });

    return NextResponse.json({
      ok: true,
      message: `Invitation sent to ${email}. They will join as a committee editor after signing up.`,
    });
  } catch (error) {
    console.error("[committee/invitations] Resend send failed:", error);
    return NextResponse.json(
      { error: "Failed to send invitation email. Please try again." },
      { status: 500 },
    );
  }
}
