"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";
import {
  ShieldCheck,
  Users,
  GraduationCap,
  BookOpen,
  UserCircle2,
} from "lucide-react";

type Profile = {
  id: string;
  email: string | null;
  full_name: string | null;
  first_name: string | null;
  last_name: string | null;
  avatar_path: string | null;
};

export default function AdminLayoutClient({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const btnRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data: u } = await supabase.auth.getUser();
      if (!u.user?.id || cancelled) return;
      const { data } = await supabase
        .from("profiles")
        .select("id, email, full_name, first_name, last_name, avatar_path")
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
      const target = e.target as Node;
      if (!menuRef.current?.contains(target) && !btnRef.current?.contains(target)) {
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

  function isActive(href: string, exact = false) {
    if (exact) return pathname === href;
    return pathname === href || pathname.startsWith(href + "/");
  }

  function displayName(p: Profile | null) {
    if (!p) return "Admin";
    return (
      p.full_name ||
      [p.first_name, p.last_name].filter(Boolean).join(" ") ||
      p.email ||
      "Admin"
    );
  }

  function getInitials(p: Profile | null) {
    if (!p) return "A";
    const fn = p.first_name?.[0] ?? "";
    const ln = p.last_name?.[0] ?? "";
    return (fn + ln || p.full_name?.[0] || p.email?.[0] || "A").toUpperCase();
  }

  function getAvatarUrl(p: Profile | null) {
    if (!p?.avatar_path) return "";
    return supabase.storage.from("profile-pictures").getPublicUrl(p.avatar_path)
      .data.publicUrl;
  }

  async function handleSignOut() {
    await supabase.auth.signOut();
    setMenuOpen(false);
    const redir = encodeURIComponent(pathname || "/admin");
    router.replace(`/signin?redirect=${redir}`);
    router.refresh();
  }

  const navBase =
    "flex items-center gap-3 px-3 py-2.5 rounded-full text-sm font-medium transition-all";
  const navActive =
    "bg-[var(--accent)] text-white shadow-[0_2px_10px_color-mix(in_oklab,var(--accent)_35%,transparent)]";
  const navIdle =
    "text-[var(--muted)] hover:bg-[var(--field)] hover:text-[var(--foreground)]";
  const sidebarWidthClass = "w-60";
  const contentOffsetClass = "ml-60";

  return (
    <div className="relative" style={{ flex: 1, minHeight: 0 }}>
      <aside
        className={`${sidebarWidthClass} fixed inset-y-0 left-0 z-30 flex flex-col border-r border-[var(--border)] bg-[var(--surface)]`}
        style={{ overflowY: "auto" }}
      >
        <div className="px-5 pt-5 pb-4 border-b border-[var(--border)]">
          <p className="text-[10px] font-bold uppercase tracking-widest text-[var(--muted)]">
            Admin Portal
          </p>
        </div>

        <nav className="flex-1 px-3 py-4 space-y-1">
          <Link
            href="/admin"
            className={`${navBase} ${isActive("/admin", true) ? navActive : navIdle}`}
          >
            <ShieldCheck size={16} />
            <span>Dashboard</span>
          </Link>

          <Link
            href="/committee"
            className={`${navBase} ${isActive("/committee") ? navActive : navIdle}`}
          >
            <Users size={16} />
            <span>Committee</span>
          </Link>

          <Link
            href="/instructor"
            className={`${navBase} ${isActive("/instructor") ? navActive : navIdle}`}
          >
            <GraduationCap size={16} />
            <span>Instructor</span>
          </Link>

          <Link
            href="/trainee"
            className={`${navBase} ${isActive("/trainee") ? navActive : navIdle}`}
          >
            <BookOpen size={16} />
            <span>Trainee</span>
          </Link>

          <Link
            href="/account"
            className={`${navBase} ${isActive("/account", true) ? navActive : navIdle}`}
          >
            <UserCircle2 size={16} />
            <span>Profile</span>
          </Link>
        </nav>

        <div className="px-3 py-4 border-t border-[var(--border)] relative">
          <button
            ref={btnRef}
            onClick={() => setMenuOpen((v) => !v)}
            aria-haspopup="menu"
            aria-expanded={menuOpen}
            className="w-full text-left flex items-center gap-3 rounded-full px-2 py-2 hover:bg-[var(--field)] transition"
          >
            <div className="h-9 w-9 overflow-hidden rounded-full grid place-items-center text-white text-xs font-bold flex-shrink-0 bg-[var(--accent)]">
              {profile?.avatar_path ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={getAvatarUrl(profile)}
                  alt={displayName(profile)}
                  className="h-full w-full object-cover object-center"
                />
              ) : (
                getInitials(profile)
              )}
            </div>
            <div className="min-w-0 flex-1">
              <div className="text-sm font-medium text-[var(--foreground)] truncate">
                {displayName(profile)}
              </div>
              <div className="text-xs text-[var(--muted)] mt-0.5">Admin</div>
            </div>
          </button>

          {menuOpen && (
            <div
              ref={menuRef}
              role="menu"
              aria-label="Profile menu"
              className="absolute left-3 right-3 bottom-[82px] rounded-xl border border-[var(--border)] bg-[color:var(--surface)] shadow-[0_12px_48px_color-mix(in_oklab,var(--accent)_16%,transparent)] overflow-hidden z-20"
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

      <div className={`${contentOffsetClass} min-w-0`}>{children}</div>
    </div>
  );
}
