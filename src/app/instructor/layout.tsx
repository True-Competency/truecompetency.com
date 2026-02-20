"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";
import { LayoutDashboard, Users, UserCircle2 } from "lucide-react";

type Profile = {
  id: string;
  full_name: string | null;
  first_name: string | null;
  last_name: string | null;
};

export default function InstructorLayout({
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
        .select("id, full_name, first_name, last_name")
        .eq("id", u.user.id)
        .maybeSingle();
      if (data && !cancelled) setProfile(data as Profile);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const navBase =
    "flex items-center gap-3 px-3 py-2.5 rounded-full text-sm font-medium transition-all";
  const navActive =
    "bg-[var(--accent)] text-white shadow-[0_2px_10px_color-mix(in_oklab,var(--accent)_35%,transparent)]";
  const navIdle =
    "text-[var(--muted)] hover:bg-[var(--field)] hover:text-[var(--foreground)]";

  function isActive(href: string, exact = false) {
    if (exact) return pathname === href;
    return pathname === href || pathname.startsWith(href + "/");
  }

  function displayName(p: Profile | null) {
    if (!p) return "Instructor";
    return (
      p.full_name ||
      [p.first_name, p.last_name].filter(Boolean).join(" ") ||
      "Instructor"
    );
  }

  return (
    <div className="flex" style={{ flex: 1, minHeight: 0 }}>
      <aside
        className="w-60 flex-shrink-0 flex flex-col border-r border-[var(--border)] bg-[var(--surface)]"
        style={{
          position: "sticky",
          top: "0",
          height: "100vh",
          overflowY: "auto",
          alignSelf: "flex-start",
        }}
      >
        <div className="px-5 pt-5 pb-4 border-b border-[var(--border)]">
          <p className="text-[10px] font-bold uppercase tracking-widest text-[var(--muted)]">
            Instructor Portal
          </p>
        </div>

        <nav className="flex-1 px-3 py-4 space-y-1">
          <Link
            href="/instructor"
            className={`${navBase} ${isActive("/instructor", true) ? navActive : navIdle}`}
          >
            <LayoutDashboard size={16} />
            <span>Dashboard</span>
          </Link>

          <Link
            href="/instructor"
            className={`${navBase} ${isActive("/instructor/trainee") ? navActive : navIdle}`}
          >
            <Users size={16} />
            <span>Trainees</span>
          </Link>

          <Link
            href="/account"
            className={`${navBase} ${isActive("/account", true) ? navActive : navIdle}`}
          >
            <UserCircle2 size={16} />
            <span>Profile</span>
          </Link>
        </nav>

        <div className="px-4 py-4 border-t border-[var(--border)]">
          <div className="text-sm font-medium text-[var(--foreground)] truncate">
            Dr. {displayName(profile)}
          </div>
          <div className="text-xs text-[var(--muted)] mt-0.5">Instructor</div>
        </div>
      </aside>

      <div className="flex-1 min-w-0">{children}</div>
    </div>
  );
}
