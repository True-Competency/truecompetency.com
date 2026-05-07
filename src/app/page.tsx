// src/app/page.tsx
"use client";

import { useEffect, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import Link from "next/link";
import { supabase } from "@/lib/supabaseClient";

type UserRole = "trainee" | "instructor" | "committee" | "admin";
type Profile = { id: string; role: UserRole };
const ROLE_HOME: Record<UserRole, string> = {
  trainee: "/trainee",
  instructor: "/instructor",
  committee: "/committee",
  admin: "/admin",
};

const CONTACT_EMAIL = process.env.NEXT_PUBLIC_CONTACT_EMAIL;
const CONTACT_HREF = CONTACT_EMAIL ? `mailto:${CONTACT_EMAIL}` : "#";

const diffTone = (level: string) => {
  const key = level.toLowerCase();
  if (key === "beginner") return "var(--ok)";
  if (key === "intermediate") return "var(--warn)";
  if (key === "expert") return "var(--err)";
  return "var(--accent)";
};

export default function RootPage() {
  const router = useRouter();
  const [checking, setChecking] = useState(true);
  const [dashUrl, setDashUrl] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const { data: u, error } = await supabase.auth.getUser();
        if (error) throw error;
        const uid = u.user?.id ?? null;

        if (!uid) {
          if (!cancelled) {
            setDashUrl(null);
            setChecking(false);
          }
          return;
        }

        const { data: prof, error: perr } = await supabase
          .from("profiles")
          .select("id, role")
          .eq("id", uid)
          .maybeSingle<Profile>();
        if (perr) throw perr;
        if (!prof) {
          // No profile row visible to this session — almost always means the auth
          // session expired or token refresh failed mid-load, causing RLS to
          // evaluate auth.uid() = null. Sign out cleanly and route to signin so
          // the user gets a fresh session.
          await supabase.auth.signOut();
          if (!cancelled) {
            router.replace("/signin");
            setChecking(false);
          }
          return;
        }

        const home = ROLE_HOME[prof.role];

        if (!cancelled) {
          setDashUrl(home);
          router.replace(home);
          setChecking(false);
        }
      } catch {
        if (!cancelled) setChecking(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [router]);

  return <Landing checking={checking} dashUrl={dashUrl} />;
}

function Landing({
  checking,
  dashUrl,
}: {
  checking: boolean;
  dashUrl: string | null;
}) {
  return (
    <div className="relative flex-1 overflow-hidden bg-[radial-gradient(circle_at_top,_rgba(102,126,234,0.25),_transparent_55%)]">
      <div aria-hidden className="bg-noise absolute inset-0 opacity-[0.06]" />
      <div aria-hidden className="beams pointer-events-none absolute inset-0" />
      <Nav dashUrl={dashUrl} checking={checking} />
      <main className="relative z-10 space-y-16 pb-16">
        <HeroSection contactHref={CONTACT_HREF} />
        <HighlightsSection />
        <ProgressPreviewSection />
        <WorkflowSection />
      </main>
      <footer className="border-t border-gray-100 bg-white py-10">
        <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-6 px-6 md:flex-row">
          <div className="flex items-center gap-2.5">
            <Image
              src="/TC_Logo.png"
              alt="True Competency"
              width={28}
              height={28}
              className="object-contain"
            />
            <span
              className="text-sm font-semibold text-gray-800"
              style={{ fontFamily: "var(--font-heading)" }}
            >
              True Competency
            </span>
          </div>
          <p className="text-xs text-gray-400">
            © {new Date().getFullYear()} True Competency. All rights reserved.
          </p>
          <div className="flex items-center gap-6">
            <Link
              href="/privacy"
              className="text-xs text-gray-400 transition-colors hover:text-gray-700"
            >
              Privacy
            </Link>
            <Link
              href="/terms"
              className="text-xs text-gray-400 transition-colors hover:text-gray-700"
            >
              Terms
            </Link>
            <a
              href={CONTACT_HREF}
              className="text-xs text-gray-400 transition-colors hover:text-gray-700"
            >
              Contact
            </a>
          </div>
        </div>
      </footer>
    </div>
  );
}

function Nav({
  dashUrl,
  checking,
}: {
  dashUrl: string | null;
  checking: boolean;
}) {
  const [scrolled, setScrolled] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 20);
    window.addEventListener("scroll", onScroll);
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <nav
      className="fixed top-0 left-0 right-0 z-50 transition-all duration-300"
      style={{
        background: scrolled ? "rgba(255,255,255,0.92)" : "transparent",
        backdropFilter: scrolled ? "blur(20px)" : "none",
        borderBottom: scrolled ? "1px solid rgba(0,0,0,0.06)" : "none",
        boxShadow: scrolled ? "0 4px 30px rgba(0,0,0,0.05)" : "none",
      }}
    >
      <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-6">
        <div className="flex items-center gap-2.5">
          <Image
            src="/TC_Logo.png"
            alt="True Competency"
            width={36}
            height={36}
            className="object-contain"
          />
          <span
            className="text-sm font-bold tracking-tight text-gray-900"
            style={{ fontFamily: "var(--font-heading)" }}
          >
            True Competency
          </span>
        </div>

        <div className="hidden md:flex items-center gap-3">
          <Link
            href="/signin"
            className="px-4 py-2 text-sm font-medium text-gray-600 transition-colors hover:text-gray-900"
          >
            Sign In
          </Link>
          <Link
            href={dashUrl ?? "/signup"}
            className="rounded-full px-5 py-2.5 text-sm font-semibold text-white transition-all hover:opacity-90 hover:shadow-lg"
            style={{
              background: "linear-gradient(135deg, #5170ff 0%, #7b8fff 100%)",
            }}
          >
            {checking ? "Loading…" : dashUrl ? "Dashboard" : "Get Started"}
          </Link>
        </div>

        <button
          className="p-2 md:hidden"
          onClick={() => setMenuOpen((v) => !v)}
          aria-label="Toggle menu"
        >
          <div className="space-y-1.5">
            <div
              className={`h-0.5 w-6 bg-gray-800 transition-all ${menuOpen ? "translate-y-2 rotate-45" : ""}`}
            />
            <div
              className={`h-0.5 w-6 bg-gray-800 transition-all ${menuOpen ? "opacity-0" : ""}`}
            />
            <div
              className={`h-0.5 w-6 bg-gray-800 transition-all ${menuOpen ? "-translate-y-2 -rotate-45" : ""}`}
            />
          </div>
        </button>
      </div>

      {menuOpen && (
        <div className="space-y-3 border-t border-gray-100 bg-white px-6 py-4 md:hidden">
          <Link
            href="/about"
            className="block w-full text-left text-sm font-medium text-gray-700 py-2"
          >
            About
          </Link>
          <div className="flex gap-3 border-t border-gray-100 pt-2">
            <Link
              href="/signin"
              className="flex-1 rounded-full border border-gray-200 py-2.5 text-center text-sm font-medium text-gray-600"
            >
              Sign In
            </Link>
            <Link
              href={dashUrl ?? "/signup"}
              className="flex-1 rounded-full py-2.5 text-center text-sm font-semibold text-white"
              style={{ background: "#5170ff" }}
            >
              {checking ? "Loading…" : dashUrl ? "Dashboard" : "Get Started"}
            </Link>
          </div>
        </div>
      )}
    </nav>
  );
}

function HeroSection({ contactHref }: { contactHref: string }) {
  return (
    <section className="mx-auto max-w-6xl px-6 pt-32 lg:pt-36">
      <div className="grid gap-12 lg:grid-cols-[minmax(0,1fr)_520px] items-center">
        <div>
          <h1 className="mt-4 text-4xl md:text-5xl font-semibold leading-tight tracking-tight">
            Competency tracking built for real training programs
          </h1>
          <div className="accent-underline mt-5" />
          <p className="mt-6 text-base text-[var(--muted)] leading-relaxed">
            From structured enrollment to case logging, approvals, and
            leaderboards—this is the very environment our fellows, instructors,
            and committees already use to steward patient-ready operators.
          </p>
          <div className="mt-8 flex flex-wrap items-center gap-4">
            <Link
              href="/about"
              className="rounded-full border border-gray-200 bg-[var(--surface)] px-5 py-3 text-sm font-medium text-gray-700 transition-all hover:border-[#5170ff]/40 hover:text-[#5170ff] hover:shadow-lg"
            >
              About Us
            </Link>
            <a
              href={contactHref}
              className="rounded-full px-5 py-3 text-sm font-semibold text-white transition-all hover:opacity-90 hover:shadow-lg"
              style={{
                background: "linear-gradient(135deg, #5170ff 0%, #7b8fff 100%)",
              }}
            >
              Contact Us
            </a>
          </div>
          <div className="mt-10 flex flex-wrap items-center gap-6 text-xs uppercase tracking-[0.3em] text-[var(--muted)]">
            <span>Presented at</span>
            <div className="flex items-center gap-4">
              <Image
                src="/sponsors/APSC_Logo.png"
                alt="APSC"
                width={110}
                height={48}
                className="h-10 w-auto object-contain drop-shadow-[0_6px_20px_rgba(0,0,0,0.12)]"
              />
              <Image
                src="/TCIP_Black_Logo.png"
                alt="TCIP"
                width={110}
                height={48}
                className="hidden dark:block h-10 w-auto object-contain drop-shadow-[0_6px_20px_rgba(0,0,0,0.12)]"
              />
              <Image
                src="/TCIP_White_Logo.png"
                alt="TCIP"
                width={110}
                height={48}
                className="block dark:hidden h-10 w-auto object-contain drop-shadow-[0_6px_20px_rgba(0,0,0,0.12)]"
              />
            </div>
          </div>
        </div>
        <GlowingLogoCard />
      </div>
    </section>
  );
}

function SectionShell({
  id,
  eyebrow,
  title,
  intro,
  children,
}: {
  id?: string;
  eyebrow?: string;
  title: string;
  intro?: string;
  children: ReactNode;
}) {
  return (
    <section id={id} className="relative z-10 mx-auto max-w-6xl px-6">
      <div className="rounded-3xl border border-[var(--border)] bg-[var(--surface)]/90 backdrop-blur-xl shadow-[0_24px_80px_rgba(0,0,0,0.08)] p-6 md:p-10 space-y-6">
        <div>
          {eyebrow && (
            <p className="text-xs uppercase tracking-[0.32em] text-[var(--accent)]/75">
              {eyebrow}
            </p>
          )}
          <h2 className="mt-2 text-2xl md:text-3xl font-semibold tracking-tight">
            {title}
          </h2>
          {intro && (
            <p className="mt-3 text-sm md:text-base text-[var(--muted)] leading-relaxed">
              {intro}
            </p>
          )}
        </div>
        {children}
      </div>
    </section>
  );
}

const HIGHLIGHTS = [
  {
    title: "Competency catalog",
    description:
      "Browse the exact set of competencies you see after signing in—complete with filters, tag chips, search, and enrollment controls.",
  },
  {
    title: "Bulk test ready",
    description:
      "Need to enrol in every beginner or expert competency? Use the bulk testing workflow our trainees already rely on.",
  },
  {
    title: "Live progress tracking",
    description:
      "The same progress map that powers the trainee dashboard appears here: progress rows, completion labels, and percent bars.",
  },
  {
    title: "Leaderboards & tags",
    description:
      "Country leaderboards, top trainee lists, and trending tags keep faculty grounded in measurable completion numbers.",
  },
];

function HighlightsSection() {
  return (
    <SectionShell
      title="Your dashboard, highlighted"
      intro="Every tile below is drawn from the same components physicians interact with inside True Competency."
    >
      <div className="grid gap-4 md:grid-cols-2">
        {HIGHLIGHTS.map((item) => (
          <div
            key={item.title}
            className="group rounded-2xl border border-[var(--border)] bg-[var(--surface)]/90 p-5 transition duration-300 hover:-translate-y-1 hover:shadow-[0_18px_45px_rgba(0,0,0,0.12)]"
          >
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-semibold">{item.title}</h3>
            </div>
            <p className="mt-2 text-sm text-[var(--muted)] leading-relaxed">
              {item.description}
            </p>
          </div>
        ))}
      </div>
    </SectionShell>
  );
}

const PROGRESS_PREVIEW = [
  {
    label: "Overall completion",
    tone: "var(--accent)",
    status: "Clinic-ready",
    width: 0.78,
  },
  {
    label: "Beginner pathway",
    tone: "var(--ok)",
    status: "Learners finishing",
    width: 0.92,
  },
  {
    label: "Intermediate pathway",
    tone: "var(--warn)",
    status: "Steady progress",
    width: 0.64,
  },
  {
    label: "Expert pathway",
    tone: "var(--err)",
    status: "Needs final review",
    width: 0.38,
  },
];

const SAMPLE_COMPETENCIES = [
  {
    title: "IVUS Interpretation Essentials",
    diff: "Beginner",
    tags: ["IVUS", "Imaging"],
    progress: 72,
  },
  {
    title: "Complex Coronary Physiology",
    diff: "Intermediate",
    tags: ["Coronary", "Hemodynamics"],
    progress: 45,
  },
];

const SAMPLE_COUNTRIES = [
  { flag: "🇨🇦", label: "Canada", cases: 38 },
  { flag: "🇭🇰", label: "Hong Kong", cases: 26 },
  { flag: "🇦🇿", label: "Azerbaijan", cases: 19 },
];

const SAMPLE_TAGS = [
  { tag: "#IVUS", cases: 114 },
  { tag: "#Calcium", cases: 32 },
  { tag: "#Pathophysiology", cases: 15 },
];

function ProgressPreviewSection() {
  return (
    <SectionShell
      id="showcase"
      title="Track pathway readiness at a glance"
      intro="The same completion bars, cards, and widgets that guide our trainees appear below, showing how quickly a cohort moves from beginner through expert milestones."
    >
      <div className="grid gap-8 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
        <div className="space-y-4">
          {PROGRESS_PREVIEW.map((item) => (
            <ProgressPreviewBar key={item.label} item={item} />
          ))}
          <p className="text-xs text-[var(--muted)]">
            Fellows see these bars on their dashboard after every assessment,
            reinforcing exactly where they stand.
          </p>
        </div>
        <InsightsWidgetStack />
      </div>
    </SectionShell>
  );
}

function ProgressPreviewBar({
  item,
}: {
  item: (typeof PROGRESS_PREVIEW)[number];
}) {
  return (
    <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface)]/90 p-4 shadow-[0_12px_30px_rgba(0,0,0,0.08)]">
      <div className="flex items-center justify-between text-sm font-semibold">
        <span>{item.label}</span>
        <span className="text-xs uppercase tracking-wide text-[var(--muted)]">
          {item.status}
        </span>
      </div>
      <div className="mt-3 h-3 rounded-full bg-[var(--border)]/60 overflow-hidden">
        <div
          className="h-full rounded-full transition-[width] duration-700 ease-out"
          style={{
            width: `${Math.round(item.width * 100)}%`,
            background: `linear-gradient(90deg, ${item.tone}, color-mix(in oklab, ${item.tone} 65%, white))`,
          }}
        />
      </div>
    </div>
  );
}

const WORKFLOW_STEPS = [
  {
    title: "Search & enroll",
    detail:
      "Filter by difficulty, tags, or keyword to guide fellows toward the precise techniques you want them to master next.",
  },
  {
    title: "Track progress",
    detail:
      "Each competency card mirrors the logged-in experience with completion badges, tag chips, and confidence bars.",
  },
  {
    title: "Review leaderboards",
    detail:
      "Country and trainee leaderboards highlight where training momentum is strongest, helping faculty celebrate success.",
  },
  {
    title: "Bulk testing",
    detail:
      "When cohorts are ready, launch bulk testing to move an entire pathway into assessment without touching a spreadsheet.",
  },
];

function WorkflowSection() {
  return (
    <SectionShell
      title="A familiar workflow from landing to dashboard"
      intro="Whether you sign in as a fellow, instructor, or committee member, you land on the exact tools previewed here."
    >
      <div className="grid gap-4 md:grid-cols-2">
        {WORKFLOW_STEPS.map((step, idx) => (
          <div
            key={step.title}
            className="rounded-2xl border border-[var(--border)] bg-[var(--field)]/80 p-5 transition duration-300 hover:border-[var(--accent)]/60 hover:shadow-[0_16px_38px_rgba(0,0,0,0.1)]"
          >
            <div className="flex items-center gap-3">
              <span className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-[var(--surface)] text-sm font-semibold text-[var(--accent)]">
                {idx + 1}
              </span>
              <h3 className="text-base font-semibold">{step.title}</h3>
            </div>
            <p className="mt-2 text-sm text-[var(--muted)] leading-relaxed">
              {step.detail}
            </p>
          </div>
        ))}
      </div>
    </SectionShell>
  );
}

function GlowingLogoCard() {
  return (
    <div className="relative mx-auto w-full max-w-[520px] grid place-items-center">
      <Image
        src="/TC_Logo.png"
        alt="True Competency"
        width={260}
        height={260}
        className="relative z-[1] object-contain drop-shadow-[0_30px_90px_color-mix(in_oklab,var(--accent)_45%,transparent)]"
        priority
      />
    </div>
  );
}

function ExampleCompetencyShowcase({
  emphasis = "hero",
  children,
}: {
  emphasis?: "hero" | "compact";
  children?: React.ReactNode;
}) {
  return (
    <div
      className={[
        "relative rounded-[32px] border border-[var(--border)] bg-[var(--surface)]/95 backdrop-blur-xl",
        emphasis === "hero"
          ? "shadow-[0_30px_90px_rgba(0,0,0,0.18)] p-6"
          : "shadow-[0_18px_60px_rgba(0,0,0,0.12)] p-5",
      ].join(" ")}
    >
      <div className="absolute -top-6 -right-6 h-16 w-16 rounded-full bg-[var(--accent)]/30 blur-3xl" />
      <div className="space-y-5 relative z-[1]">
        <div className="rounded-2xl border border-[var(--border)] bg-[var(--field)]/80 p-4">
          <div className="flex items-center justify-between text-xs text-[var(--muted)]">
            <span>Currently Enrolled</span>
            <span>2 active competencies</span>
          </div>
          <div className="mt-4 space-y-4">
            {SAMPLE_COMPETENCIES.map((comp) => (
              <div
                key={comp.title}
                className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] px-4 py-3"
              >
                <div className="flex items-center justify-between gap-3">
                  <p className="text-xs uppercase tracking-[0.3em] text-[var(--muted)]">
                    Competency
                  </p>
                  <span
                    className="rounded-full px-2 py-0.5 text-[11px] font-semibold text-white"
                    style={{ background: diffTone(comp.diff) }}
                  >
                    {comp.diff}
                  </span>
                </div>
                <h3 className="mt-1 text-base font-semibold leading-tight">
                  {comp.title}
                </h3>
                <div className="mt-2 flex flex-wrap gap-1">
                  {comp.tags.map((tag) => (
                    <span
                      key={tag}
                      className="text-[10px] rounded-full border border-[var(--border)] bg-[var(--field)] px-2 py-0.5 text-[var(--foreground)]/70"
                    >
                      {tag}
                    </span>
                  ))}
                </div>
                <div className="mt-3 h-2 rounded-full bg-[var(--border)]/60 overflow-hidden">
                  <div
                    className="h-full rounded-full"
                    style={{
                      width: `${comp.progress}%`,
                      background: "var(--accent)",
                    }}
                  />
                </div>
              </div>
            ))}
          </div>
        </div>
        <div className="grid gap-4 md:grid-cols-2">
          <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-4">
            <div className="text-xs uppercase tracking-[0.3em] text-[var(--muted)]">
              Country momentum
            </div>
            <div className="mt-3 space-y-2">
              {SAMPLE_COUNTRIES.map((entry) => (
                <div
                  key={entry.label}
                  className="flex items-center justify-between text-sm"
                >
                  <div className="flex items-center gap-2">
                    <span>{entry.flag}</span>
                    <span>{entry.label}</span>
                  </div>
                  <span className="text-xs text-[var(--muted)]">
                    {entry.cases} completions
                  </span>
                </div>
              ))}
            </div>
          </div>
          <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-4">
            <div className="text-xs uppercase tracking-[0.3em] text-[var(--muted)]">
              Tag momentum
            </div>
            <div className="mt-3 space-y-2">
              {SAMPLE_TAGS.map((tag) => (
                <div
                  key={tag.tag}
                  className="flex items-center justify-between rounded-xl border border-[var(--border)] bg-[var(--field)]/80 px-3 py-2 text-xs font-semibold"
                >
                  <span>{tag.tag}</span>
                  <span className="text-[var(--muted)]">{tag.cases} cases</span>
                </div>
              ))}
            </div>
          </div>
        </div>
        {children}
      </div>
    </div>
  );
}

function InsightsWidgetStack() {
  return (
    <div className="space-y-4">
      <ExampleCompetencyShowcase emphasis="compact" />
    </div>
  );
}
