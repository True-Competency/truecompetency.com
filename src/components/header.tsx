// src/components/header.tsx
"use client";

import { useEffect, useRef, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";

const IS_STAGING =
  process.env.NEXT_PUBLIC_ENV === "staging" ||
  process.env.NEXT_PUBLIC_ENV === "development";

type Props = {
  transparent?: boolean;
  hideProfileMenu?: boolean;
};

type UserBrief = { email: string | null; name?: string | null };

export default function Header({
  transparent = false,
  hideProfileMenu = false,
}: Props) {
  const router = useRouter();
  const pathname = usePathname();

  const [user, setUser] = useState<UserBrief | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const btnRef = useRef<HTMLButtonElement>(null);

  // Load user once
  useEffect(() => {
    let mounted = true;
    (async () => {
      const { data } = await supabase.auth.getUser();
      if (!mounted) return;
      const email = data.user?.email ?? null;
      setUser(email ? { email, name: null } : null);
    })();
    return () => {
      mounted = false;
    };
  }, []); // ← no supabase in deps (prevents linter warning)

  // React to auth changes (keeps pill + menu state correct)
  useEffect(() => {
    const { data: sub } = supabase.auth.onAuthStateChange((_evt, session) => {
      const email = session?.user?.email ?? null;
      setUser(email ? { email } : null);
    });
    return () => sub?.subscription?.unsubscribe();
  }, []);

  // Close menu on outside click / escape
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

  function initialsFromEmail(email?: string | null) {
    if (!email) return "•";
    const name = email.split("@")[0] || "";
    const parts = name
      .replace(/[._-]+/g, " ")
      .trim()
      .split(" ");
    const first = parts[0]?.[0] ?? "";
    const second = parts[1]?.[0] ?? "";
    return (first + second || first || "•").toUpperCase();
  }

  async function handleSignOut() {
    await supabase.auth.signOut();
    setMenuOpen(false);
    // Immediate redirect to signin (preserve where the user was)
    const redir = encodeURIComponent(pathname || "/");
    router.replace(`/signin?redirect=${redir}`);
    router.refresh();
  }

  const baseBg = transparent
    ? "bg-transparent"
    : "bg-[color:var(--surface)]/70 backdrop-blur";

  return (
    <header
      className={`sticky top-0 z-50 border-b border-[var(--border)] ${baseBg}`}
      style={{ height: "64px" }}
    >
      <div className="mx-auto max-w-7xl px-6 flex items-center justify-between h-full">
        {/* Left: Logo + name */}
        <Link href="/" className="flex items-center gap-3 group">
          <Image
            src="/TC_Logo.png"
            alt="True Competency"
            width={48}
            height={48}
            className="object-contain drop-shadow-[0_8px_24px_color-mix(in_oklab,var(--accent)_35%,transparent)]"
            priority
          />
          <span className="text-base md:text-lg font-semibold tracking-tight group-hover:opacity-90">
            True Competency
          </span>
        </Link>
        {IS_STAGING && (
          <span
            className="
              ml-3 inline-flex items-center gap-1.5
              rounded-full px-3 py-1
              text-[12px] font-bold tracking-wide
              border-2 border-[var(--err)]
              bg-[color:var(--err)]
              text-white
              shadow-[0_0_0_3px_color-mix(in_oklab,var(--err)_25%,transparent)]
              animate-pulse
            "
            title="STAGING / TEST ENVIRONMENT — NOT PRODUCTION"
          >
            STAGING - TESTING - DEVELOPMENT
          </span>
        )}

        {/* Right: Compact profile menu */}
        {hideProfileMenu ? (
          <div className="w-9 h-9" />
        ) : (
          <div className="relative" ref={menuRef}>
            <button
              ref={btnRef}
              aria-haspopup="menu"
              aria-expanded={menuOpen}
              onClick={() => setMenuOpen((v) => !v)}
              className={[
                "h-10 w-10 rounded-full border border-[var(--border)]",
                "bg-[color:var(--surface)] grid place-items-center",
                "shadow-[0_1px_2px_rgba(0,0,0,0.06)]",
                "hover:bg-[color:var(--surface)]/70 transition",
              ].join(" ")}
            >
              <span className="text-[12px] font-semibold text-[var(--foreground)]">
                {initialsFromEmail(user?.email)}
              </span>
            </button>

            {menuOpen && (
              <div
                role="menu"
                aria-label="Profile menu"
                className="absolute right-0 mt-2 w-56 rounded-xl border border-[var(--border)] bg-[color:var(--surface)] shadow-[0_12px_48px_color-mix(in_oklab,var(--accent)_16%,transparent)] overflow-hidden"
              >
                <div className="px-3 py-2 border-b border-[var(--border)]">
                  <div className="text-xs text-[var(--muted)]">Signed in</div>
                  <div className="truncate text-sm text-[var(--foreground)]/85">
                    {user?.email ?? "Guest"}
                  </div>
                </div>

                <div className="py-1">
                  {user ? (
                    <>
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
                    </>
                  ) : (
                    <>
                      <Link
                        href="/signin"
                        role="menuitem"
                        className="block px-3 py-2 text-sm transition-colors hover:bg-[var(--accent)] hover:text-white"
                        onClick={() => setMenuOpen(false)}
                      >
                        Sign in
                      </Link>
                      <Link
                        href="/signin?mode=signup"
                        role="menuitem"
                        className="block px-3 py-2 text-sm transition-colors hover:bg-[var(--accent)] hover:text-white"
                        onClick={() => setMenuOpen(false)}
                      >
                        Create account
                      </Link>
                    </>
                  )}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </header>
  );
}
