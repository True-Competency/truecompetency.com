// src/app/committee/layout.tsx
"use client";

import { useEffect, useRef, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";
import {
  LayoutDashboard,
  BookOpen,
  ClipboardList,
  Users,
  ChevronRight,
  Crown,
  PanelLeftClose,
  PanelLeftOpen,
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
  const router = useRouter();
  const pathname = usePathname();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const btnRef = useRef<HTMLButtonElement>(null);

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

  useEffect(() => {
    function onDocClick(e: MouseEvent) {
      if (!menuOpen) return;
      const t = e.target as Node;
      if (!menuRef.current?.contains(t) && !btnRef.current?.contains(t)) {
        setMenuOpen(false);
      }
    }
    function onEsc(e: KeyboardEvent) {
      if (e.key === "Escape") setMenuOpen(false);
    }
    document.addEventListener("mousedown", onDocClick);
    document.addEventListener("keydown", onEsc);
    return () => {
      document.removeEventListener("mousedown", onDocClick);
      document.removeEventListener("keydown", onEsc);
    };
  }, [menuOpen]);

  useEffect(() => {
    setMenuOpen(false);
  }, [pathname]);

  useEffect(() => {
    const raw = window.localStorage.getItem("committee_sidebar_collapsed");
    if (raw === "1") setCollapsed(true);
  }, []);

  useEffect(() => {
    window.localStorage.setItem(
      "committee_sidebar_collapsed",
      collapsed ? "1" : "0",
    );
  }, [collapsed]);

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

  async function handleSignOut() {
    await supabase.auth.signOut();
    const redir = encodeURIComponent(pathname || "/committee");
    router.replace(`/signin?redirect=${redir}`);
    router.refresh();
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
        className={`${
          collapsed ? "w-16" : "w-60"
        } flex-shrink-0 flex flex-col border-r border-[var(--border)] bg-[var(--surface)] transition-[width] duration-200`}
        style={{
          position: "sticky",
          top: "0",
          height: "100vh",
          overflowY: "auto",
          alignSelf: "flex-start",
        }}
      >
        {/* Logo + portal label */}
        <div className="px-3 pt-4 pb-4 border-b border-[var(--border)]">
          <div
            className={`relative group ${collapsed ? "flex justify-center" : ""}`}
          >
            <Link
              href="/committee"
              className={`flex items-center ${
                collapsed
                  ? "h-9 w-9 justify-center transition-all duration-300 ease-out group-hover:opacity-0 group-hover:scale-90 group-focus-within:opacity-0 group-focus-within:scale-90"
                  : "gap-3"
              } min-w-0`}
            >
              <Image
                src="/TC_Logo.png"
                alt="True Competency"
                width={36}
                height={36}
                className="object-contain"
                priority
              />
              {!collapsed && (
                <div className="min-w-0">
                  <div className="text-sm font-semibold text-[var(--foreground)] leading-tight">
                    True Competency
                  </div>
                  <p className="text-[10px] font-bold uppercase tracking-widest text-[var(--muted)]">
                    Committee Portal
                  </p>
                </div>
              )}
            </Link>
            <button
              type="button"
              onClick={() => setCollapsed((v) => !v)}
              className={`h-9 w-9 rounded-lg grid place-items-center text-[var(--muted)] hover:text-[var(--foreground)] hover:bg-[var(--field)] transition-all duration-300 ease-out ${
                collapsed
                  ? "absolute inset-0 m-auto opacity-0 scale-90 pointer-events-none group-hover:opacity-100 group-hover:scale-100 group-hover:pointer-events-auto group-focus-within:opacity-100 group-focus-within:scale-100 group-focus-within:pointer-events-auto"
                  : "absolute right-0 top-1/2 -translate-y-1/2 opacity-0 pointer-events-none group-hover:opacity-100 group-hover:pointer-events-auto focus:opacity-100 focus:pointer-events-auto"
              }`}
              aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
              title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
            >
              {collapsed ? (
                <PanelLeftOpen size={20} />
              ) : (
                <PanelLeftClose size={20} />
              )}
            </button>
          </div>
        </div>

        {/* Navigation */}
        <nav className="flex-1 px-2 py-4 space-y-1">
          {/* Dashboard */}
          <Link
            href="/committee"
            title="Dashboard"
            className={`${navLinkBase} ${
              collapsed
                ? "h-10 w-10 mx-auto justify-center px-0 rounded-xl"
                : ""
            } ${isActive("/committee", true) ? navActive : navIdle}`}
          >
            <LayoutDashboard size={16} />
            {!collapsed && <span>Dashboard</span>}
          </Link>

          {/* Competencies */}
          <Link
            href="/committee/competencies"
            title="Competencies"
            className={`${navLinkBase} ${
              collapsed
                ? "h-10 w-10 mx-auto justify-center px-0 rounded-xl"
                : ""
            } ${isActive("/committee/competencies") ? navActive : navIdle}`}
          >
            <BookOpen size={16} />
            {!collapsed && <span>Competencies</span>}
          </Link>

          {/* Review Queue + sub-items */}
          <div>
            <Link
              href="/committee/review-queue/competencies"
              title="Review Queue"
              className={`${navLinkBase} ${
                collapsed
                  ? "h-10 w-10 mx-auto justify-center px-0 rounded-xl"
                  : ""
              } ${isReviewActive ? navActive : navIdle}`}
            >
              <ClipboardList size={16} />
              {!collapsed && (
                <>
                  <span className="flex-1">Review Queue</span>
                  <ChevronRight size={12} className="opacity-60" />
                </>
              )}
            </Link>

            {/* Always-visible sub-items */}
            {!collapsed && (
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
            )}
          </div>

          {/* Members */}
          <Link
            href="/committee/members"
            title="Members"
            className={`${navLinkBase} ${
              collapsed
                ? "h-10 w-10 mx-auto justify-center px-0 rounded-xl"
                : ""
            } ${isActive("/committee/members") ? navActive : navIdle}`}
          >
            <Users size={16} />
            {!collapsed && <span>Members</span>}
          </Link>
        </nav>

        {/* Profile footer menu */}
        <div className="px-3 py-4 border-t border-[var(--border)] relative">
          <button
            ref={btnRef}
            onClick={() => setMenuOpen((v) => !v)}
            aria-haspopup="menu"
            aria-expanded={menuOpen}
            className={`w-full text-left flex items-center rounded-xl px-2 py-2 hover:bg-[var(--field)] transition ${
              collapsed ? "justify-center gap-0" : "gap-3"
            }`}
          >
            <div
              className="w-9 h-9 rounded-full grid place-items-center text-white text-xs font-bold flex-shrink-0"
              style={{ background: "var(--accent)" }}
            >
              {getInitials(profile)}
            </div>
            {!collapsed && (
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
            )}
          </button>

          {menuOpen && (
            <div
              ref={menuRef}
              role="menu"
              aria-label="Profile menu"
              className={`absolute ${
                collapsed ? "left-[68px] w-44" : "left-3 right-3"
              } bottom-[82px] rounded-xl border border-[var(--border)] bg-[color:var(--surface)] shadow-[0_12px_48px_color-mix(in_oklab,var(--accent)_16%,transparent)] overflow-hidden z-20`}
            >
              <div className="py-1">
                <Link
                  href="/account"
                  role="menuitem"
                  className="block px-3 py-2 text-sm transition-colors hover:bg-[var(--accent)] hover:text-white"
                >
                  Account
                </Link>
                <Link
                  href="/settings"
                  role="menuitem"
                  className="block px-3 py-2 text-sm transition-colors hover:bg-[var(--accent)] hover:text-white"
                >
                  Settings
                </Link>
                <button
                  role="menuitem"
                  onClick={handleSignOut}
                  className="w-full text-left px-3 py-2 text-sm transition-colors hover:bg-[var(--accent)] hover:text-white"
                >
                  Sign out
                </button>
              </div>
            </div>
          )}
        </div>
      </aside>

      {/* ── Page content ── */}
      <div className="flex-1 min-w-0">{children}</div>
    </div>
  );
}
