// src/app/trainee/page.tsx
"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";
import ReactCountryFlag from "react-country-flag";
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  BarChart,
  Bar,
  Cell,
} from "recharts";
import {
  BookOpen,
  CheckCircle2,
  Clock,
  TrendingUp,
  Target,
  Trophy,
} from "lucide-react";

// ── Types ──────────────────────────────────────────────────────────────────────

type Profile = {
  id: string;
  role: string;
  first_name: string | null;
  last_name: string | null;
  full_name: string | null;
  email: string | null;
};

type ProgressRow = {
  competency_id: string;
  pct: number;
};

type AssignmentRow = {
  competency_id: string;
};

type CompetencyRow = {
  id: string;
  difficulty: string | null;
  tags: string[] | null; // UUID[] from DB
};

type TagRow = {
  id: string;
  name: string;
};

type AnswerRow = {
  is_correct: boolean;
  answered_at: string;
};

type RankRow = {
  student_id: string;
  pct: number;
};

type LeaderboardProgressRow = {
  student_id: string | null;
  competency_id: string | null;
  pct: number;
  profiles: {
    full_name: string | null;
    first_name: string | null;
    last_name: string | null;
    country_name: string | null;
    country_code: string | null;
    role: string | null;
  } | null;
};

type CountryLeaderboardEntry = {
  country: string;
  code: string | null;
  completed: number;
};

type TraineeLeaderboardEntry = {
  id: string;
  name: string;
  country: string | null;
  code: string | null;
  completed: number;
};

// Recharts data shapes
type ActivityPoint = { date: string; answers: number };
type TagBar = { tag: string; count: number };

// ── Difficulty bucket helper ───────────────────────────────────────────────────

type DiffBucket = "beginner" | "intermediate" | "expert";

function toBucket(raw: string | null): DiffBucket | null {
  const k = (raw ?? "").toLowerCase();
  if (k === "beginner" || k === "intermediate" || k === "expert") return k;
  return null;
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function TraineeDashboard() {
  const router = useRouter();

  // Auth + profile
  const [me, setMe] = useState<Profile | null>(null);

  // Core data
  const [assignments, setAssignments] = useState<Set<string>>(new Set());
  const [progressMap, setProgressMap] = useState<Map<string, number>>(
    new Map(),
  );
  const [competencies, setCompetencies] = useState<CompetencyRow[]>([]);

  // New stats data
  const [answers, setAnswers] = useState<AnswerRow[]>([]);
  const [myRank, setMyRank] = useState<number | null>(null);
  const [totalTrainees, setTotalTrainees] = useState<number>(0);
  const [tagNames, setTagNames] = useState<Map<string, string>>(new Map()); // uuid -> name

  // Leaderboards
  const [countryLeaderboard, setCountryLeaderboard] = useState<
    CountryLeaderboardEntry[]
  >([]);
  const [traineeLeaderboard, setTraineeLeaderboard] = useState<
    TraineeLeaderboardEntry[]
  >([]);

  // UI
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  // ── Single parallel fetch — everything in one round trip ────────────────────

  useEffect(() => {
    let cancelled = false;

    (async () => {
      setLoading(true);
      setErr(null);

      try {
        // Verify session
        const { data: userRes, error: getUserErr } =
          await supabase.auth.getUser();
        if (getUserErr) throw getUserErr;
        const uid = userRes.user?.id ?? null;
        if (!uid) {
          router.replace("/signin?redirect=/trainee");
          return;
        }

        // Profile first (need uid to scope all subsequent queries)
        const { data: prof, error: profErr } = await supabase
          .from("profiles")
          .select("id, role, first_name, last_name, full_name, email")
          .eq("id", uid)
          .single<Profile>();
        if (profErr) throw profErr;
        if (cancelled) return;
        setMe(prof);

        // All 7 queries fire in parallel — no sequential waterfalls
        const [
          { data: assigns, error: aErr },
          { data: progress, error: pErr },
          { data: comps, error: cErr },
          { data: tagsData, error: tErr },
          { data: myAnswers, error: ansErr },
          { data: leaderboardRows, error: lErr },
          { data: allProgress, error: apErr },
        ] = await Promise.all([
          // My enrolled competency IDs
          supabase
            .from("competency_assignments")
            .select("competency_id")
            .eq("student_id", uid)
            .returns<AssignmentRow[]>(),

          // My progress per competency
          supabase
            .from("student_competency_progress")
            .select("competency_id, pct")
            .eq("student_id", uid)
            .returns<ProgressRow[]>(),

          // All competencies — id, difficulty, tags UUID[]
          supabase
            .from("competencies")
            .select("id, difficulty, tags")
            .returns<CompetencyRow[]>(),

          // Tag uuid -> name lookup table
          supabase
            .from("tags")
            .select("id, name")
            .order("name", { ascending: true })
            .returns<TagRow[]>(),

          // My answers — last 30 days only to keep payload small
          supabase
            .from("student_answers")
            .select("is_correct, answered_at")
            .eq("student_id", uid)
            .gte(
              "answered_at",
              new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString(),
            )
            .returns<AnswerRow[]>(),

          // Global leaderboard — trainees with any 100% competency
          supabase
            .from("student_competency_progress")
            .select(
              "student_id, competency_id, pct, profiles!inner(full_name, first_name, last_name, country_name, country_code, role)",
            )
            .gte("pct", 100)
            .eq("profiles.role", "trainee")
            .returns<LeaderboardProgressRow[]>(),

          // All completed rows across all trainees — for rank calculation
          supabase
            .from("student_competency_progress")
            .select("student_id, pct")
            .gte("pct", 100)
            .returns<RankRow[]>(),
        ]);

        if (aErr) throw aErr;
        if (pErr) throw pErr;
        if (cErr) throw cErr;
        if (tErr) throw tErr;
        if (ansErr) throw ansErr;
        if (lErr) throw lErr;
        if (apErr) throw apErr;
        if (cancelled) return;

        // ── Process core data ───────────────────────────────────────────────────

        const enrolled = new Set<string>(
          (assigns ?? []).map((r) => r.competency_id),
        );
        setAssignments(enrolled);

        const pMap = new Map<string, number>();
        (progress ?? []).forEach((r) => pMap.set(r.competency_id, r.pct));
        setProgressMap(pMap);

        setCompetencies(comps ?? []);

        // Build tag uuid -> name map
        const tagMap = new Map<string, string>(
          ((tagsData ?? []) as TagRow[]).map((t) => [t.id, t.name]),
        );
        setTagNames(tagMap);

        setAnswers(myAnswers ?? []);

        // ── Compute rank ────────────────────────────────────────────────────────
        // Count completed competencies per trainee, rank current user
        const completedPerTrainee = new Map<string, number>();
        (allProgress ?? []).forEach((r: RankRow) => {
          if (!r.student_id) return;
          completedPerTrainee.set(
            r.student_id,
            (completedPerTrainee.get(r.student_id) ?? 0) + 1,
          );
        });

        const myCompleted = completedPerTrainee.get(uid) ?? 0;
        const total = completedPerTrainee.size;
        setTotalTrainees(total);

        // Rank = trainees with MORE completions + 1
        const rank =
          Array.from(completedPerTrainee.values()).filter(
            (v) => v > myCompleted,
          ).length + 1;
        setMyRank(total > 0 ? rank : null);

        // ── Build leaderboards ──────────────────────────────────────────────────

        const NOT_SPECIFIED = "Not specified";
        const countryMap = new Map<
          string,
          { name: string; code: string | null; count: number }
        >();
        const traineeMap = new Map<
          string,
          {
            id: string;
            name: string;
            country: string | null;
            code: string | null;
            count: number;
          }
        >();

        (leaderboardRows ?? []).forEach((row) => {
          const p = row.profiles;
          if (!p) return;

          const rawCountry = (p.country_name ?? "").trim();
          const hasCountry = rawCountry.length > 0;
          const countryName = hasCountry ? rawCountry : NOT_SPECIFIED;
          const countryKey = countryName.toLowerCase();
          const code =
            hasCountry && p.country_code
              ? p.country_code.slice(0, 2).toUpperCase()
              : null;

          const cEntry = countryMap.get(countryKey);
          if (cEntry) cEntry.count += 1;
          else
            countryMap.set(countryKey, { name: countryName, code, count: 1 });

          const studentId = row.student_id;
          if (studentId) {
            const name =
              p.full_name ||
              `${p.first_name ?? ""} ${p.last_name ?? ""}`.trim() ||
              "Trainee";
            const tEntry = traineeMap.get(studentId);
            if (tEntry) tEntry.count += 1;
            else
              traineeMap.set(studentId, {
                id: studentId,
                name,
                country: hasCountry ? rawCountry : null,
                code,
                count: 1,
              });
          }
        });

        setCountryLeaderboard(
          Array.from(countryMap.values())
            .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name))
            .slice(0, 5)
            .map((e) => ({
              country: e.name,
              code: e.code,
              completed: e.count,
            })),
        );

        setTraineeLeaderboard(
          Array.from(traineeMap.values())
            .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name))
            .slice(0, 5)
            .map((e) => ({
              id: e.id,
              name: e.name,
              country: e.country,
              code: e.code,
              completed: e.count,
            })),
        );
      } catch (e) {
        setErr(e instanceof Error ? e.message : String(e));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [router]);

  // ── Derived stats (computed client-side, no extra queries) ────────────────────

  // Only enrolled competencies contribute to stats
  const enrolledComps = useMemo(
    () => competencies.filter((c) => assignments.has(c.id)),
    [competencies, assignments],
  );

  const enrolledTotal = enrolledComps.length;

  const completedTotal = useMemo(
    () =>
      enrolledComps.filter((c) => (progressMap.get(c.id) ?? 0) >= 100).length,
    [enrolledComps, progressMap],
  );

  const inProgressTotal = useMemo(
    () =>
      enrolledComps.filter((c) => {
        const pct = progressMap.get(c.id) ?? 0;
        return pct > 0 && pct < 100;
      }).length,
    [enrolledComps, progressMap],
  );

  const overallPct =
    enrolledTotal > 0 ? Math.round((completedTotal / enrolledTotal) * 100) : 0;

  // Accuracy: correct / total answers in last 30 days
  const accuracyPct = useMemo(() => {
    if (answers.length === 0) return null;
    const correct = answers.filter((a) => a.is_correct).length;
    return Math.round((correct / answers.length) * 100);
  }, [answers]);

  // Per-difficulty stats
  const diffStats = useMemo(() => {
    function calc(bucket: DiffBucket) {
      const subset = enrolledComps.filter(
        (c) => toBucket(c.difficulty) === bucket,
      );
      const completed = subset.filter(
        (c) => (progressMap.get(c.id) ?? 0) >= 100,
      ).length;
      const pct =
        subset.length > 0 ? Math.round((completed / subset.length) * 100) : 0;
      return { enrolled: subset.length, completed, pct };
    }
    return {
      beginner: calc("beginner"),
      intermediate: calc("intermediate"),
      expert: calc("expert"),
    };
  }, [enrolledComps, progressMap]);

  // Activity chart: answers per calendar day over last 30 days
  const activityData = useMemo((): ActivityPoint[] => {
    // Pre-fill all 30 days with 0 so days with no activity still render
    const buckets = new Map<string, number>();
    for (let i = 29; i >= 0; i--) {
      const d = new Date(Date.now() - i * 24 * 60 * 60 * 1000);
      buckets.set(d.toISOString().slice(0, 10), 0);
    }
    answers.forEach((a) => {
      const key = a.answered_at.slice(0, 10);
      if (buckets.has(key)) buckets.set(key, (buckets.get(key) ?? 0) + 1);
    });
    return Array.from(buckets.entries()).map(([isoDate, count]) => ({
      date: new Date(isoDate + "T12:00:00").toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
      }),
      answers: count,
    }));
  }, [answers]);

  // Tag breakdown: enrolled competency count per tag name
  const tagBreakdown = useMemo((): TagBar[] => {
    const countMap = new Map<string, number>();
    enrolledComps.forEach((c) => {
      (c.tags ?? []).forEach((tagId) => {
        const name = tagNames.get(tagId);
        if (!name) return;
        countMap.set(name, (countMap.get(name) ?? 0) + 1);
      });
    });
    return Array.from(countMap.entries())
      .map(([tag, count]) => ({ tag: `#${tag}`, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 8); // top 8 tags
  }, [enrolledComps, tagNames]);

  // ── Display helpers ───────────────────────────────────────────────────────────

  function getDisplayName(p: Profile | null) {
    if (!p) return "";
    return (
      p.full_name ||
      [p.first_name, p.last_name].filter(Boolean).join(" ") ||
      p.email ||
      "there"
    );
  }

  const displayName = getDisplayName(me);

  // ── Render ────────────────────────────────────────────────────────────────────

  return (
    <main className="bg-[var(--background)] text-[var(--foreground)] min-h-screen">
      <div className="mx-auto max-w-6xl px-6 py-8 space-y-6">
        {/* ── Error banner ── */}
        {err && (
          <div className="mb-6 rounded-2xl border border-[color:var(--err)]/30 bg-[color:var(--err)]/10 px-4 py-3 text-sm text-[color:var(--err)]">
            {err}
          </div>
        )}

        {/* ── Page header ── */}
        <div className="mb-8">
          <h1
            className="text-3xl font-bold tracking-tight text-[var(--foreground)]"
            style={{ fontFamily: "var(--font-heading, sans-serif)" }}
          >
            {loading
              ? "Welcome back"
              : displayName
                ? `Welcome back, ${displayName.split(" ")[0]}`
                : "Welcome back"}
          </h1>
          <div className="accent-underline mt-3" />
          <p className="mt-3 text-sm text-[var(--muted)]">
            Here is your training overview: track your progress, see where you
            stand, and keep pushing forward.
          </p>
        </div>

        {/* ── 6 KPI stat cards ── */}
        <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-3">
          <StatCard
            icon={<BookOpen size={18} />}
            label="Enrolled"
            value={loading ? "—" : String(enrolledTotal)}
            color="var(--accent)"
            loading={loading}
          />
          <StatCard
            icon={<Clock size={18} />}
            label="In Progress"
            value={loading ? "—" : String(inProgressTotal)}
            color="var(--warn)"
            loading={loading}
          />
          <StatCard
            icon={<CheckCircle2 size={18} />}
            label="Completed"
            value={loading ? "—" : String(completedTotal)}
            color="var(--ok)"
            loading={loading}
          />
          <StatCard
            icon={<TrendingUp size={18} />}
            label="Overall"
            value={loading ? "—" : `${overallPct}%`}
            color="var(--accent)"
            loading={loading}
          />
          {/* Accuracy: null means no answers yet — show dash */}
          <StatCard
            icon={<Target size={18} />}
            label="Accuracy"
            value={
              loading ? "—" : accuracyPct !== null ? `${accuracyPct}%` : "—"
            }
            color="var(--ok)"
            loading={loading}
            subtitle="last 30 days"
          />
          {/* Rank: null means no completions on platform yet */}
          <StatCard
            icon={<Trophy size={18} />}
            label="Your Rank"
            value={loading ? "—" : myRank !== null ? `#${myRank}` : "—"}
            color="var(--warn)"
            loading={loading}
            subtitle={totalTrainees > 0 ? `of ${totalTrainees}` : undefined}
          />
        </div>

        {/* ── Activity chart (3/5) + Difficulty progress (2/5) ── */}
        <div className="grid grid-cols-1 lg:grid-cols-5 gap-4">
          {/* Activity area chart */}
          <div className="lg:col-span-3 rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-5">
            <div className="text-[10px] uppercase tracking-wide text-[var(--muted)]">
              Activity
            </div>
            <div className="text-base font-semibold mb-1">
              Answers submitted
            </div>
            <div className="text-xs text-[var(--muted)] mb-4">Last 30 days</div>

            {loading ? (
              <div className="h-40 rounded-xl bg-[var(--field)] animate-pulse" />
            ) : answers.length === 0 ? (
              <div className="h-40 flex items-center justify-center">
                <p className="text-xs text-[var(--muted)]">
                  No activity in the last 30 days.
                </p>
              </div>
            ) : (
              <ResponsiveContainer width="100%" height={160}>
                <AreaChart
                  data={activityData}
                  margin={{ top: 4, right: 4, bottom: 0, left: -20 }}
                >
                  <defs>
                    {/* Gradient fill beneath the curve */}
                    <linearGradient
                      id="activityGrad"
                      x1="0"
                      y1="0"
                      x2="0"
                      y2="1"
                    >
                      <stop
                        offset="5%"
                        stopColor="var(--accent)"
                        stopOpacity={0.3}
                      />
                      <stop
                        offset="95%"
                        stopColor="var(--accent)"
                        stopOpacity={0}
                      />
                    </linearGradient>
                  </defs>
                  <XAxis
                    dataKey="date"
                    tick={{ fontSize: 10, fill: "var(--muted)" }}
                    tickLine={false}
                    axisLine={false}
                    interval={5} // show every 6th label to avoid crowding
                  />
                  <YAxis
                    tick={{ fontSize: 10, fill: "var(--muted)" }}
                    tickLine={false}
                    axisLine={false}
                    allowDecimals={false}
                  />
                  <Tooltip
                    contentStyle={{
                      background: "var(--surface)",
                      border: "1px solid var(--border)",
                      borderRadius: "12px",
                      fontSize: "12px",
                      color: "var(--foreground)",
                    }}
                    itemStyle={{ color: "var(--accent)" }}
                    cursor={{ stroke: "var(--border)", strokeWidth: 1 }}
                  />
                  <Area
                    type="monotone"
                    dataKey="answers"
                    stroke="var(--accent)"
                    strokeWidth={2}
                    fill="url(#activityGrad)"
                    dot={false}
                    activeDot={{ r: 4, fill: "var(--accent)" }}
                  />
                </AreaChart>
              </ResponsiveContainer>
            )}
          </div>

          {/* Difficulty progress bars */}
          <div className="lg:col-span-2 rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-5">
            <div className="text-[10px] uppercase tracking-wide text-[var(--muted)]">
              Breakdown
            </div>
            <div className="text-base font-semibold mb-4">
              Progress by difficulty
            </div>
            <div className="flex flex-col gap-5">
              <DifficultyProgressCard
                label="Beginner"
                color="var(--ok)"
                {...diffStats.beginner}
                loading={loading}
              />
              <DifficultyProgressCard
                label="Intermediate"
                color="var(--warn)"
                {...diffStats.intermediate}
                loading={loading}
              />
              <DifficultyProgressCard
                label="Expert"
                color="var(--err)"
                {...diffStats.expert}
                loading={loading}
              />
            </div>
          </div>
        </div>

        {/* ── Tag breakdown horizontal bar chart — only renders if trainee has enrolled comps with tags ── */}
        {(loading || tagBreakdown.length > 0) && (
          <div className="card p-5">
            <div className="text-[10px] uppercase tracking-wide text-[var(--muted)]">
              Topics
            </div>
            <div className="text-base font-semibold mb-1">Enrolled by tag</div>
            <div className="text-xs text-[var(--muted)] mb-4">
              How many of your enrolled competencies belong to each tag
            </div>

            {loading ? (
              <div className="h-48 rounded-xl bg-[var(--field)] animate-pulse" />
            ) : (
              <ResponsiveContainer
                width="100%"
                height={Math.max(160, tagBreakdown.length * 36)}
              >
                <BarChart
                  data={tagBreakdown}
                  layout="vertical"
                  margin={{ top: 0, right: 16, bottom: 0, left: 8 }}
                >
                  <XAxis
                    type="number"
                    tick={{ fontSize: 10, fill: "var(--muted)" }}
                    tickLine={false}
                    axisLine={false}
                    allowDecimals={false}
                  />
                  <YAxis
                    type="category"
                    dataKey="tag"
                    tick={{ fontSize: 11, fill: "var(--foreground)" }}
                    tickLine={false}
                    axisLine={false}
                    width={96}
                  />
                  <Tooltip
                    contentStyle={{
                      background: "var(--surface)",
                      border: "1px solid var(--border)",
                      borderRadius: "12px",
                      fontSize: "12px",
                      color: "var(--foreground)",
                    }}
                    cursor={{
                      fill: "color-mix(in oklab, var(--accent) 8%, transparent)",
                    }}
                    formatter={(value) => [value ?? 0, "competencies"]}
                  />
                  <Bar dataKey="count" radius={[0, 6, 6, 0]} maxBarSize={20}>
                    {/* Subtle opacity gradient — most frequent tag is full opacity */}
                    {tagBreakdown.map((_, i) => (
                      <Cell
                        key={i}
                        fill="var(--accent)"
                        fillOpacity={1 - i * 0.07}
                      />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>
        )}

        {/* ── Leaderboards ── */}
        <div className="grid gap-4 md:grid-cols-2">
          <CountryLeaderboardCard
            entries={countryLeaderboard}
            loading={loading}
          />
          <TraineeLeaderboardCard
            entries={traineeLeaderboard}
            loading={loading}
          />
        </div>
      </div>
    </main>
  );
}

// ── Sub-components ─────────────────────────────────────────────────────────────

/** Single KPI stat card with optional subtitle below value */
function StatCard({
  icon,
  label,
  value,
  color,
  loading,
  subtitle,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  color: string;
  loading: boolean;
  subtitle?: string;
}) {
  return (
    <div className="card p-4 flex flex-col gap-3">
      {/* Tinted icon chip */}
      <div
        className="w-10 h-10 rounded-full grid place-items-center flex-shrink-0"
        style={{
          background: `color-mix(in oklab, ${color} 18%, transparent)`,
          color,
        }}
      >
        {icon}
      </div>

      {/* Value + optional subtitle */}
      {loading ? (
        <div className="h-8 w-16 rounded-lg bg-[var(--field)] animate-pulse" />
      ) : (
        <div className="flex items-baseline gap-1.5">
          <span className="text-3xl font-bold tracking-tight" style={{ color }}>
            {value}
          </span>
          {subtitle && (
            <span className="text-xs text-[var(--muted)]">{subtitle}</span>
          )}
        </div>
      )}

      {/* Label */}
      <span className="text-xs text-[var(--muted)] font-medium">{label}</span>
    </div>
  );
}

/** Single difficulty row: label + glow bar + count */
function DifficultyProgressCard({
  label,
  color,
  enrolled,
  completed,
  pct,
  loading,
}: {
  label: string;
  color: string;
  enrolled: number;
  completed: number;
  pct: number;
  loading: boolean;
}) {
  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span
            className="h-2.5 w-2.5 rounded-full flex-shrink-0"
            style={{ background: color }}
          />
          <span className="text-sm font-medium">{label}</span>
        </div>
        {loading ? (
          <div className="h-4 w-12 rounded bg-[var(--field)] animate-pulse" />
        ) : (
          <span className="text-sm font-semibold" style={{ color }}>
            {pct}%
          </span>
        )}
      </div>

      {loading ? (
        <div className="h-2.5 w-full rounded-full bg-[var(--field)] animate-pulse" />
      ) : (
        <div className="h-2.5 w-full overflow-hidden rounded-full bg-[var(--field)] border border-[var(--border)]">
          <div
            className="h-full rounded-full transition-all duration-700 ease-out"
            style={{
              width: `${pct}%`,
              background: color,
              boxShadow: `0 0 8px color-mix(in oklab, ${color} 50%, transparent)`,
            }}
          />
        </div>
      )}

      {loading ? (
        <div className="h-3 w-20 rounded bg-[var(--field)] animate-pulse" />
      ) : (
        <span className="text-xs text-[var(--muted)]">
          {completed} / {enrolled} completed
        </span>
      )}
    </div>
  );
}

/** Country leaderboard card */
function CountryLeaderboardCard({
  entries,
  loading,
}: {
  entries: CountryLeaderboardEntry[];
  loading: boolean;
}) {
  return (
    <div className="card p-4">
      <div className="text-[10px] uppercase tracking-wide text-[var(--muted)]">
        Country Leaderboard
      </div>
      <div className="text-base font-semibold mb-4">
        Most completed competencies
      </div>
      {loading ? (
        <LoadingSkeleton rows={3} />
      ) : entries.length === 0 ? (
        <EmptyState text="No completed competencies recorded yet." />
      ) : (
        <ul className="space-y-3">
          {entries.map((entry, idx) => (
            <li
              key={`${entry.country}-${idx}`}
              className="flex items-center justify-between gap-3"
            >
              <div className="flex items-center gap-3 min-w-0">
                <RankBadge rank={idx + 1} />
                <CountryFlag code={entry.code} label={entry.country} />
                <span className="text-sm font-medium truncate">
                  {entry.country}
                </span>
              </div>
              <span className="text-sm font-semibold flex-shrink-0">
                {entry.completed}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/** Trainee leaderboard card */
function TraineeLeaderboardCard({
  entries,
  loading,
}: {
  entries: TraineeLeaderboardEntry[];
  loading: boolean;
}) {
  return (
    <div className="card p-4">
      <div className="text-[10px] uppercase tracking-wide text-[var(--muted)]">
        Top Trainees
      </div>
      <div className="text-base font-semibold mb-4">
        Most completed competencies
      </div>
      {loading ? (
        <LoadingSkeleton rows={3} />
      ) : entries.length === 0 ? (
        <EmptyState text="No trainee completions recorded yet." />
      ) : (
        <ul className="space-y-3">
          {entries.map((entry, idx) => (
            <li
              key={entry.id}
              className="flex items-center justify-between gap-3"
            >
              <div className="flex items-center gap-3 min-w-0">
                <RankBadge rank={idx + 1} />
                <div className="min-w-0">
                  <div className="text-sm font-medium truncate">
                    {entry.name}
                  </div>
                  {entry.country && (
                    <div className="flex items-center gap-1 mt-0.5">
                      {entry.code && (
                        <ReactCountryFlag
                          countryCode={entry.code}
                          svg
                          style={{
                            width: "0.9em",
                            height: "0.9em",
                            borderRadius: 2,
                          }}
                          aria-label={entry.country}
                        />
                      )}
                      <span className="text-xs text-[var(--muted)] truncate">
                        {entry.country}
                      </span>
                    </div>
                  )}
                </div>
              </div>
              <span className="text-sm font-semibold flex-shrink-0">
                {entry.completed}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

// ── Tiny shared helpers ────────────────────────────────────────────────────────

/** Gold for rank 1, muted otherwise */
function RankBadge({ rank }: { rank: number }) {
  return (
    <span
      className="w-5 text-sm font-semibold flex-shrink-0 text-right"
      style={{ color: rank === 1 ? "var(--warn)" : "var(--muted)" }}
    >
      {rank}
    </span>
  );
}

/** Country flag SVG with plain text fallback */
function CountryFlag({ code, label }: { code: string | null; label: string }) {
  if (code && code.length === 2) {
    return (
      <ReactCountryFlag
        svg
        countryCode={code}
        style={{
          width: "1.75rem",
          height: "1.25rem",
          borderRadius: "6px",
          border: "1px solid var(--border)",
          boxShadow: "0 1px 2px rgba(0,0,0,0.15)",
        }}
        aria-label={label}
        title={label}
      />
    );
  }
  return (
    <span
      className="flex h-5 w-7 items-center justify-center rounded border border-[var(--border)] text-[10px] text-[var(--muted)]"
      aria-label={label}
    >
      ??
    </span>
  );
}

/** Animated placeholder skeleton rows */
function LoadingSkeleton({ rows }: { rows: number }) {
  return (
    <div className="space-y-3">
      {Array.from({ length: rows }).map((_, i) => (
        <div
          key={i}
          className="h-10 rounded-xl bg-[var(--field)] border border-[var(--border)] animate-pulse"
        />
      ))}
    </div>
  );
}

/** Inline empty state message */
function EmptyState({ text }: { text: string }) {
  return <p className="text-xs text-[var(--muted)]">{text}</p>;
}
