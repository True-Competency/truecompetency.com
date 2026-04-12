import { NextRequest, NextResponse } from "next/server";
import { Resend } from "resend";
import { getSupabaseServer } from "@/lib/supabaseServer";
import { checkRateLimit, supportLimiter } from "@/lib/rateLimit";

const SUPPORT_EMAIL = process.env.SUPPORT_EMAIL;

const ALLOWED_SUBJECTS = new Set([
  "Question",
  "Bug Report",
  "Feature Request",
  "Other",
]);

export async function POST(req: NextRequest) {
  try {
    if (!SUPPORT_EMAIL) {
      return NextResponse.json(
        { error: "Support email is not configured." },
        { status: 500 },
      );
    }

    const supabase = await getSupabaseServer();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const rateLimitResult = await checkRateLimit(supportLimiter, user.id);
    if (!rateLimitResult.allowed) {
      return NextResponse.json(
        {
          error: `Too many requests. Please wait ${rateLimitResult.retryAfter} seconds.`,
        },
        { status: 429 },
      );
    }

    const body = (await req.json()) as {
      subject?: string;
      message?: string;
    };

    const subject = (body.subject ?? "").trim();
    const message = (body.message ?? "").trim();

    if (!message) {
      return NextResponse.json(
        { error: "Message is required." },
        { status: 400 },
      );
    }

    if (message.length > 2000) {
      return NextResponse.json(
        { error: "Message must be 2000 characters or fewer." },
        { status: 400 },
      );
    }

    if (!ALLOWED_SUBJECTS.has(subject)) {
      return NextResponse.json({ error: "Invalid subject." }, { status: 400 });
    }

    const { data: profile } = await supabase
      .from("profiles")
      .select("full_name, first_name, last_name")
      .eq("id", user.id)
      .maybeSingle<{
        full_name: string | null;
        first_name: string | null;
        last_name: string | null;
      }>();

    const senderName =
      profile?.full_name ||
      [profile?.first_name, profile?.last_name].filter(Boolean).join(" ") ||
      "True Competency User";
    const senderEmail = user.email ?? "";

    if (!senderEmail) {
      return NextResponse.json(
        { error: "Your account does not have an email address." },
        { status: 400 },
      );
    }

    const resend = new Resend(process.env.RESEND_API_KEY ?? "");
    await resend.emails.send({
      to: SUPPORT_EMAIL,
      from: "True Competency <noreply@truecompetency.com>",
      replyTo: senderEmail,
      subject: `Help & Support: ${subject}`,
      text: [
        `Sender Name: ${senderName}`,
        `Sender Email: ${senderEmail}`,
        `Subject: ${subject}`,
        "",
        "Message:",
        message,
      ].join("\n"),
    });

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("[support] Failed to send support email", error);
    return NextResponse.json(
      { error: "Failed to send support message." },
      { status: 500 },
    );
  }
}

export function GET() {
  return NextResponse.json({ error: "Method not allowed" }, { status: 405 });
}
