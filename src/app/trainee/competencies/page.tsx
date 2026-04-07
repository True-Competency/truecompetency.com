// src/app/trainee/competencies/page.tsx
"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";
import {
  Search,
  X,
  CheckCircle2,
  Clock,
  BookOpen,
  Loader2,
  ArrowRight,
} from "lucide-react";

// ── Types ──────────────────────────────────────────────────────────────────────

type CompetencyRow = {
  id: string;
  name: string;
  difficulty: string | null;
  tags: string[] | null; // UUID[] from DB
  position: number | null;
};

type TagRow = {
  id: string;
  name: string;
};

type AssignmentRow = {
  competency_id: string;
};

type ProgressRow = {
  competency_id: string;
  pct: number;
  total_questions: number;
  answered_questions: number;
};

type DiffFilter = "all" | "beginner" | "intermediate" | "expert";
type StatusFilter = "all" | "available" | "enrolled" | "completed";

// Resolved competency with tag names instead of UUIDs
type Competency = CompetencyRow & { tagNames: string[] };

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

export default function TraineeCompetenciesPage() {
  const router = useRouter();

  // Auth
  const [uid, setUid] = useState<string | null>(null);

  // Data
  const [competencies, setCompetencies] = useState<Competency[]>([]);
  const [tagOptions, setTagOptions] = useState<TagRow[]>([]);
  const [assignments, setAssignments] = useState<Set<string>>(new Set());
  const [progressMap, setProgressMap] = useState<Map<string, ProgressRow>>(
    new Map(),
  );

  // Selected competency for detail panel
  const [selected, setSelected] = useState<Competency | null>(null);

  // Per-row optimistic loading states
  const [enrollingIds, setEnrollingIds] = useState<Set<string>>(new Set());
  const [unenrollingIds, setUnenrollingIds] = useState<Set<string>>(new Set());

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
        const id = userRes.user?.id ?? null;
        if (!id) {
          router.replace("/signin?redirect=/trainee/competencies");
          return;
        }
        setUid(id);

        // All queries in parallel
        const [
          { data: comps, error: cErr },
          { data: tags, error: tErr },
          { data: assigns, error: aErr },
          { data: progress, error: pErr },
        ] = await Promise.all([
          // All competencies ordered by position (curriculum order matters)
          supabase
            .from("competencies")
            .select("id, name, difficulty, tags, position")
            .order("position", { ascending: true, nullsFirst: false })
            .returns<CompetencyRow[]>(),

          // All tags for filter chips + UUID -> name resolution
          supabase
            .from("tags")
            .select("id, name")
            .order("name", { ascending: true })
            .returns<TagRow[]>(),

          // My enrollments
          supabase
            .from("competency_assignments")
            .select("competency_id")
            .eq("student_id", id)
            .returns<AssignmentRow[]>(),

          // My progress per competency
          supabase
            .from("student_competency_progress")
            .select("competency_id, pct, total_questions, answered_questions")
            .eq("student_id", id)
            .returns<ProgressRow[]>(),
        ]);

        if (cErr) throw cErr;
        if (tErr) throw tErr;
        if (aErr) throw aErr;
        if (pErr) throw pErr;
        if (cancelled) return;

        // Build tag uuid -> name map
        const tMap = new Map<string, string>(
          ((tags ?? []) as TagRow[]).map((t) => [t.id, t.name]),
        );
        setTagOptions(tags ?? []);

        // Resolve tag UUIDs to names in each competency
        const resolved: Competency[] = (comps ?? []).map((c) => ({
          ...c,
          tagNames: (c.tags ?? [])
            .map((id) => tMap.get(id))
            .filter((n): n is string => Boolean(n)),
        }));
        setCompetencies(resolved);

        setAssignments(new Set((assigns ?? []).map((r) => r.competency_id)));

        const pMap = new Map<string, ProgressRow>();
        (progress ?? []).forEach((r) => pMap.set(r.competency_id, r));
        setProgressMap(pMap);
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

  // ── Enroll ───────────────────────────────────────────────────────────────────

  const enroll = useCallback(
    async (competencyId: string) => {
      if (!uid) return;
      setEnrollingIds((prev) => new Set(prev).add(competencyId));
      setAssignments((prev) => new Set(prev).add(competencyId)); // optimistic

      const { error } = await supabase.from("competency_assignments").upsert(
        [
          {
            student_id: uid,
            competency_id: competencyId,
            assigned_at: new Date().toISOString(),
          },
        ],
        { onConflict: "student_id,competency_id" },
      );

      if (error) {
        setAssignments((prev) => {
          const n = new Set(prev);
          n.delete(competencyId);
          return n;
        });
        setErr(error.message);
      }

      setEnrollingIds((prev) => {
        const n = new Set(prev);
        n.delete(competencyId);
        return n;
      });
    },
    [uid],
  );

  // ── Unenroll ─────────────────────────────────────────────────────────────────

  const unenroll = useCallback(
    async (competencyId: string) => {
      if (!uid) return;
      setUnenrollingIds((prev) => new Set(prev).add(competencyId));
      setAssignments((prev) => {
        const n = new Set(prev);
        n.delete(competencyId);
        return n;
      }); // optimistic

      const { error } = await supabase
        .from("competency_assignments")
        .delete()
        .eq("student_id", uid)
        .eq("competency_id", competencyId);

      if (error) {
        setAssignments((prev) => new Set(prev).add(competencyId));
        setErr(error.message);
      }

      setUnenrollingIds((prev) => {
        const n = new Set(prev);
        n.delete(competencyId);
        return n;
      });
    },
    [uid],
  );

  // ── Bulk enroll ───────────────────────────────────────────────────────────────

  const bulkEnroll = useCallback(
    async (diff: DiffFilter) => {
      if (!uid) return;
      const targets = competencies
        .filter((c) => {
          if (assignments.has(c.id)) return false;
          if (diff === "all") return true;
          return (c.difficulty ?? "").toLowerCase() === diff;
        })
        .map((c) => c.id);

      if (targets.length === 0) return;

      setAssignments((prev) => {
        const next = new Set(prev);
        targets.forEach((id) => next.add(id));
        return next;
      });

      const { error } = await supabase.from("competency_assignments").upsert(
        targets.map((id) => ({
          student_id: uid,
          competency_id: id,
          assigned_at: new Date().toISOString(),
        })),
        { onConflict: "student_id,competency_id" },
      );

      if (error) {
        setAssignments((prev) => {
          const next = new Set(prev);
          targets.forEach((id) => next.delete(id));
          return next;
        });
        setErr(error.message);
      }
    },
    [uid, competencies, assignments],
  );

  // ── Status helper ─────────────────────────────────────────────────────────────

  function getStatus(id: string): StatusFilter {
    if (!assignments.has(id)) return "available";
    if ((progressMap.get(id)?.pct ?? 0) >= 100) return "completed";
    return "enrolled";
  }

  // ── Filtering ─────────────────────────────────────────────────────────────────

  const filtered = useMemo(() => {
    let list = competencies;

    if (statusFilter !== "all") {
      list = list.filter((c) => getStatus(c.id) === statusFilter);
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    competencies,
    statusFilter,
    diffFilter,
    selectedTags,
    search,
    assignments,
    progressMap,
  ]);

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
      <div className="mb-6 flex items-start justify-between gap-4 flex-shrink-0">
        <div>
          <h1
            className="text-3xl font-bold tracking-tight text-[var(--foreground)]"
            style={{ fontFamily: "var(--font-heading, sans-serif)" }}
          >
            Competencies
          </h1>
          <div className="accent-underline mt-3" />
          <p className="mt-3 text-sm text-[var(--muted)]">
            {loading
              ? "Loading…"
              : `${competencies.length} competencies · ${
                  competencies.filter((c) => assignments.has(c.id)).length
                } enrolled · ${
                  competencies.filter(
                    (c) => (progressMap.get(c.id)?.pct ?? 0) >= 100,
                  ).length
                } completed`}
          </p>
        </div>

        {/* Bulk enroll buttons */}
        <div className="flex gap-2 flex-shrink-0 mt-1 flex-wrap justify-end">
          {(
            [
              {
                label: "Enroll All",
                diff: "all" as DiffFilter,
                style: {
                  background: "var(--field)",
                  color: "var(--foreground)",
                  borderColor: "var(--border)",
                },
              },
              {
                label: "+ Beginner",
                diff: "beginner" as DiffFilter,
                style: {
                  background: "var(--ok)",
                  color: "#000",
                  borderColor: "var(--ok)",
                },
              },
              {
                label: "+ Intermediate",
                diff: "intermediate" as DiffFilter,
                style: {
                  background: "var(--warn)",
                  color: "#000",
                  borderColor: "var(--warn)",
                },
              },
              {
                label: "+ Expert",
                diff: "expert" as DiffFilter,
                style: {
                  background: "var(--err)",
                  color: "#000",
                  borderColor: "var(--err)",
                },
              },
            ] as const
          ).map(({ label, diff, style }) => (
            <button
              key={diff}
              type="button"
              onClick={() => bulkEnroll(diff)}
              className="flex items-center gap-2 px-4 py-2.5 rounded-full text-sm font-semibold border transition-all hover:opacity-90 hover:scale-[1.02]"
              style={style}
            >
              {label}
            </button>
          ))}
        </div>
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

      {/* ── Filters ── */}
      <div className="mb-4 flex-shrink-0 space-y-2">
        {/* Search + clear */}
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

        {/* Status + Difficulty + Tags — all in one row */}
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-xs text-[var(--muted)] flex-shrink-0">
            Status:
          </span>
          {(
            ["all", "available", "enrolled", "completed"] as StatusFilter[]
          ).map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => setStatusFilter(s)}
              className={cls(
                "rounded-full px-3 py-1.5 text-xs font-medium border transition-all",
                statusFilter === s
                  ? "border-[color:var(--accent)] bg-[color:var(--accent)]/15 text-[var(--accent)]"
                  : "border-[var(--border)] bg-[var(--field)] text-[var(--foreground)] hover:border-[color:var(--accent)] hover:text-[var(--accent)]",
              )}
            >
              {s.charAt(0).toUpperCase() + s.slice(1)}
            </button>
          ))}

          <span className="text-xs text-[var(--muted)] flex-shrink-0 ml-2">
            Difficulty:
          </span>
          {(["all", "beginner", "intermediate", "expert"] as DiffFilter[]).map(
            (d) => {
              const color =
                d === "beginner"
                  ? "var(--ok)"
                  : d === "intermediate"
                    ? "var(--warn)"
                    : d === "expert"
                      ? "var(--err)"
                      : null;
              const isActive = diffFilter === d;
              return (
                <button
                  key={d}
                  type="button"
                  onClick={() => setDiffFilter(d)}
                  className="rounded-full px-3 py-1.5 text-xs font-medium border transition-all"
                  style={
                    isActive && color
                      ? { background: color, borderColor: color, color: "#000" }
                      : isActive
                        ? {
                            background:
                              "color-mix(in oklab, var(--accent) 15%, transparent)",
                            borderColor: "var(--accent)",
                            color: "var(--accent)",
                          }
                        : {
                            background: "var(--field)",
                            borderColor: "var(--border)",
                            color: "var(--foreground)",
                          }
                  }
                >
                  {d === "all" ? "All" : d.charAt(0).toUpperCase() + d.slice(1)}
                </button>
              );
            },
          )}
        </div>

        {/* Tags */}
        {tagOptions.length > 0 && (
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className="text-xs text-[var(--muted)] w-16 flex-shrink-0">
              Tags:
            </span>
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
                  <th className="px-4 py-3 text-left text-xs font-semibold text-[var(--muted)] w-32">
                    Status
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-[var(--muted)] w-32">
                    Progress
                  </th>
                </tr>
              </thead>
              <tbody>
                {filtered.length === 0 && (
                  <tr>
                    <td
                      colSpan={6}
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
                  const status = getStatus(c.id);
                  const progress = progressMap.get(c.id);
                  const pct = Math.round(progress?.pct ?? 0);

                  return (
                    <tr
                      key={c.id}
                      onClick={() => setSelected(c)}
                      className="border-t border-[var(--border)] hover:bg-[color:var(--accent)]/5 cursor-pointer transition-colors"
                    >
                      {/* Position */}
                      <td className="px-4 py-3 align-middle text-xs text-[var(--muted)] tabular-nums">
                        {c.position ?? idx + 1}
                      </td>

                      {/* Name */}
                      <td className="px-4 py-3 align-middle font-medium text-[var(--foreground)]">
                        <div className="flex items-center gap-2">
                          {c.name}
                          <ArrowRight
                            size={12}
                            className="text-[var(--muted)] opacity-0 group-hover:opacity-100 transition-opacity"
                          />
                        </div>
                      </td>

                      {/* Difficulty */}
                      <td className="px-4 py-3 align-middle">
                        {c.difficulty && (
                          <span
                            className="inline-block rounded-full px-2.5 py-0.5 text-[11px] font-semibold"
                            style={{
                              background: diffColor(c.difficulty),
                              color: "#000",
                            }}
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

                      {/* Status badge */}
                      <td className="px-4 py-3 align-middle">
                        {status === "completed" && (
                          <span
                            className="inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs font-semibold"
                            style={{
                              background:
                                "color-mix(in oklab, var(--ok) 15%, transparent)",
                              borderColor:
                                "color-mix(in oklab, var(--ok) 30%, transparent)",
                              color: "var(--ok)",
                            }}
                          >
                            <CheckCircle2 size={11} />
                            Completed
                          </span>
                        )}
                        {status === "enrolled" && (
                          <span
                            className="inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs font-semibold"
                            style={{
                              background:
                                "color-mix(in oklab, var(--accent) 12%, transparent)",
                              borderColor:
                                "color-mix(in oklab, var(--accent) 25%, transparent)",
                              color: "var(--accent)",
                            }}
                          >
                            <Clock size={11} />
                            Enrolled
                          </span>
                        )}
                        {status === "available" && (
                          <span
                            className="inline-flex items-center rounded-full border px-2.5 py-1 text-xs font-semibold"
                            style={{
                              background:
                                "color-mix(in oklab, var(--err) 12%, transparent)",
                              borderColor:
                                "color-mix(in oklab, var(--err) 25%, transparent)",
                              color: "var(--err)",
                            }}
                          >
                            Not enrolled
                          </span>
                        )}
                      </td>

                      {/* Progress */}
                      <td className="px-4 py-3 align-middle">
                        {status !== "available" ? (
                          <div className="flex flex-col gap-1 w-24">
                            <div className="h-1.5 w-full overflow-hidden rounded-full bg-[var(--field)] border border-[var(--border)]">
                              <div
                                className="h-full rounded-full transition-all duration-500"
                                style={{
                                  width: `${pct}%`,
                                  background:
                                    status === "completed"
                                      ? "var(--ok)"
                                      : "var(--accent)",
                                }}
                              />
                            </div>
                            <span className="text-[10px] text-[var(--muted)] text-right">
                              {pct}%
                            </span>
                          </div>
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

      {/* ── Detail panel modal ── */}
      {selected && (
        <CompetencyDetailPanel
          competency={selected}
          status={getStatus(selected.id)}
          progress={progressMap.get(selected.id)}
          enrolling={enrollingIds.has(selected.id)}
          unenrolling={unenrollingIds.has(selected.id)}
          onEnroll={() => enroll(selected.id)}
          onUnenroll={() => unenroll(selected.id)}
          onClose={() => setSelected(null)}
        />
      )}
    </div>
  );
}

// ── Detail panel ──────────────────────────────────────────────────────────────

function CompetencyDetailPanel({
  competency,
  status,
  progress,
  enrolling,
  unenrolling,
  onEnroll,
  onUnenroll,
  onClose,
}: {
  competency: Competency;
  status: StatusFilter;
  progress: ProgressRow | undefined;
  enrolling: boolean;
  unenrolling: boolean;
  onEnroll: () => void;
  onUnenroll: () => void;
  onClose: () => void;
}) {
  const pct = Math.round(progress?.pct ?? 0);
  const color = diffColor(competency.difficulty);
  const testHref = `/trainee/competency/${competency.id}`;

  return (
    <div
      role="dialog"
      aria-modal="true"
      onClick={onClose}
      className="fixed inset-0 z-50 grid place-items-center bg-black/50 px-4"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-lg rounded-2xl border border-[var(--border)] bg-[var(--surface)] shadow-2xl overflow-hidden"
      >
        {/* Color stripe */}
        <div className="h-1.5 w-full" style={{ background: color }} />

        <div className="p-6">
          {/* Header */}
          <div className="flex items-start justify-between gap-4 mb-5">
            <div className="min-w-0 flex-1">
              {/* Position + difficulty */}
              <div className="flex items-center gap-2 mb-2">
                {competency.position != null && (
                  <span className="text-xs text-[var(--muted)] tabular-nums font-medium">
                    #{competency.position}
                  </span>
                )}
                {competency.difficulty && (
                  <span
                    className="text-[11px] font-semibold rounded-full px-2.5 py-0.5"
                    style={{ background: color, color: "#000" }}
                  >
                    {competency.difficulty}
                  </span>
                )}
                {/* Status badge */}
                {status === "completed" && (
                  <span
                    className="inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-[11px] font-semibold"
                    style={{
                      background:
                        "color-mix(in oklab, var(--ok) 15%, transparent)",
                      borderColor:
                        "color-mix(in oklab, var(--ok) 30%, transparent)",
                      color: "var(--ok)",
                    }}
                  >
                    <CheckCircle2 size={11} />
                    Completed
                  </span>
                )}
                {status === "enrolled" && (
                  <span
                    className="inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-[11px] font-semibold"
                    style={{
                      background:
                        "color-mix(in oklab, var(--accent) 12%, transparent)",
                      borderColor:
                        "color-mix(in oklab, var(--accent) 25%, transparent)",
                      color: "var(--accent)",
                    }}
                  >
                    <Clock size={11} />
                    In progress
                  </span>
                )}
              </div>

              {/* Name */}
              <h2 className="text-lg font-semibold text-[var(--foreground)] leading-snug">
                {competency.name}
              </h2>
            </div>

            {/* Close */}
            <button
              onClick={onClose}
              className="h-8 w-8 grid place-items-center rounded-full border border-[var(--border)] bg-[var(--field)] text-[var(--foreground)] hover:border-[color:var(--accent)] hover:text-[var(--accent)] transition-all flex-shrink-0"
              aria-label="Close"
            >
              <X size={14} />
            </button>
          </div>

          {/* Tags */}
          {competency.tagNames.length > 0 && (
            <div className="flex flex-wrap gap-1.5 mb-5">
              {competency.tagNames.map((t) => (
                <span
                  key={t}
                  className="rounded-full border border-[var(--border)] bg-[var(--field)] px-2.5 py-0.5 text-xs text-[var(--muted)]"
                >
                  #{t}
                </span>
              ))}
            </div>
          )}

          {/* Progress section — enrolled/completed only */}
          {status !== "available" && (
            <div className="rounded-2xl border border-[var(--border)] bg-[var(--field)] p-4 mb-5">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-medium text-[var(--muted)]">
                  Your progress
                </span>
                <span
                  className="text-sm font-bold"
                  style={{
                    color:
                      status === "completed" ? "var(--ok)" : "var(--accent)",
                  }}
                >
                  {pct}%
                </span>
              </div>
              <div className="h-2 w-full overflow-hidden rounded-full bg-[var(--surface)] border border-[var(--border)]">
                <div
                  className="h-full rounded-full transition-all duration-700"
                  style={{
                    width: `${pct}%`,
                    background:
                      status === "completed" ? "var(--ok)" : "var(--accent)",
                    boxShadow: `0 0 8px color-mix(in oklab, ${
                      status === "completed" ? "var(--ok)" : "var(--accent)"
                    } 50%, transparent)`,
                  }}
                />
              </div>
              {progress && (
                <p className="mt-2 text-xs text-[var(--muted)]">
                  {progress.answered_questions} of {progress.total_questions}{" "}
                  questions answered
                </p>
              )}
            </div>
          )}

          {/* Action buttons */}
          <div className="flex items-center gap-3">
            {/* Available → Enroll */}
            {status === "available" && (
              <button
                type="button"
                onClick={onEnroll}
                disabled={enrolling}
                className="flex-1 inline-flex items-center justify-center gap-2 rounded-xl border-2 px-4 py-2.5 text-sm font-semibold transition-all hover:opacity-90 disabled:opacity-60 disabled:cursor-not-allowed"
                style={{
                  background: "var(--accent)",
                  color: "#fff",
                  borderColor: "var(--accent)",
                }}
              >
                {enrolling ? (
                  <>
                    <Loader2 size={14} className="animate-spin" /> Enrolling…
                  </>
                ) : (
                  <>
                    <BookOpen size={14} /> Enroll in this competency
                  </>
                )}
              </button>
            )}

            {/* Enrolled/completed → Test or Review */}
            {status !== "available" && (
              <a
                href={testHref}
                className="flex-1 inline-flex items-center justify-center gap-2 rounded-xl border-2 px-4 py-2.5 text-sm font-semibold transition-all hover:opacity-90"
                style={{
                  background:
                    status === "completed" ? "var(--ok)" : "var(--accent)",
                  color: "#fff",
                  borderColor:
                    status === "completed" ? "var(--ok)" : "var(--accent)",
                }}
              >
                {status === "completed" ? (
                  <>
                    <CheckCircle2 size={14} /> Review questions
                  </>
                ) : (
                  <>
                    <Clock size={14} /> Continue testing
                  </>
                )}
              </a>
            )}

            {/* Enrolled/completed → Unenroll */}
            {status !== "available" && (
              <button
                type="button"
                onClick={onUnenroll}
                disabled={unenrolling}
                className="inline-flex items-center gap-2 rounded-xl border px-4 py-2.5 text-sm font-medium text-[var(--muted)] hover:text-[var(--err)] hover:border-[color:var(--err)] transition-all disabled:opacity-60"
                style={{ borderColor: "var(--border)" }}
              >
                {unenrolling ? (
                  <>
                    <Loader2 size={14} className="animate-spin" /> Removing…
                  </>
                ) : (
                  "Unenroll"
                )}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
