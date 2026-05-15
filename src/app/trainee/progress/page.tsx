// src/app/trainee/progress/page.tsx
"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";
import type {
  CompetencyRow,
  TagRow,
  ProgressRow,
  DiffFilter,
} from "@/lib/types";
import Link from "next/link";
import {
  Search,
  X,
  CheckCircle2,
  Clock,
  BookOpen,
  MinusCircle,
  Target,
} from "lucide-react";

// ── Types ──────────────────────────────────────────────────────────────────────

type StatusFilter = "all" | "in_progress" | "completed";

// Resolved competency with progress attached
type EnrolledCompetency = CompetencyRow & {
  tagNames: string[];
  pct: number;
  total_questions: number;
  answered_questions: number;
};

// ── Helpers ───────────────────────────────────────────────────────────────────

function diffColor(d: string | null): string {
  switch ((d ?? "").toLowerCase()) {
    case "beginner":
      return "var(--ok)";
    case "intermediate":
      return "var(--warn)";
    case "expert":
      return "var(--err)";
    case "advanced":
      return "var(--err)";
    default:
      return "var(--border)";
  }
}

function cls(...xs: Array<string | false | null | undefined>) {
  return xs.filter(Boolean).join(" ");
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function TraineeProgressPage() {
  const router = useRouter();

  // Data
  const [enrolled, setEnrolled] = useState<EnrolledCompetency[]>([]);
  const [tagOptions, setTagOptions] = useState<TagRow[]>([]);

  // Filters
  const [search, setSearch] = useState("");
  const [diffFilter, setDiffFilter] = useState<DiffFilter>("all");
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");

  // UI
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  // ── Fetch ────────────────────────────────────────────────────────────────────

  useEffect(() => {
    let cancelled = false;

    (async () => {
      setLoading(true);
      setErr(null);

      try {
        const { data: userRes, error: userErr } = await supabase.auth.getUser();
        if (userErr) throw userErr;
        const uid = userRes.user?.id ?? null;
        if (!uid) {
          router.replace("/signin?redirect=/trainee/progress");
          return;
        }

        // All queries in parallel
        const [
          { data: assigns, error: aErr },
          { data: progress, error: pErr },
          { data: tags, error: tErr },
        ] = await Promise.all([
          // My enrolled competency IDs
          supabase
            .from("competency_assignments")
            .select("competency_id")
            .eq("student_id", uid),

          // My progress — includes total_questions and answered_questions
          supabase
            .from("student_competency_progress")
            .select("competency_id, pct, total_questions, answered_questions")
            .eq("student_id", uid)
            .returns<ProgressRow[]>(),

          // All tags for filter chips + UUID resolution
          supabase
            .from("tags")
            .select("id, name")
            .order("name", { ascending: true })
            .returns<TagRow[]>(),
        ]);

        if (aErr) throw aErr;
        if (pErr) throw pErr;
        if (tErr) throw tErr;
        if (cancelled) return;

        setTagOptions(tags ?? []);

        // Build progress map
        const pMap = new Map<string, ProgressRow>();
        (progress ?? []).forEach((r) => pMap.set(r.competency_id, r));

        // Build tag uuid -> name map
        const tMap = new Map<string, string>(
          ((tags ?? []) as TagRow[]).map((t) => [t.id, t.name]),
        );

        // Get enrolled competency IDs
        const enrolledIds = (assigns ?? []).map(
          (r: { competency_id: string }) => r.competency_id,
        );

        if (enrolledIds.length === 0) {
          setEnrolled([]);
          setLoading(false);
          return;
        }

        // Fetch only enrolled competencies ordered by position
        const { data: comps, error: cErr } = await supabase
          .from("competencies")
          .select("id, name, difficulty, tags, position")
          .in("id", enrolledIds)
          .order("position", { ascending: true, nullsFirst: false })
          .returns<CompetencyRow[]>();

        if (cErr) throw cErr;
        if (cancelled) return;

        // Merge competency data with progress
        const merged: EnrolledCompetency[] = (comps ?? []).map((c) => {
          const p = pMap.get(c.id);
          return {
            ...c,
            tagNames: (c.tags ?? [])
              .map((id) => tMap.get(id))
              .filter((n): n is string => Boolean(n)),
            pct: Math.round(p?.pct ?? 0),
            total_questions: p?.total_questions ?? 0,
            answered_questions: p?.answered_questions ?? 0,
          };
        });

        setEnrolled(merged);
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

  // ── Derived summary stats ──────────────────────────────────────────────────

  const completedCount = useMemo(
    () => enrolled.filter((c) => c.pct >= 100).length,
    [enrolled],
  );

  const inProgressCount = useMemo(
    () => enrolled.filter((c) => c.pct > 0 && c.pct < 100).length,
    [enrolled],
  );

  const notStartedCount = useMemo(
    () => enrolled.filter((c) => c.pct === 0).length,
    [enrolled],
  );

  const totalQuestions = useMemo(
    () => enrolled.reduce((sum, c) => sum + c.total_questions, 0),
    [enrolled],
  );

  const totalAnswered = useMemo(
    () => enrolled.reduce((sum, c) => sum + c.answered_questions, 0),
    [enrolled],
  );

  // ── Filtering ─────────────────────────────────────────────────────────────────

  const filtered = useMemo(() => {
    let list = enrolled;

    if (statusFilter === "completed") {
      list = list.filter((c) => c.pct >= 100);
    } else if (statusFilter === "in_progress") {
      list = list.filter((c) => c.pct < 100);
    }

    if (diffFilter !== "all") {
      list = list.filter(
        (c) => (c.difficulty ?? "").toLowerCase() === diffFilter,
      );
    }

    if (selectedTags.length > 0) {
      list = list.filter((c) => {
        const cardTags = new Set(c.tagNames);
        return selectedTags.every((t) => cardTags.has(t));
      });
    }

    const q = search.trim().toLowerCase();
    if (q) {
      list = list.filter((c) =>
        [c.name, c.difficulty, ...c.tagNames]
          .join(" ")
          .toLowerCase()
          .includes(q),
      );
    }

    return list;
  }, [enrolled, statusFilter, diffFilter, selectedTags, search]);

  const hasActiveFilters =
    search.trim() !== "" ||
    diffFilter !== "all" ||
    selectedTags.length > 0 ||
    statusFilter !== "all";

  function toggleTag(name: string) {
    setSelectedTags((prev) =>
      prev.includes(name) ? prev.filter((t) => t !== name) : [...prev, name],
    );
  }

  function clearFilters() {
    setSearch("");
    setDiffFilter("all");
    setSelectedTags([]);
    setStatusFilter("all");
  }

  // ── Render ────────────────────────────────────────────────────────────────────

  return (
    <div className="h-screen overflow-hidden px-8 py-8 max-w-6xl mx-auto flex flex-col">
      {/* ── Header ── */}
      <div className="mb-6 flex-shrink-0">
        <h1
          className="text-3xl font-bold tracking-tight text-[var(--foreground)]"
          style={{ fontFamily: "var(--font-heading, sans-serif)" }}
        >
          My Progress
        </h1>
        <div className="accent-underline mt-3" />
        <p className="mt-3 text-sm text-[var(--muted)]">
          {loading
            ? "Loading…"
            : `${enrolled.length} enrolled competenc${enrolled.length === 1 ? "y" : "ies"}`}
        </p>
      </div>

      {/* ── Error banner ── */}
      {err && (
        <div className="mb-4 flex-shrink-0 rounded-2xl border border-[color:var(--err)]/30 bg-[color:var(--err)]/10 px-4 py-3 text-sm text-[var(--err)] flex items-center justify-between gap-3">
          <span>{err}</span>
          <button onClick={() => setErr(null)}>
            <X size={14} />
          </button>
        </div>
      )}

      {/* ── Summary stat row ── */}
      {!loading && enrolled.length > 0 && (
        <div className="mb-5 flex-shrink-0 grid grid-cols-2 sm:grid-cols-5 gap-3">
          <StatChip
            label="Enrolled"
            value={enrolled.length}
            color="var(--foreground)"
            icon={<BookOpen size={18} />}
          />
          <StatChip
            label="Completed"
            value={completedCount}
            color="var(--ok)"
            icon={<CheckCircle2 size={18} />}
          />
          <StatChip
            label="In Progress"
            value={inProgressCount}
            color="var(--accent)"
            icon={<Clock size={18} />}
          />
          <StatChip
            label="Not Started"
            value={notStartedCount}
            color="var(--muted)"
            icon={<MinusCircle size={18} />}
          />
          <StatChip
            label={`${totalAnswered} / ${totalQuestions} questions`}
            value={
              totalQuestions > 0
                ? `${Math.round((totalAnswered / totalQuestions) * 100)}%`
                : "0%"
            }
            color="var(--warn)"
            icon={<Target size={18} />}
          />
        </div>
      )}

      {/* ── Filters ── */}
      <div className="mb-4 flex-shrink-0 space-y-2">
        {/* Row 1: search + clear */}
        <div className="flex items-center gap-2">
          <div className="relative flex-1">
            <Search
              size={15}
              className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--muted)]"
            />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search name, difficulty, tag…"
              className="w-full pl-9 pr-3 py-2 rounded-full border border-[var(--border)] bg-[var(--field)] text-sm outline-none focus:border-[color:var(--accent)] focus:shadow-[0_0_0_3px_color-mix(in_oklab,var(--accent)_18%,transparent)] transition-all"
            />
          </div>
          {hasActiveFilters && (
            <button
              type="button"
              onClick={clearFilters}
              className="flex items-center gap-1.5 px-3 py-2 rounded-full border border-[var(--border)] bg-[var(--surface)] text-xs text-[var(--foreground)] hover:border-[color:var(--accent)] hover:text-[var(--accent)] transition-all"
            >
              <X size={12} />
              Clear
            </button>
          )}
        </div>

        {/* Row 2: Status + Difficulty inline with labels */}
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-xs text-[var(--muted)] flex-shrink-0">
            Status:
          </span>
          {(
            [
              { label: "All", value: "all" as StatusFilter },
              { label: "In Progress", value: "in_progress" as StatusFilter },
              { label: "Completed", value: "completed" as StatusFilter },
            ] as const
          ).map(({ label, value }) => (
            <button
              key={value}
              type="button"
              onClick={() => setStatusFilter(value)}
              className={cls(
                "rounded-full px-3 py-1.5 text-xs font-medium border transition-all",
                statusFilter === value
                  ? "border-[color:var(--accent)] bg-[color:var(--accent)]/15 text-[var(--accent)]"
                  : "border-[var(--border)] bg-[var(--field)] text-[var(--foreground)] hover:border-[color:var(--accent)] hover:text-[var(--accent)]",
              )}
            >
              {label}
            </button>
          ))}

          <span className="text-xs text-[var(--muted)] flex-shrink-0 ml-2">
            Difficulty:
          </span>
          {(
            [
              { label: "All", value: "all" as DiffFilter, color: null },
              {
                label: "Beginner",
                value: "beginner" as DiffFilter,
                color: "var(--ok)",
              },
              {
                label: "Intermediate",
                value: "intermediate" as DiffFilter,
                color: "var(--warn)",
              },
              {
                label: "Expert",
                value: "expert" as DiffFilter,
                color: "var(--err)",
              },
            ] as const
          ).map(({ label, value, color }) => {
            const isActive = diffFilter === value;
            return (
              <button
                key={value}
                type="button"
                onClick={() => setDiffFilter(value)}
                className="rounded-full px-3 py-1.5 text-xs font-medium border transition-all"
                style={
                  isActive
                    ? {
                        background: `color-mix(in oklab, ${color ?? "var(--accent)"} 15%, transparent)`,
                        borderColor: color ?? "var(--accent)",
                        color: color ?? "var(--accent)",
                      }
                    : {
                        background: "var(--field)",
                        borderColor: "var(--border)",
                        color: "var(--foreground)",
                      }
                }
              >
                {label}
              </button>
            );
          })}
        </div>

        {/* Row 3: Tags */}
        {tagOptions.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {tagOptions.map((t) => (
              <button
                key={t.id}
                type="button"
                onClick={() => toggleTag(t.name)}
                className={cls(
                  "rounded-full px-2.5 py-0.5 text-[11px] border transition-all",
                  selectedTags.includes(t.name)
                    ? "border-[color:var(--accent)] bg-[color:var(--accent)]/15 text-[var(--accent)]"
                    : "border-[var(--border)] bg-[var(--field)] text-[var(--foreground)] hover:border-[color:var(--accent)] hover:text-[var(--accent)]",
                )}
              >
                #{t.name}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* ── Table ── */}
      <div className="min-h-0 flex-1">
        {loading ? (
          <div className="text-sm text-[var(--muted)]">Loading…</div>
        ) : enrolled.length === 0 ? (
          // Empty state — not enrolled in anything yet
          <div className="h-full flex flex-col items-center justify-center gap-4 rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-12 text-center">
            <div
              className="h-14 w-14 rounded-2xl grid place-items-center"
              style={{
                background:
                  "color-mix(in oklab, var(--accent) 12%, transparent)",
              }}
            >
              <BookOpen size={24} style={{ color: "var(--accent)" }} />
            </div>
            <div>
              <p className="text-base font-semibold text-[var(--foreground)]">
                No enrolled competencies yet
              </p>
              <p className="mt-1 text-sm text-[var(--muted)]">
                Head to the Competencies page to enroll in topics you want to
                master.
              </p>
            </div>
            <Link
              href="/trainee/competencies"
              className="inline-flex items-center gap-2 rounded-xl border-2 px-4 py-2 text-sm font-semibold transition-all hover:opacity-90"
              style={{
                background: "var(--accent)",
                color: "#fff",
                borderColor: "var(--accent)",
              }}
            >
              Browse competencies
            </Link>
          </div>
        ) : (
          <div className="h-full overflow-auto rounded-2xl border border-[var(--border)] bg-[var(--surface)]">
            <table className="min-w-full text-sm">
              <thead>
                <tr className="border-b border-[var(--border)] bg-[var(--field)]/40">
                  <th className="px-4 py-3 text-left text-xs font-semibold text-[var(--muted)] w-10">
                    #
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-[var(--muted)]">
                    Name
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-[var(--muted)] w-36">
                    Difficulty
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-[var(--muted)]">
                    Tags
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-[var(--muted)] w-36">
                    Questions
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-[var(--muted)] w-44">
                    Progress
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-[var(--muted)] w-24">
                    Action
                  </th>
                </tr>
              </thead>
              <tbody>
                {filtered.length === 0 && (
                  <tr>
                    <td
                      colSpan={7}
                      className="px-4 py-10 text-center text-sm text-[var(--muted)]"
                    >
                      No competencies match your filters.
                      {hasActiveFilters && (
                        <button
                          onClick={clearFilters}
                          className="ml-2 text-[var(--accent)] hover:underline"
                        >
                          Clear filters
                        </button>
                      )}
                    </td>
                  </tr>
                )}
                {filtered.map((c, idx) => {
                  const isCompleted = c.pct >= 100;
                  const color = diffColor(c.difficulty);

                  return (
                    <tr
                      key={c.id}
                      className="border-t border-[var(--border)] hover:bg-[color:var(--accent)]/5 transition-colors"
                    >
                      {/* Position */}
                      <td className="px-4 py-3 align-middle text-xs text-[var(--muted)] tabular-nums">
                        {c.position ?? idx + 1}
                      </td>

                      {/* Name + status icon */}
                      <td className="px-4 py-3 align-middle">
                        <div className="flex items-center gap-2">
                          {isCompleted ? (
                            <CheckCircle2
                              size={14}
                              className="flex-shrink-0"
                              style={{ color: "var(--ok)" }}
                            />
                          ) : (
                            <Clock
                              size={14}
                              className="flex-shrink-0"
                              style={{ color: "var(--accent)" }}
                            />
                          )}
                          <span className="font-medium text-[var(--foreground)]">
                            {c.name}
                          </span>
                        </div>
                      </td>

                      {/* Difficulty */}
                      <td className="px-4 py-3 align-middle">
                        {c.difficulty && (
                          <span
                            className="inline-block rounded-full px-2.5 py-0.5 text-[11px] font-semibold"
                            style={{ background: color, color: "#000" }}
                          >
                            {c.difficulty}
                          </span>
                        )}
                      </td>

                      {/* Tags */}
                      <td className="px-4 py-3 align-middle">
                        {c.tagNames.length > 0 ? (
                          <div className="flex flex-wrap gap-1 max-w-xs">
                            {c.tagNames.slice(0, 4).map((t) => (
                              <span
                                key={t}
                                className="rounded-full border border-[var(--border)] bg-[var(--field)] px-2 py-0.5 text-[11px] text-[var(--muted)]"
                              >
                                #{t}
                              </span>
                            ))}
                            {c.tagNames.length > 4 && (
                              <span className="text-[11px] text-[var(--muted)]">
                                +{c.tagNames.length - 4}
                              </span>
                            )}
                          </div>
                        ) : (
                          <span className="text-xs text-[var(--muted)]">—</span>
                        )}
                      </td>

                      {/* Questions answered / total */}
                      <td className="px-4 py-3 align-middle">
                        {c.total_questions > 0 ? (
                          <div className="flex items-center gap-1.5">
                            <span
                              className="text-sm font-semibold tabular-nums"
                              style={{
                                color: isCompleted
                                  ? "var(--ok)"
                                  : "var(--foreground)",
                              }}
                            >
                              {c.answered_questions}
                            </span>
                            <span className="text-xs text-[var(--muted)]">
                              / {c.total_questions}
                            </span>
                            <span className="text-xs text-[var(--muted)]">
                              correct
                            </span>
                          </div>
                        ) : (
                          <span className="inline-flex items-center rounded-full border border-[color:var(--err)]/30 bg-[color:var(--err)]/10 px-2.5 py-1 text-xs font-semibold text-[var(--err)]">
                            No questions
                          </span>
                        )}
                      </td>

                      {/* Progress bar + pct */}
                      <td className="px-4 py-3 align-middle">
                        <div className="flex flex-col gap-1 w-32">
                          <div className="h-1.5 w-full overflow-hidden rounded-full bg-[var(--field)] border border-[var(--border)]">
                            <div
                              className="h-full rounded-full transition-all duration-500"
                              style={{
                                width: `${c.pct}%`,
                                background: isCompleted
                                  ? "var(--ok)"
                                  : "var(--accent)",
                                boxShadow: `0 0 6px color-mix(in oklab, ${
                                  isCompleted ? "var(--ok)" : "var(--accent)"
                                } 40%, transparent)`,
                              }}
                            />
                          </div>
                          <span className="text-[10px] text-[var(--muted)] text-right tabular-nums">
                            {c.pct}%
                          </span>
                        </div>
                      </td>

                      {/* Action — link to test page */}
                      <td className="px-4 py-3 align-middle">
                        {c.total_questions > 0 ? (
                          <Link
                            href={`/trainee/competency/${c.id}`}
                            className={cls(
                              "inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-semibold transition-all hover:scale-[1.04] hover:shadow-md",
                              isCompleted
                                ? "border-[color:var(--ok)]/35 bg-[color:var(--ok)]/12 text-[var(--ok)] hover:bg-[var(--ok)] hover:text-white hover:border-[var(--ok)]"
                                : "border-[color:var(--accent)]/35 bg-[color:var(--accent)]/12 text-[var(--accent)] hover:bg-[var(--accent)] hover:text-white hover:border-[var(--accent)]",
                            )}
                          >
                            {isCompleted ? "Review" : "Continue"}
                          </Link>
                        ) : (
                          <span className="text-xs text-[var(--muted)]">—</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Stat chip ──────────────────────────────────────────────────────────────────

function StatChip({
  label,
  value,
  color,
  icon,
}: {
  label: string;
  value: number | string;
  color: string;
  icon?: React.ReactNode;
}) {
  return (
    <div className="card p-4 flex flex-col gap-3">
      {/* Icon chip — matches dashboard StatCard */}
      <div
        className="w-10 h-10 rounded-full grid place-items-center flex-shrink-0"
        style={{
          background: `color-mix(in oklab, ${color} 18%, transparent)`,
          color,
        }}
      >
        {icon}
      </div>
      <span
        className="text-3xl font-bold tabular-nums tracking-tight"
        style={{ color }}
      >
        {value}
      </span>
      <span className="text-xs text-[var(--muted)] font-medium">{label}</span>
    </div>
  );
}
