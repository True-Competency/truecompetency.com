// Re-sends the welcome invitation email. With the token-less /welcome flow,
// "re-inviting" is equivalent to sending the original invite again — there is
// no auth.users row to clean up because invitations no longer create one.
//
// Kept as a separate route from /api/committee/invitations so the Members UI
// can call it from the pending-invites table without colliding with the
// existing-profile pre-check, and so admins (not just the chair) can use it.
//
// TODO(follow-up): the Members UI still posts { email, userId } to this route.
// userId is accepted-but-ignored here for backward compatibility. Drop it from
// the client handler in a follow-up PR alongside the committee_invitations
// tracking table redesign.

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
    .select("role, committee_role, first_name, last_name, email")
    .eq("id", user.id)
    .maybeSingle<{
      role: string | null;
      committee_role: string | null;
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

  const isAdmin = profile?.role === "admin";
  const isChair =
    profile?.role === "committee" && profile?.committee_role === "chief_editor";
  if (!isAdmin && !isChair) {
    return NextResponse.json(
      { error: "Only the committee chair can re-invite members." },
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

  // userId is accepted but ignored — kept for backward compatibility with the
  // existing client handler. See file header TODO.
  const body = (await req.json().catch(() => null)) as {
    email?: unknown;
    userId?: unknown;
  } | null;
  const email =
    typeof body?.email === "string" ? body.email.trim().toLowerCase() : "";

  if (!email || !isValidEmail(email)) {
    return NextResponse.json(
      { error: "Please provide a valid email address." },
      { status: 400 },
    );
  }

  if (!process.env.RESEND_API_KEY) {
    console.error("[committee/reinvite] RESEND_API_KEY not configured");
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
      subject: "Reminder: your True Competency committee invitation",
      text: [
        "Hi,",
        "",
        `${chairName} has invited you to join the True Competency committee.`,
        "",
        "This is a reminder — click the link below to set up your account:",
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
          <p>This is a reminder — click the button below to set up your account:</p>
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
      message: `Reminder sent to ${email}.`,
    });
  } catch (error) {
    console.error("[committee/reinvite] Resend send failed:", error);
    return NextResponse.json(
      { error: "Failed to send reminder email. Please try again." },
      { status: 500 },
    );
  }
}
