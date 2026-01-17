// src/middleware.ts
import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";

const PUBLIC_PATHS = [
  "/signin",
  "/signup",
  "/debug",
  "/api/auth/callback",
  "/preview-check",
  "/api/health",
  "/api/runtime",
  "/favicon.ico",
];

const PROTECT_PREFIXES = ["/trainee", "/instructor", "/committee"] as const;

type AppRole = "trainee" | "instructor" | "committee" | "admin";

const ROLE_HOME: Record<AppRole, string> = {
  trainee: "/trainee",
  instructor: "/instructor",
  committee: "/committee",
  admin: "/instructor", // admins land here by default
};

export async function proxy(req: NextRequest) {
  const { pathname } = req.nextUrl;

  // Allow Next internals & public routes
  if (
    pathname.startsWith("/_next") ||
    pathname.startsWith("/assets") ||
    pathname.startsWith("/images") ||
    pathname.startsWith("/fonts") ||
    PUBLIC_PATHS.some((p) => pathname.startsWith(p))
  ) {
    return NextResponse.next();
  }

  const res = NextResponse.next();

  // Create Supabase server client with cookie refresh support
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => req.cookies.getAll(),
        setAll: (cookies) => {
          for (const { name, value, options } of cookies) {
            res.cookies.set(name, value, options);
          }
        },
      },
    }
  );

  const {
    data: { user },
  } = await supabase.auth.getUser();

  // Unauthed users → redirect if hitting protected pages
  const needsAuth = PROTECT_PREFIXES.some((p) => pathname.startsWith(p));
  if (!user) {
    if (needsAuth) {
      const url = req.nextUrl.clone();
      url.pathname = "/signin";
      url.searchParams.set("redirect", pathname);
      return NextResponse.redirect(url);
    }
    return res;
  }

  // Fetch role from profiles; fallback to trainee
  let role: AppRole = "trainee";
  try {
    const { data: prof } = await supabase
      .from("profiles")
      .select("role")
      .eq("id", user.id)
      .maybeSingle();

    if (
      prof?.role === "instructor" ||
      prof?.role === "committee" ||
      prof?.role === "trainee" ||
      prof?.role === "admin"
    ) {
      role = prof.role;
    }
  } catch {
    // ignore, use default
  }

  const home = ROLE_HOME[role];

  // Admins bypass all route restrictions
  if (role === "admin") {
    return res;
  }

  // Root path → send to their home
  if (pathname === "/") {
    const url = req.nextUrl.clone();
    url.pathname = home;
    return NextResponse.redirect(url);
  }

  // Role-based access control (non-admin)
  const isProtected = PROTECT_PREFIXES.some((p) => pathname.startsWith(p));
  if (isProtected && !pathname.startsWith(home)) {
    const url = req.nextUrl.clone();
    url.pathname = home;
    return NextResponse.redirect(url);
  }

  return res;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|robots.txt|sitemap.xml).*)"],
};