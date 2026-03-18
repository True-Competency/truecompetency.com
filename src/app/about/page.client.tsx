"use client";

import { useEffect, useRef, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { Building2, Stethoscope, GraduationCap } from "lucide-react";

type UserRole = "trainee" | "instructor" | "committee";
type Profile = { id: string; role: UserRole };
type LandingStats = {
  competencies: number;
  committeeMembers: number;
  questions: number;
  countries: number;
};
const ROLE_HOME: Record<UserRole, string> = {
  trainee: "/trainee",
  instructor: "/instructor",
  committee: "/committee",
};
const CONTACT_EMAIL =
  process.env.NEXT_PUBLIC_CONTACT_EMAIL || "contact@truecompetency.com";
const CONTACT_HREF = `mailto:${CONTACT_EMAIL}`;

// ─── Auth gate ───────────────────────────────────────────────────────────────
export default function RootPage({ stats }: { stats: LandingStats }) {
  const [checking, setChecking] = useState(true);
  const [dashUrl, setDashUrl] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        // Dynamically import to avoid SSR issues
        const { supabase } = await import("@/lib/supabaseClient");
        const { data: u } = await supabase.auth.getUser();
        const uid = u.user?.id ?? null;
        if (!uid) {
          if (!cancelled) {
            setDashUrl(null);
            setChecking(false);
          }
          return;
        }
        const { data: prof } = await supabase
          .from("profiles")
          .select("id, role")
          .eq("id", uid)
          .single<Profile>();
        if (prof && !cancelled) setDashUrl(ROLE_HOME[prof.role]);
      } catch {
        /* ignore */
      } finally {
        if (!cancelled) setChecking(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  return <Landing checking={checking} dashUrl={dashUrl} stats={stats} />;
}

// ─── Animated counter hook ───────────────────────────────────────────────────
function useCountUp(target: number, duration = 1800) {
  const [count, setCount] = useState(0);
  const ref = useRef<HTMLSpanElement>(null);
  const started = useRef(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting && !started.current) {
          started.current = true;
          const start = performance.now();
          const tick = (now: number) => {
            const progress = Math.min((now - start) / duration, 1);
            const eased = 1 - Math.pow(1 - progress, 3);
            setCount(Math.floor(eased * target));
            if (progress < 1) requestAnimationFrame(tick);
          };
          requestAnimationFrame(tick);
        }
      },
      { threshold: 0.5 },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [target, duration]);

  return { count, ref };
}

// ─── Fade-in on scroll ───────────────────────────────────────────────────────
function FadeIn({
  children,
  delay = 0,
  className = "",
}: {
  children: React.ReactNode;
  delay?: number;
  className?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setVisible(true);
          observer.disconnect();
        }
      },
      { threshold: 0.1 },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  return (
    <div
      ref={ref}
      className={className}
      style={{
        opacity: visible ? 1 : 0,
        transform: visible ? "translateY(0)" : "translateY(28px)",
        transition: `opacity 0.7s ease ${delay}ms, transform 0.7s ease ${delay}ms`,
      }}
    >
      {children}
    </div>
  );
}

// ─── Stat counter ────────────────────────────────────────────────────────────
function StatCounter({
  value,
  label,
  suffix = "",
}: {
  value: number;
  label: string;
  suffix?: string;
}) {
  const { count, ref } = useCountUp(value);
  return (
    <div className="text-center">
      <div className="flex items-end justify-center gap-0.5">
        <span
          ref={ref}
          className="text-5xl font-bold tracking-tight text-gray-900"
          style={{ fontFamily: "var(--font-heading)" }}
        >
          {count}
        </span>
        <span className="text-3xl font-bold text-[#5170ff] mb-1">{suffix}</span>
      </div>
      <p className="mt-2 text-sm font-medium uppercase tracking-widest text-gray-500">
        {label}
      </p>
    </div>
  );
}

// ─── Founder card ────────────────────────────────────────────────────────────
function FounderCard({
  name,
  role,
  bio,
  src,
  imageAlt,
  featured = false,
}: {
  name: string;
  role: string;
  bio: string;
  src: string;
  imageAlt?: string;
  featured?: boolean;
}) {
  const [hovered, setHovered] = useState(false);
  const [imageError, setImageError] = useState(false);

  return (
    <div
      className="relative overflow-hidden rounded-3xl cursor-pointer"
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        transform: hovered ? "scale(1.03)" : "scale(1)",
        transition: "transform 0.4s cubic-bezier(0.34, 1.56, 0.64, 1)",
        boxShadow: featured
          ? hovered
            ? "0 40px 100px rgba(81, 112, 255, 0.35)"
            : "0 20px 60px rgba(81, 112, 255, 0.2)"
          : hovered
            ? "0 30px 80px rgba(81, 112, 255, 0.2)"
            : "0 8px 30px rgba(0,0,0,0.08)",
        border: featured ? "2px solid rgba(81,112,255,0.2)" : "none",
      }}
    >
      {/* Photo placeholder */}
      <div
        className={`${featured ? "aspect-[3/5]" : "aspect-[3/4]"} relative bg-gradient-to-br from-slate-100 to-slate-200 flex items-center justify-center overflow-hidden`}
      >
        <div className="absolute inset-0 bg-gradient-to-br from-[#5170ff]/10 to-transparent" />
        {!imageError ? (
          <Image
            src={src}
            alt={imageAlt ?? name}
            width={400}
            height={600}
            className="w-full h-full object-cover object-top"
            onError={() => setImageError(true)}
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-slate-200 to-slate-300 px-6 text-center text-sm font-medium text-slate-500">
            Photo coming soon
          </div>
        )}
        {/* Overlay on hover */}
        <div
          className="absolute inset-0 flex flex-col justify-end p-6"
          style={{
            background:
              "linear-gradient(to top, rgba(10,10,40,0.92) 0%, rgba(10,10,40,0.4) 50%, transparent 100%)",
            opacity: hovered ? 1 : 0,
            transition: "opacity 0.35s ease",
          }}
        >
          <p
            className="text-white/90 text-sm leading-relaxed"
            style={{
              transform: hovered ? "translateY(0)" : "translateY(16px)",
              transition: "transform 0.4s ease",
            }}
          >
            {bio}
          </p>
        </div>
      </div>
      {/* Name bar */}
      <div className="bg-white px-5 py-4 border-t border-gray-100">
        <p
          className="font-semibold text-gray-900"
          style={{ fontFamily: "var(--font-heading)" }}
        >
          {name}
        </p>
        <p className="text-sm text-[#5170ff] font-medium mt-0.5">{role}</p>
      </div>
    </div>
  );
}

// ─── Role tab section ────────────────────────────────────────────────────────
const ROLES = [
  {
    id: "society",
    label: "Societies & Committees",
    icon: Building2,
    color: "#5170ff",
    points: [
      "Define and organize competency frameworks",
      "Build question banks tied to competencies",
      "Govern review and approval workflows with full audit trails",
      "Monitor coverage across programs with real-time dashboards",
    ],
  },
  {
    id: "physician",
    label: "Attending Physicians",
    icon: Stethoscope,
    color: "#5170ff",
    points: [
      "Access society-approved competency content",
      "Assess trainee performance against defined standards",
      "Contribute questions through structured review",
      "Track cohort progress across rotations",
    ],
  },
  {
    id: "trainee",
    label: "Trainees & Learners",
    icon: GraduationCap,
    color: "#5170ff",
    points: [
      "Follow a clear, structured competency pathway",
      "See exactly what is expected and where you stand",
      "Build a longitudinal record of verified progression",
      "Achieve defensible, audit-ready proof of readiness",
    ],
  },
];

function RoleTabs() {
  const [active, setActive] = useState(0);
  const role = ROLES[active];
  const ActiveIcon = role.icon;

  return (
    <div>
      {/* Tab buttons */}
      <div className="flex flex-wrap gap-2 mb-8 justify-center md:justify-start">
        {ROLES.map((r, i) => {
          const TabIcon = r.icon;
          return (
            <button
              key={r.id}
              onClick={() => setActive(i)}
              className="flex items-center gap-2 px-4 py-2.5 rounded-full text-sm font-semibold transition-all"
              style={{
                background: active === i ? r.color : "transparent",
                color: active === i ? "white" : "#6b7280",
                border: `2px solid ${active === i ? r.color : "#e5e7eb"}`,
                boxShadow: active === i ? `0 8px 24px ${r.color}40` : "none",
              }}
            >
              <TabIcon size={16} />
              {r.label}
            </button>
          );
        })}
      </div>

      {/* Content */}
      <div
        className="rounded-3xl border border-gray-100 bg-gray-50/50 p-8"
        style={{ borderLeft: `4px solid ${role.color}` }}
      >
        <div className="flex items-center gap-3 mb-6">
          <div
            className="grid h-12 w-12 place-items-center rounded-2xl"
            style={{ background: `${role.color}14`, color: role.color }}
          >
            <ActiveIcon size={24} />
          </div>
          <h3 className="text-xl font-bold text-gray-900">{role.label}</h3>
        </div>
        <ul className="space-y-3">
          {role.points.map((p) => (
            <li key={p} className="flex items-start gap-3 text-gray-600">
              <div className="mt-2 h-1.5 w-1.5 rounded-full flex-shrink-0 bg-[#5170ff]" />
              <span className="leading-relaxed">{p}</span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

// ─── Nav ─────────────────────────────────────────────────────────────────────
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

  const scrollTo = (id: string) => {
    document.getElementById(id)?.scrollIntoView({ behavior: "smooth" });
    setMenuOpen(false);
  };

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
      <div className="mx-auto max-w-7xl px-6 h-16 flex items-center justify-between">
        {/* Logo */}
        <div className="flex items-center gap-2.5">
          <Image
            src="/TC_Logo.png"
            alt="True Competency"
            width={36}
            height={36}
            className="object-contain"
          />
          <span
            className="font-bold text-gray-900 text-sm tracking-tight"
            style={{ fontFamily: "var(--font-heading)" }}
          >
            True Competency
          </span>
        </div>

        {/* Desktop links */}
        <div className="hidden md:flex items-center gap-8">
          {[
            ["About", "about"],
            ["Team", "team"],
            ["Partners", "partners"],
            ["Contact", "contact"],
          ].map(([label, id]) => (
            <button
              key={id}
              onClick={() => scrollTo(id)}
              className="text-sm font-medium text-gray-600 hover:text-gray-900 transition-colors"
            >
              {label}
            </button>
          ))}
        </div>

        {/* CTA */}
        <div className="hidden md:flex items-center gap-3">
          <Link
            href="/signin"
            className="text-sm font-medium text-gray-600 hover:text-gray-900 transition-colors px-4 py-2"
          >
            Sign In
          </Link>
          <Link
            href={dashUrl ?? "/signup"}
            className="text-sm font-semibold text-white px-5 py-2.5 rounded-full transition-all hover:opacity-90 hover:shadow-lg"
            style={{
              background: "linear-gradient(135deg, #5170ff 0%, #7b8fff 100%)",
            }}
          >
            {checking ? "Loading…" : dashUrl ? "Dashboard" : "Get Started"}
          </Link>
        </div>

        {/* Mobile menu button */}
        <button
          className="md:hidden p-2"
          onClick={() => setMenuOpen(!menuOpen)}
        >
          <div className="space-y-1.5">
            <div
              className={`h-0.5 w-6 bg-gray-800 transition-all ${menuOpen ? "rotate-45 translate-y-2" : ""}`}
            />
            <div
              className={`h-0.5 w-6 bg-gray-800 transition-all ${menuOpen ? "opacity-0" : ""}`}
            />
            <div
              className={`h-0.5 w-6 bg-gray-800 transition-all ${menuOpen ? "-rotate-45 -translate-y-2" : ""}`}
            />
          </div>
        </button>
      </div>

      {/* Mobile menu */}
      {menuOpen && (
        <div className="md:hidden bg-white border-t border-gray-100 px-6 py-4 space-y-3">
          {[
            ["About", "about"],
            ["Team", "team"],
            ["Partners", "partners"],
            ["Contact", "contact"],
          ].map(([label, id]) => (
            <button
              key={id}
              onClick={() => scrollTo(id)}
              className="block w-full text-left text-sm font-medium text-gray-700 py-2"
            >
              {label}
            </button>
          ))}
          <div className="pt-2 border-t border-gray-100 flex gap-3">
            <Link
              href="/signin"
              className="flex-1 text-center text-sm font-medium text-gray-600 py-2.5 border border-gray-200 rounded-full"
            >
              Sign In
            </Link>
            <Link
              href={dashUrl ?? "/signup"}
              className="flex-1 text-center text-sm font-semibold text-white py-2.5 rounded-full"
              style={{ background: "#5170ff" }}
            >
              Get Started
            </Link>
          </div>
        </div>
      )}
    </nav>
  );
}

// ─── Main landing ─────────────────────────────────────────────────────────────
function Landing({
  checking,
  dashUrl,
  stats,
}: {
  checking: boolean;
  dashUrl: string | null;
  stats: LandingStats;
}) {
  // Parallax mouse effect for hero
  const heroRef = useRef<HTMLDivElement>(null);
  const blobRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      if (!blobRef.current) return;
      const x = (e.clientX / window.innerWidth - 0.5) * 40;
      const y = (e.clientY / window.innerHeight - 0.5) * 40;
      blobRef.current.style.transform = `translate(${x}px, ${y}px)`;
    };
    window.addEventListener("mousemove", onMove);
    return () => window.removeEventListener("mousemove", onMove);
  }, []);

  return (
    <div
      className="bg-white min-h-screen"
      style={{ fontFamily: "var(--font-sans)" }}
    >
      {/* Google Fonts */}
      <style>{`
        
        html { scroll-behavior: smooth; }
        .hero-gradient { background: radial-gradient(ellipse 80% 60% at 50% -20%, rgba(81,112,255,0.12) 0%, transparent 70%); }
        .section-divider { height: 1px; background: linear-gradient(90deg, transparent, rgba(81,112,255,0.2), transparent); }
        .partner-logo { filter: grayscale(1) opacity(0.5); transition: filter 0.3s; }
        .partner-logo:hover { filter: grayscale(0) opacity(1); }
      `}</style>

      <Nav dashUrl={dashUrl} checking={checking} />

      {/* ── HERO ── */}
      <section
        ref={heroRef}
        className="relative pt-32 pb-24 overflow-hidden hero-gradient"
      >
        {/* Animated blob */}
        <div
          ref={blobRef}
          className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[700px] h-[700px] rounded-full pointer-events-none"
          style={{
            background:
              "radial-gradient(circle, rgba(81,112,255,0.08) 0%, transparent 70%)",
            transition: "transform 0.8s cubic-bezier(0.25, 0.46, 0.45, 0.94)",
          }}
        />

        <div className="relative mx-auto max-w-5xl px-6 text-center">
          <FadeIn delay={100}>
            <h1
              className="text-5xl md:text-7xl font-bold leading-tight tracking-tight text-gray-900"
              style={{ fontFamily: "var(--font-heading)" }}
            >
              <span className="relative inline-block">
                <span className="relative z-10" style={{ color: "#5170ff" }}>
                  One platform.
                </span>
                <svg
                  className="absolute -bottom-2 left-0 w-full"
                  height="8"
                  viewBox="0 0 200 8"
                  preserveAspectRatio="none"
                >
                  <path
                    d="M0 6 Q50 0 100 4 Q150 8 200 2"
                    stroke="#5170ff"
                    strokeWidth="2.5"
                    fill="none"
                    strokeLinecap="round"
                    opacity="0.4"
                  />
                </svg>
              </span>{" "}
              Three roles. One Standard of Readiness.
            </h1>
          </FadeIn>

          <FadeIn delay={200}>
            <p className="mt-6 text-lg md:text-xl text-gray-500 max-w-2xl mx-auto leading-relaxed font-light">
              A structured platform for committee-driven competency management,
              assessment, and trainee progress tracking — built for modern
              clinical training programs.
            </p>
          </FadeIn>

          <FadeIn delay={300}>
            <div className="mt-10 flex flex-wrap items-center justify-center gap-4">
              <Link
                href={dashUrl ?? "/signup"}
                className="inline-flex items-center gap-2 rounded-full px-8 py-4 text-base font-semibold text-white shadow-xl transition-all hover:shadow-2xl hover:scale-105 active:scale-95"
                style={{
                  background:
                    "linear-gradient(135deg, #5170ff 0%, #7b8fff 100%)",
                  boxShadow: "0 20px 60px rgba(81,112,255,0.35)",
                }}
              >
                {checking
                  ? "Loading…"
                  : dashUrl
                    ? "Continue to Dashboard"
                    : "Get Started"}
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
                  <path
                    d="M5 12h14M12 5l7 7-7 7"
                    stroke="white"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              </Link>
              <button
                onClick={() =>
                  document
                    .getElementById("about")
                    ?.scrollIntoView({ behavior: "smooth" })
                }
                className="inline-flex items-center gap-2 rounded-full px-8 py-4 text-base font-semibold text-gray-700 border border-gray-200 bg-white hover:border-[#5170ff]/40 hover:text-[#5170ff] transition-all hover:shadow-lg"
              >
                Learn More
              </button>
            </div>
          </FadeIn>
        </div>
      </section>

      <div className="section-divider mx-auto max-w-4xl" />

      {/* ── STATS ── */}
      <section className="py-20 bg-white">
        <div className="mx-auto max-w-4xl px-6">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-12">
            <StatCounter value={stats.competencies} label="Competencies" />
            <StatCounter
              value={stats.committeeMembers}
              label="Committee Members"
            />
            <StatCounter value={stats.questions} label="Questions" />
            <StatCounter value={stats.countries} label="Countries" />
          </div>
          <p className="mt-10 text-center text-sm italic tracking-[0.2em] text-gray-400">
            and growing
          </p>
        </div>
      </section>

      <div className="section-divider mx-auto max-w-4xl" />

      {/* ── PROBLEM ── */}
      <section className="py-24 bg-white overflow-hidden">
        <div className="mx-auto max-w-6xl px-6">
          <FadeIn>
            <div className="text-center mb-16">
              <p className="text-xs font-semibold uppercase tracking-widest text-[#5170ff] mb-3">
                The Problem
              </p>
              <h2
                className="text-4xl font-bold text-gray-900"
                style={{ fontFamily: "var(--font-heading)" }}
              >
                A broken chain
              </h2>
              <p className="mt-4 text-gray-400 max-w-xl mx-auto">
                Each group works in isolation. No shared record. No common
                standard.
              </p>
            </div>
          </FadeIn>

          {/* Chain layout */}
          <div className="relative">
            <div className="grid md:grid-cols-3 gap-8 relative">
              {[
                {
                  role: "Societies",
                  action: "Publish standards",
                  problem:
                    "have no way to verify they're being taught or tracked.",
                  Icon: Building2,
                  color: "#f59e0b",
                  bg: "#fffbeb",
                  border: "#fde68a",
                },
                {
                  role: "Attending Physicians",
                  action: "Assess trainees",
                  problem: "with no shared structure or longitudinal record.",
                  Icon: Stethoscope,
                  color: "#10b981",
                  bg: "#f0fdf4",
                  border: "#a7f3d0",
                },
                {
                  role: "Trainees",
                  action: "Progress through training",
                  problem:
                    "without clear milestones or defensible proof of readiness.",
                  Icon: GraduationCap,
                  color: "#5170ff",
                  bg: "#eff2ff",
                  border: "#c7d2fe",
                },
              ].map((item, i) => (
                <FadeIn key={item.role} delay={i * 150}>
                  <div className="relative flex flex-col">
                    {/* Icon bubble */}
                    <div className="flex justify-center mb-3">
                      <div className="w-14 h-14 flex items-center justify-center relative z-10">
                        <item.Icon size={28} style={{ color: "#5170ff" }} />
                      </div>
                    </div>

                    {/* Card */}
                    <div className="flex-1 rounded-3xl bg-gray-50 border border-gray-100 p-6 text-center">
                      <p className="text-xs font-semibold uppercase tracking-widest mb-2 text-[#5170ff]">
                        {item.role}
                      </p>
                      <p
                        className="font-semibold text-gray-900 mb-3 text-lg"
                        style={{ fontFamily: "var(--font-heading)" }}
                      >
                        {item.action}
                      </p>
                      {/* Break line */}
                      <div className="flex items-center gap-2 my-4">
                        <div className="flex-1 h-px bg-gray-200" />
                        <span className="text-xs font-semibold text-red-400 uppercase tracking-widest px-2">
                          but
                        </span>
                        <div className="flex-1 h-px bg-gray-200" />
                      </div>
                      <p className="text-gray-500 text-sm leading-relaxed">
                        {item.problem}
                      </p>
                    </div>
                  </div>
                </FadeIn>
              ))}
            </div>
          </div>

          <FadeIn delay={300}>
            <div className="mt-10 text-center">
              <p
                className="text-xl font-semibold text-gray-900 italic"
                style={{ fontFamily: "var(--font-heading)" }}
              >
                &ldquo;The standards exist. The infrastructure
                doesn&apos;t.&rdquo;
              </p>
            </div>
          </FadeIn>
        </div>
      </section>

      <div className="section-divider mx-auto max-w-4xl" />

      {/* ── ABOUT ── */}
      <section id="about" className="py-24 bg-white">
        <div className="mx-auto max-w-6xl px-6">
          <div className="grid lg:grid-cols-2 gap-16 items-start">
            <FadeIn>
              <div>
                <p className="text-xs font-semibold uppercase tracking-widest text-[#5170ff] mb-4">
                  About the Platform
                </p>
                <h2
                  className="text-4xl md:text-5xl font-bold text-gray-900 leading-tight"
                  style={{ fontFamily: "var(--font-heading)" }}
                >
                  Standardizing excellence in clinical training
                </h2>
                <p className="mt-6 text-gray-500 text-lg leading-relaxed font-light">
                  True Competency was born from a simple observation: clinical
                  training programs lacked a rigorous, structured framework for
                  tracking and validating procedural competency.
                </p>
                <p className="mt-4 text-gray-500 leading-relaxed">
                  Our platform bridges the gap between didactic learning and
                  clinical readiness. Committee members curate evidence-based
                  competencies, trainees demonstrate mastery through structured
                  assessment, and instructors gain real-time visibility into
                  cohort progress.
                </p>
                <div className="mt-8 grid grid-cols-2 gap-4">
                  {[
                    [
                      "Committee-Driven",
                      "Expert-curated content with peer review",
                    ],
                    [
                      "Evidence-Based",
                      "Grounded in clinical literature and guidelines",
                    ],
                    [
                      "Multi-Specialty",
                      "Expanding across procedural disciplines",
                    ],
                    ["Real-Time", "Live progress tracking and analytics"],
                  ].map(([title, desc]) => (
                    <div
                      key={title}
                      className="rounded-2xl border border-gray-100 p-4 bg-gray-50/50"
                    >
                      <div className="h-1.5 w-6 rounded-full bg-[#5170ff] mb-3" />
                      <p className="font-semibold text-gray-900 text-sm">
                        {title}
                      </p>
                      <p className="text-xs text-gray-500 mt-1 leading-relaxed">
                        {desc}
                      </p>
                    </div>
                  ))}
                </div>
              </div>
            </FadeIn>

            {/* Right side: role tabs */}
            <FadeIn delay={150}>
              <div>
                <p className="text-xs font-semibold uppercase tracking-widest text-gray-400 mb-6">
                  One platform. Three roles.
                </p>
                <RoleTabs />
              </div>
            </FadeIn>
          </div>
        </div>
      </section>

      <div className="section-divider mx-auto max-w-4xl" />

      {/* ── WHY DIFFERENT ── */}
      <section className="py-24 bg-gray-50/50">
        <div className="mx-auto max-w-6xl px-6">
          <FadeIn>
            <div className="text-center mb-14">
              <p className="text-xs font-semibold uppercase tracking-widest text-[#5170ff] mb-3">
                Why It&apos;s Different
              </p>
              <h2
                className="text-4xl font-bold text-gray-900"
                style={{ fontFamily: "var(--font-heading)" }}
              >
                Built for the gap between content delivery and clinical outcomes
              </h2>
            </div>
          </FadeIn>
          <div className="grid md:grid-cols-3 gap-6">
            {[
              {
                not: "Not an LMS",
                desc: "True Competency doesn't deliver passive content. It governs active competency progression.",
              },
              {
                not: "Not a registry",
                desc: "True Competency doesn't log procedures. It tracks whether trainees are meeting defined standards.",
              },
              {
                not: "Not a scheduling tool",
                desc: "True Competency is purpose-built for training governance, not program administration.",
              },
            ].map((item, i) => (
              <FadeIn key={item.not} delay={i * 100}>
                <div className="rounded-3xl border border-gray-100 bg-white p-8 hover:shadow-lg transition-all group">
                  <div className="inline-flex items-center gap-2 rounded-full bg-red-50 border border-red-100 px-3 py-1 mb-5">
                    <span className="text-red-400 text-sm font-bold">✕</span>
                    <span className="text-sm font-semibold text-red-500">
                      {item.not}
                    </span>
                  </div>
                  <p className="text-gray-600 leading-relaxed">{item.desc}</p>
                </div>
              </FadeIn>
            ))}
          </div>
        </div>
      </section>

      <div className="section-divider mx-auto max-w-4xl" />

      {/* ── HOW IT WORKS ── */}
      <section className="py-24 bg-gray-50/50">
        <div className="mx-auto max-w-6xl px-6">
          <FadeIn>
            <div className="text-center mb-16">
              <p className="text-xs font-semibold uppercase tracking-widest text-[#5170ff] mb-3">
                How It Works
              </p>
              <h2
                className="text-4xl font-bold text-gray-900"
                style={{ fontFamily: "var(--font-heading)" }}
              >
                From enrollment to certification
              </h2>
            </div>
          </FadeIn>
          <div className="grid md:grid-cols-3 gap-6">
            {[
              {
                step: "01",
                title: "Enroll",
                desc: "Browse the committee-curated competency catalog and enroll in pathways relevant to your specialty and level.",
              },
              {
                step: "02",
                title: "Assess",
                desc: "Answer case-based questions designed by clinical experts. Receive instant feedback tied to evidence-based guidelines.",
              },
              {
                step: "03",
                title: "Achieve",
                desc: "Demonstrate mastery, earn instructor approval, and build a verifiable record of clinical competency.",
              },
            ].map((item, i) => (
              <FadeIn key={item.step} delay={i * 100}>
                <div className="relative rounded-3xl border border-gray-100 bg-white p-8 hover:shadow-xl transition-all group overflow-hidden">
                  <div
                    className="absolute -top-4 -right-4 text-[120px] font-bold text-gray-50 select-none leading-none group-hover:text-[#5170ff]/5 transition-colors"
                    style={{ fontFamily: "var(--font-heading)" }}
                  >
                    {item.step}
                  </div>
                  <div className="relative">
                    <div
                      className="h-10 w-10 rounded-2xl flex items-center justify-center mb-5 text-white text-sm font-bold"
                      style={{
                        background: "linear-gradient(135deg, #5170ff, #7b8fff)",
                      }}
                    >
                      {item.step}
                    </div>
                    <h3
                      className="text-xl font-bold text-gray-900 mb-3"
                      style={{ fontFamily: "var(--font-heading)" }}
                    >
                      {item.title}
                    </h3>
                    <p className="text-gray-500 leading-relaxed text-sm">
                      {item.desc}
                    </p>
                  </div>
                </div>
              </FadeIn>
            ))}
          </div>
        </div>
      </section>

      <div className="section-divider mx-auto max-w-4xl" />

      {/* ── DASHBOARD PREVIEW ── */}
      <section className="py-24 bg-white overflow-hidden">
        <div className="mx-auto max-w-6xl px-6">
          <FadeIn>
            <div className="text-center mb-12">
              <p className="text-xs font-semibold uppercase tracking-widest text-[#5170ff] mb-3">
                The Platform
              </p>
              <h2
                className="text-4xl font-bold text-gray-900"
                style={{ fontFamily: "var(--font-heading)" }}
              >
                Built for how clinicians actually work
              </h2>
              <p className="mt-4 text-gray-400 max-w-xl mx-auto">
                A glimpse into the committee dashboard — where competencies are
                managed, reviewed, and governed.
              </p>
            </div>
          </FadeIn>
          <FadeIn delay={150}>
            <div className="relative mx-auto max-w-5xl">
              {/* Browser chrome */}
              <div className="rounded-2xl overflow-hidden shadow-[0_40px_100px_rgba(0,0,0,0.15)] border border-gray-200">
                {/* Browser top bar */}
                <div className="bg-gray-100 border-b border-gray-200 px-4 py-3 flex items-center gap-3">
                  <div className="flex gap-1.5">
                    <div className="w-3 h-3 rounded-full bg-red-400" />
                    <div className="w-3 h-3 rounded-full bg-yellow-400" />
                    <div className="w-3 h-3 rounded-full bg-green-400" />
                  </div>
                  <div className="flex-1 bg-white rounded-md px-3 py-1 text-xs text-gray-400 border border-gray-200">
                    truecompetency.com/committee/competencies
                  </div>
                </div>
                {/* Screenshot */}
                <Image
                  src="/dashboard_screen.png"
                  alt="True Competency committee dashboard"
                  width={1280}
                  height={900}
                  className="w-full h-auto"
                />
              </div>
              {/* Gradient fade at bottom */}
              <div
                className="absolute bottom-0 left-0 right-0 h-32 rounded-b-2xl"
                style={{
                  background: "linear-gradient(to top, white, transparent)",
                }}
              />
            </div>
          </FadeIn>
        </div>
      </section>

      {/* ── TEAM ── */}
      <section id="team" className="py-24 bg-white">
        <div className="mx-auto max-w-6xl px-6">
          <FadeIn>
            <div className="text-center mb-16">
              <p className="text-xs font-semibold uppercase tracking-widest text-[#5170ff] mb-3">
                The Team
              </p>
              <h2
                className="text-4xl font-bold text-gray-900"
                style={{ fontFamily: "var(--font-heading)" }}
              >
                Built by clinicians, for clinicians
              </h2>
              <p className="mt-4 text-gray-500 max-w-xl mx-auto">
                Hover over each member to learn more about the team behind True
                Competency.
              </p>
            </div>
          </FadeIn>
          <div className="grid md:grid-cols-3 gap-8 max-w-3xl mx-auto items-end">
            <FadeIn delay={0}>
              <div className="md:mb-10">
                <FounderCard
                  name="Marc James de Man"
                  role="CEO & Co-Founder"
                  bio="Medical student at McGill University with experience in early-stage ventures, focused on building reliable infrastructure for medical training governance."
                  src="/founders/CEO_02.jpg"
                  featured={false}
                />
              </div>
            </FadeIn>
            <FadeIn delay={100}>
              <FounderCard
                name="Dr. Kwan Lee"
                role="CMO & Co-Founder"
                bio="Interventional cardiologist and Associate Professor at Mayo Clinic Arizona, bringing clinical leadership and accreditation expertise to the platform."
                src="/founders/CEO_01.jpg"
                imageAlt="Dr. Kwan Lee portrait"
                featured={true}
              />
            </FadeIn>
            <FadeIn delay={200}>
              <div className="md:mb-10">
                <FounderCard
                  name="Murad Novruzov"
                  role="Chief Technical Officer"
                  bio="Full-stack developer from McGill University who is bridging the gap between technology and medical education."
                  src="/founders/CTO.jpg"
                  featured={false}
                />
              </div>
            </FadeIn>
          </div>
        </div>
      </section>

      <div className="section-divider mx-auto max-w-4xl" />

      {/* ── PARTNERS ── */}
      <section id="partners" className="py-24 bg-gray-50/50">
        <div className="mx-auto max-w-6xl px-6">
          <FadeIn>
            <div className="text-center mb-16">
              <p className="text-xs font-semibold uppercase tracking-widest text-[#5170ff] mb-3">
                Partners & Sponsors
              </p>
              <h2
                className="text-4xl font-bold text-gray-900"
                style={{ fontFamily: "var(--font-heading)" }}
              >
                Backed by leading institutions
              </h2>
            </div>
          </FadeIn>
          <div className="grid grid-cols-1 gap-10 md:grid-cols-3 md:gap-8">
            <FadeIn>
              <div className="flex h-24 items-center justify-center">
                <Image
                  src="/sponsors/APSC_Logo.png"
                  alt="APSC"
                  width={280}
                  height={120}
                  className="h-16 w-auto object-contain grayscale opacity-70 md:h-20"
                />
              </div>
            </FadeIn>
            <FadeIn delay={100}>
              <div className="flex h-24 items-center justify-center">
                <Image
                  src="/sponsors/mcgill_dobson_centre.png"
                  alt="McGill Dobson Centre for Entrepreneurship"
                  width={280}
                  height={120}
                  className="h-16 w-auto object-contain grayscale opacity-70 md:h-20"
                />
              </div>
            </FadeIn>
            <FadeIn delay={200}>
              <div className="flex h-24 items-center justify-center">
                <Image
                  src="/sponsors/mcgill_ventures.png"
                  alt="McGill Ventures"
                  width={280}
                  height={120}
                  className="h-16 w-auto object-contain grayscale opacity-70 md:h-20"
                />
              </div>
            </FadeIn>
          </div>
          <FadeIn delay={200}>
            <p className="text-center text-sm text-gray-400 mt-10">
              Interested in partnering with True Competency?{" "}
              <a
                href={CONTACT_HREF}
                className="text-[#5170ff] font-medium hover:underline"
              >
                Get in touch →
              </a>
            </p>
          </FadeIn>
        </div>
      </section>

      <div className="section-divider mx-auto max-w-4xl" />

      {/* ── CONTACT ── */}
      <section id="contact" className="py-24 bg-white">
        <div className="mx-auto max-w-2xl px-6 text-center">
          <FadeIn>
            <p className="text-xs font-semibold uppercase tracking-widest text-[#5170ff] mb-4">
              Contact
            </p>
            <h2
              className="text-4xl font-bold text-gray-900"
              style={{ fontFamily: "var(--font-heading)" }}
            >
              Let&apos;s build the future of training together
            </h2>
            <p className="mt-5 text-gray-500 text-lg leading-relaxed">
              Whether you&apos;re a training program looking to onboard, an
              institution interested in partnership, or a clinician with
              questions — we&apos;d love to hear from you.
            </p>
            <div className="mt-10 flex flex-col sm:flex-row gap-4 justify-center">
              <a
                href={CONTACT_HREF}
                className="inline-flex items-center justify-center gap-2 rounded-full px-8 py-4 text-base font-semibold text-white transition-all hover:opacity-90 hover:shadow-xl"
                style={{
                  background:
                    "linear-gradient(135deg, #5170ff 0%, #7b8fff 100%)",
                  boxShadow: "0 20px 60px rgba(81,112,255,0.3)",
                }}
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
                  <path
                    d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"
                    stroke="white"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
                Contact us
              </a>
            </div>
          </FadeIn>
        </div>
      </section>

      {/* ── FOOTER ── */}
      <footer className="border-t border-gray-100 py-10 bg-white">
        <div className="mx-auto max-w-6xl px-6 flex flex-col md:flex-row items-center justify-between gap-6">
          <div className="flex items-center gap-2.5">
            <Image
              src="/TC_Logo.png"
              alt="True Competency"
              width={28}
              height={28}
              className="object-contain"
            />
            <span
              className="font-semibold text-gray-800 text-sm"
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
              className="text-xs text-gray-400 hover:text-gray-700 transition-colors"
            >
              Privacy
            </Link>
            <Link
              href="/terms"
              className="text-xs text-gray-400 hover:text-gray-700 transition-colors"
            >
              Terms
            </Link>
            <a
              href={CONTACT_HREF}
              className="text-xs text-gray-400 hover:text-gray-700 transition-colors"
            >
              Contact
            </a>
          </div>
        </div>
      </footer>
    </div>
  );
}
