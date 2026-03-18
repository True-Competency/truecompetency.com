"use client";

import { ArrowLeft } from "lucide-react";
import { usePathname, useRouter } from "next/navigation";

const HIDDEN_EXACT_PATHS = new Set<string>([
  "/",
  "/about",
  "/signin",
  "/signup",
  "/committee",
  "/committee/competencies",
  "/committee/review-queue",
  "/committee/review-queue/competencies",
  "/committee/review-queue/questions",
  "/committee/members",
  "/committee/tags",
  "/admin",
  "/instructor",
  "/trainee",
]);

function shouldHide(pathname: string): boolean {
  if (HIDDEN_EXACT_PATHS.has(pathname)) return true;

  // Hide on all committee sidebar pages.
  if (pathname.startsWith("/committee/")) return true;
  if (pathname.startsWith("/admin/")) return true;

  return false;
}

export default function FloatingBackButton() {
  const router = useRouter();
  const pathname = usePathname();

  if (!pathname || shouldHide(pathname)) return null;

  const onBack = () => {
    if (typeof window !== "undefined" && window.history.length > 1) {
      router.back();
      return;
    }
    router.push("/");
  };

  return (
    <button
      type="button"
      aria-label="Go back"
      title="Go back"
      onClick={onBack}
      className="fixed left-5 top-5 z-50 inline-flex h-12 w-12 items-center justify-center rounded-full border border-[var(--border)] bg-white text-black shadow-[0_10px_24px_rgba(15,23,42,0.08)] transition-all duration-200 hover:border-[var(--accent)] hover:text-[var(--accent)] hover:shadow-[0_0_0_4px_color-mix(in_oklab,var(--accent)_20%,transparent),0_14px_30px_rgba(81,112,255,0.24)]"
    >
      <ArrowLeft className="h-5 w-5" strokeWidth={2.5} />
    </button>
  );
}
