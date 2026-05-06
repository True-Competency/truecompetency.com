// Sentry tunnel route.
//
// Why this exists:
// Sentry's withSentryConfig has a tunnelRoute option that auto-generates this for us,
// but on Next.js 16 + Turbopack production builds it silently does nothing.
// We hand-write the route to keep ad-blocker bypass working.
//
// How it works:
// The Sentry SDK in the browser posts an envelope (multipart text body) here instead of directly to sentry.io.
// We parse the envelope's first line (a JSON header containing the DSN), validate the DSN points at our project,
// then forward the envelope to Sentry's real ingest endpoint server-side.
// Ad blockers cannot block this because the request goes to our own domain.
//
// Security: we validate that the DSN's host and project ID match our expected Sentry project before forwarding.
// Without this, the route would be a free open proxy to any Sentry project.

import { NextRequest, NextResponse } from "next/server";

// The DSN host and project ID we accept. Anything else is rejected.
// We hardcode these from NEXT_PUBLIC_SENTRY_DSN so a misconfigured client cannot redirect our tunnel to a different Sentry org.
const SENTRY_HOST = "o4511035514028032.ingest.us.sentry.io";
const SENTRY_PROJECT_ID = "4511035515600896";

export async function POST(req: NextRequest) {
  try {
    // The body is a Sentry envelope: a multi-line text format where the first line is JSON.
    const envelopeBytes = await req.arrayBuffer();
    const envelope = new TextDecoder().decode(envelopeBytes);

    // Parse the first line. It contains the DSN among other metadata.
    const firstNewline = envelope.indexOf("\n");
    if (firstNewline === -1) {
      return NextResponse.json({ error: "malformed envelope" }, { status: 400 });
    }

    const headerLine = envelope.slice(0, firstNewline);
    let header: { dsn?: string };
    try {
      header = JSON.parse(headerLine);
    } catch {
      return NextResponse.json({ error: "malformed envelope header" }, { status: 400 });
    }

    if (!header.dsn) {
      return NextResponse.json({ error: "missing dsn" }, { status: 400 });
    }

    // Validate the DSN host and project ID match our expected values.
    // This prevents the tunnel from being abused as an open proxy to any Sentry project.
    const dsnUrl = new URL(header.dsn);
    if (dsnUrl.hostname !== SENTRY_HOST) {
      return NextResponse.json({ error: "invalid dsn host" }, { status: 403 });
    }

    // The DSN path is /<projectId>. Strip the leading slash and compare.
    const projectId = dsnUrl.pathname.replace(/^\//, "");
    if (projectId !== SENTRY_PROJECT_ID) {
      return NextResponse.json({ error: "invalid dsn project" }, { status: 403 });
    }

    // Forward the envelope to Sentry's real ingest endpoint.
    const upstreamUrl = `https://${SENTRY_HOST}/api/${SENTRY_PROJECT_ID}/envelope/`;
    const upstreamResponse = await fetch(upstreamUrl, {
      method: "POST",
      body: envelopeBytes,
      headers: {
        "Content-Type": "application/x-sentry-envelope",
      },
    });

    // Pass Sentry's response status back to the SDK so it can handle rate limits, etc.
    return new NextResponse(upstreamResponse.body, {
      status: upstreamResponse.status,
      headers: {
        "Content-Type": upstreamResponse.headers.get("Content-Type") ?? "application/json",
      },
    });
  } catch (err) {
    // If forwarding itself fails, return 500 but do not include the error message in the response body.
    // The SDK will see 500 and either retry or drop the event.
    console.error("Sentry tunnel forwarding failed:", err);
    return NextResponse.json({ error: "tunnel forwarding failed" }, { status: 500 });
  }
}

// Reject all non-POST methods.
export async function GET() {
  return NextResponse.json({ error: "method not allowed" }, { status: 405 });
}