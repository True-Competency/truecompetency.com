// src/app/committee/layout.tsx
"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";
import {
  LayoutDashboard,
  BookOpen,
  ClipboardList,
  Users,
  ChevronRight,
  Crown,
} from "lucide-react";

type Profile = {
  id: string;
  full_name: string | null;
  first_name: string | null;
  last_name: string | null;
  committee_role: string | null;
};

export default function CommitteeLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const [profile, setProfile] = useState<Profile | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data: u } = await supabase.auth.getUser();
      if (!u.user?.id || cancelled) return;
      const { data } = await supabase
        .from("profiles")
        .select("id, full_name, first_name, last_name, committee_role")
        .eq("id", u.user.id)
        .maybeSingle();
      if (data && !cancelled) setProfile(data as Profile);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  function isActive(href: string, exact = false) {
    if (exact) return pathname === href;
    return pathname === href || pathname.startsWith(href + "/");
  }

  const isReviewActive = pathname.startsWith("/committee/review-queue");

  function getInitials(p: Profile | null) {
    if (!p) return "?";
    const fn = p.first_name?.[0] ?? "";
    const ln = p.last_name?.[0] ?? "";
    return (fn + ln || p.full_name?.[0] || "?").toUpperCase();
  }

  function getDisplayName(p: Profile | null) {
    if (!p) return "Loading...";
    return (
      p.full_name ||
      [p.first_name, p.last_name].filter(Boolean).join(" ") ||
      "Committee Member"
    );
  }

  const navLinkBase =
    "flex items-center gap-3 px-3 py-2.5 rounded-full text-sm font-medium transition-all duration-150";
  const navActive =
    "bg-[var(--accent)] text-white shadow-[0_2px_10px_color-mix(in_oklab,var(--accent)_35%,transparent)]";
  const navIdle =
    "text-[var(--muted)] hover:bg-[var(--field)] hover:text-[var(--foreground)]";

  const subLinkBase =
    "flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-medium transition-all duration-150";
  const subActive =
    "text-[var(--accent)] bg-[color:var(--accent)]/10 font-semibold";
  const subIdle =
    "text-[var(--muted)] hover:text-[var(--foreground)] hover:bg-[var(--field)]";

  return (
    <div className="flex" style={{ flex: 1, minHeight: 0 }}>
      {/* ── Sidebar ── */}
      <aside
        className="w-60 flex-shrink-0 flex flex-col border-r border-[var(--border)] bg-[var(--surface)]"
        style={{
          position: "sticky",
          top: "64px",
          height: "calc(100vh - 64px)",
          overflowY: "auto",
          alignSelf: "flex-start",
        }}
      >
        {/* Portal label */}
        <div className="px-5 pt-5 pb-4 border-b border-[var(--border)]">
          <p className="text-[10px] font-bold uppercase tracking-widest text-[var(--muted)]">
            Committee Portal
          </p>
        </div>

        {/* Navigation */}
        <nav className="flex-1 px-3 py-4 space-y-1">
          {/* Dashboard */}
          <Link
            href="/committee"
            className={`${navLinkBase} ${isActive("/committee", true) ? navActive : navIdle}`}
          >
            <LayoutDashboard size={16} />
            <span>Dashboard</span>
          </Link>

          {/* Competencies */}
          <Link
            href="/committee/competencies"
            className={`${navLinkBase} ${isActive("/committee/competencies") ? navActive : navIdle}`}
          >
            <BookOpen size={16} />
            <span>Competencies</span>
          </Link>

          {/* Review Queue + sub-items */}
          <div>
            <Link
              href="/committee/review-queue/competencies"
              className={`${navLinkBase} ${isReviewActive ? navActive : navIdle}`}
            >
              <ClipboardList size={16} />
              <span className="flex-1">Review Queue</span>
              <ChevronRight size={12} className="opacity-60" />
            </Link>

            {/* Always-visible sub-items */}
            <div className="ml-8 mt-1 space-y-0.5">
              <Link
                href="/committee/review-queue/competencies"
                className={`${subLinkBase} ${
                  pathname.startsWith("/committee/review-queue/competencies")
                    ? subActive
                    : subIdle
                }`}
              >
                <span className="w-1.5 h-1.5 rounded-full bg-current opacity-60 flex-shrink-0" />
                Competencies
              </Link>
              <Link
                href="/committee/review-queue/questions"
                className={`${subLinkBase} ${
                  pathname.startsWith("/committee/review-queue/questions")
                    ? subActive
                    : subIdle
                }`}
              >
                <span className="w-1.5 h-1.5 rounded-full bg-current opacity-60 flex-shrink-0" />
                Questions
              </Link>
            </div>
          </div>

          {/* Members */}
          <Link
            href="/committee/members"
            className={`${navLinkBase} ${isActive("/committee/members") ? navActive : navIdle}`}
          >
            <Users size={16} />
            <span>Members</span>
          </Link>
        </nav>

        {/* Profile footer */}
        <div className="px-4 py-4 border-t border-[var(--border)]">
          <div className="flex items-center gap-3">
            <div
              className="w-9 h-9 rounded-full grid place-items-center text-white text-xs font-bold flex-shrink-0"
              style={{ background: "var(--accent)" }}
            >
              {getInitials(profile)}
            </div>
            <div className="min-w-0 flex-1">
              <div className="text-sm font-medium text-[var(--foreground)] truncate">
                {profile ? `Dr. ${getDisplayName(profile)}` : "Loading..."}
              </div>
              <div className="text-xs text-[var(--muted)] flex items-center gap-1 mt-0.5">
                {profile?.committee_role === "chief_editor" ? (
                  <>
                    <Crown
                      size={10}
                      style={{ color: "var(--warn)", flexShrink: 0 }}
                    />
                    <span>Committee Chair</span>
                  </>
                ) : (
                  "Committee Member"
                )}
              </div>
            </div>
          </div>
        </div>
      </aside>

      {/* ── Page content ── */}
      <div className="flex-1 min-w-0">{children}</div>
    </div>
  );
}
