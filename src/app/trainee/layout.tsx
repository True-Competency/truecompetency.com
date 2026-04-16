// src/app/trainee/layout.tsx
"use client";

import { useEffect, useRef, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import ReactCountryFlag from "react-country-flag";
import { supabase } from "@/lib/supabaseClient";
import {
  LayoutDashboard,
  BookOpen,
  BarChart2,
  UserCircle2,
  PanelLeftClose,
  PanelLeftOpen,
  X,
  Bell,
} from "lucide-react";
import SidebarSupportModal from "@/components/SidebarSupportModal";

// ── Types ──────────────────────────────────────────────────────────────────────

type Profile = {
  id: string;
  full_name: string | null;
  first_name: string | null;
  last_name: string | null;
  hospital: string | null;
  university: string | null;
  country_name: string | null;
  country_code: string | null;
  avatar_path: string | null;
};

// ── Layout ─────────────────────────────────────────────────────────────────────

export default function TraineeLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const router = useRouter();
  const pathname = usePathname();

  // Profile state
  const [profile, setProfile] = useState<Profile | null>(null);

  // Sidebar collapse (persisted to localStorage)
  const [collapsed, setCollapsed] = useState(false);

  // Profile footer dropdown
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const btnRef = useRef<HTMLButtonElement>(null);

  // ── Fetch profile ────────────────────────────────────────────────────────────

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data: u } = await supabase.auth.getUser();
      if (!u.user?.id || cancelled) return;
      const { data } = await supabase
        .from("profiles")
        .select(
          "id, full_name, first_name, last_name, hospital, university, country_name, country_code, avatar_path",
        )
        .eq("id", u.user.id)
        .maybeSingle();
      if (data && !cancelled) setProfile(data as Profile);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // ── Restore collapsed state from localStorage ────────────────────────────────

  useEffect(() => {
    const raw = window.localStorage.getItem("trainee_sidebar_collapsed");
    if (raw === "1") setCollapsed(true);
  }, []);

  useEffect(() => {
    window.localStorage.setItem(
      "trainee_sidebar_collapsed",
      collapsed ? "1" : "0",
    );
  }, [collapsed]);

  // ── Close profile menu on outside click / Escape ─────────────────────────────

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

  // ── Close menus/modals on route change ──────────────────────────────────────

  useEffect(() => {
    setMenuOpen(false);
  }, [pathname]);

  // ── Helpers ──────────────────────────────────────────────────────────────────

  function isActive(href: string, exact = false) {
    if (exact) return pathname === href;
    return pathname === href || pathname.startsWith(href + "/");
  }

  function getInitials(p: Profile | null) {
    if (!p) return "T";
    const fn = p.first_name?.[0] ?? "";
    const ln = p.last_name?.[0] ?? "";
    return (fn + ln || p.full_name?.[0] || "T").toUpperCase();
  }

  function getDisplayName(p: Profile | null) {
    if (!p) return "Loading...";
    return (
      p.full_name ||
      [p.first_name, p.last_name].filter(Boolean).join(" ") ||
      "Trainee"
    );
  }

  function getAvatarUrl(p: Profile | null) {
    if (!p?.avatar_path) return "";
    return supabase.storage.from("profile-pictures").getPublicUrl(p.avatar_path)
      .data.publicUrl;
  }

  // Validate country code to 2-letter ISO before passing to ReactCountryFlag
  const countryCode =
    profile?.country_code && /^[A-Za-z]{2}$/.test(profile.country_code)
      ? profile.country_code.toUpperCase()
      : null;

  async function handleSignOut() {
    await supabase.auth.signOut();
    const redir = encodeURIComponent(pathname || "/trainee");
    router.replace(`/signin?redirect=${redir}`);
    router.refresh();
  }

  // ── Style helpers ────────────────────────────────────────────────────────────

  const navLinkBase =
    "flex items-center gap-3 px-3 py-2.5 rounded-full text-sm font-medium transition-all duration-150";
  const navActive =
    "bg-[var(--accent)] text-white shadow-[0_2px_10px_color-mix(in_oklab,var(--accent)_35%,transparent)]";
  const navIdle =
    "text-[var(--muted)] hover:bg-[var(--field)] hover:text-[var(--foreground)]";

  const sidebarWidthClass = collapsed ? "w-16" : "w-60";
  const contentOffsetClass = collapsed ? "ml-16" : "ml-60";

  // ── Render ───────────────────────────────────────────────────────────────────

  return (
    <div className="relative" style={{ flex: 1, minHeight: 0 }}>
      {/* ── Sidebar ── */}
      <aside
        className={`${sidebarWidthClass} fixed inset-y-0 left-0 z-30 flex flex-col border-r border-[var(--border)] bg-[var(--surface)] transition-[width] duration-200`}
        style={{ overflowY: "auto" }}
      >
        {/* Logo + portal label */}
        <div className="px-3 pt-4 pb-4 border-b border-[var(--border)]">
          <div
            className={`relative group ${collapsed ? "flex justify-center" : ""}`}
          >
            <Link
              href="/trainee"
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
                    Trainee Portal
                  </p>
                </div>
              )}
            </Link>

            {/* Collapse / expand toggle — appears on hover */}
            <button
              type="button"
              onClick={() => setCollapsed((v) => !v)}
              className={`h-9 w-9 rounded-full grid place-items-center text-[var(--muted)] hover:text-[var(--foreground)] hover:bg-[var(--field)] transition-all duration-300 ease-out ${
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
            href="/trainee"
            title="Dashboard"
            className={`${navLinkBase} ${
              collapsed
                ? "h-10 w-10 mx-auto justify-center px-0 rounded-xl"
                : ""
            } ${isActive("/trainee", true) ? navActive : navIdle}`}
          >
            <LayoutDashboard size={16} />
            {!collapsed && <span>Dashboard</span>}
          </Link>

          {/* Progress — in-progress & completed */}
          <Link
            href="/trainee/progress"
            title="My Progress"
            className={`${navLinkBase} ${
              collapsed
                ? "h-10 w-10 mx-auto justify-center px-0 rounded-xl"
                : ""
            } ${isActive("/trainee/progress") ? navActive : navIdle}`}
          >
            <BarChart2 size={16} />
            {!collapsed && <span>My Progress</span>}
          </Link>

          {/* Competencies — browse & enroll */}
          <Link
            href="/trainee/competencies"
            title="Competencies"
            className={`${navLinkBase} ${
              collapsed
                ? "h-10 w-10 mx-auto justify-center px-0 rounded-xl"
                : ""
            } ${isActive("/trainee/competencies") ? navActive : navIdle}`}
          >
            <BookOpen size={16} />
            {!collapsed && <span>Competencies</span>}
          </Link>

          {/* Notifications — logs & alerts */}
          <Link
            href="/trainee/notifications"
            title="Activity"
            className={`${navLinkBase} ${
              collapsed
                ? "h-10 w-10 mx-auto justify-center px-0 rounded-xl"
                : ""
            } ${isActive("/trainee/notifications") ? navActive : navIdle}`}
          >
            <Bell size={16} />
            {!collapsed && <span>Activity</span>}
          </Link>

          {/* Profile */}
          <Link
            href="/account"
            title="Profile"
            className={`${navLinkBase} ${
              collapsed
                ? "h-10 w-10 mx-auto justify-center px-0 rounded-xl"
                : ""
            } ${isActive("/account", true) ? navActive : navIdle}`}
          >
            <UserCircle2 size={16} />
            {!collapsed && <span>Profile</span>}
          </Link>
        </nav>

        {/* Help & Support button */}
        <div className="px-3 pb-3">
          <SidebarSupportModal collapsed={collapsed} />
        </div>

        {/* Profile footer with dropdown menu */}
        <div className="px-3 py-4 border-t border-[var(--border)] relative">
          <button
            ref={btnRef}
            onClick={() => setMenuOpen((v) => !v)}
            aria-haspopup="menu"
            aria-expanded={menuOpen}
            className={`w-full text-left flex items-center rounded-full px-2 py-2 hover:bg-[var(--field)] transition ${
              collapsed ? "justify-center gap-0" : "gap-3"
            }`}
          >
            {/* Avatar */}
            <div
              className="h-9 w-9 overflow-hidden rounded-full grid place-items-center text-white text-xs font-bold flex-shrink-0"
              style={{ background: "var(--accent)" }}
            >
              {profile?.avatar_path ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={getAvatarUrl(profile)}
                  alt={getDisplayName(profile)}
                  className="h-full w-full object-cover object-center"
                />
              ) : (
                getInitials(profile)
              )}
            </div>

            {/* Name + institution + country — hidden when collapsed */}
            {!collapsed && (
              <div className="min-w-0 flex-1">
                <div className="text-sm font-medium text-[var(--foreground)] truncate">
                  {getDisplayName(profile)}
                </div>
                <div className="mt-0.5 space-y-0.5">
                  {(profile?.hospital || profile?.university) && (
                    <div className="text-xs text-[var(--muted)] truncate">
                      {profile.hospital || profile.university}
                    </div>
                  )}
                  {profile?.country_name && (
                    <div className="flex items-center gap-1.5 text-xs text-[var(--muted)]">
                      {countryCode && (
                        <ReactCountryFlag
                          countryCode={countryCode}
                          svg
                          style={{
                            width: "0.95em",
                            height: "0.95em",
                            borderRadius: 2,
                            flexShrink: 0,
                          }}
                          title={profile.country_name}
                          aria-label={profile.country_name}
                        />
                      )}
                      <span className="truncate">{profile.country_name}</span>
                    </div>
                  )}
                </div>
              </div>
            )}
          </button>

          {/* Profile dropdown */}
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
                  onClick={() => setMenuOpen(false)}
                >
                  Account
                </Link>
                <Link
                  href="/settings"
                  role="menuitem"
                  className="block px-3 py-2 text-sm transition-colors hover:bg-[var(--accent)] hover:text-white"
                  onClick={() => setMenuOpen(false)}
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

      {/* ── Page content — offset by sidebar width ── */}
      <div
        className={`${contentOffsetClass} min-w-0 transition-[margin] duration-200`}
      >
        {children}
      </div>
    </div>
  );
}
