// src/app/instructor/trainee/[id]/page.tsx
"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";

/* ---------------- Types ---------------- */
type TraineeProfile = {
  id: string;
  email: string | null;
  first_name: string | null;
  last_name: string | null;
  full_name: string | null;
  role: string;
};

type Competency = {
  id: string;
  name: string | null;
  difficulty: string | null;
  tags: string[] | null;
};

type CompetencyRaw = Omit<Competency, "tags"> & {
  tags: string[] | null; // UUID[] from DB
};

type TagRow = {
  id: string;
  name: string;
};

type AssignmentRow = {
  student_id: string;
  competency_id: string;
};

type ProgressRow = {
  student_id: string;
  competency_id: string;
  pct: number;
};

type QuestionRow = {
  competency_id: string;
};

type Item = {
  competency: Competency;
  pct: number;
  hasQuestions: boolean;
};

const DIFF_ORDER: Record<string, number> = {
  beginner: 0,
  intermediate: 1,
  advanced: 2,
  expert: 3,
};

function messageFrom(e: unknown, fallback = "Something went wrong."): string {
  if (typeof e === "object" && e && "message" in e) {
    const msg = (e as { message?: string }).message;
    if (msg) return msg;
  }
  if (typeof e === "string") return e;
  return fallback;
}

/* ---------------- Page ---------------- */
export default function InstructorTraineeDetailPage() {
  const router = useRouter();
  const params = useParams<{ id: string }>();
  const traineeId = params?.id ?? "";
  const isMounted = useRef(true);

  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  const [trainee, setTrainee] = useState<TraineeProfile | null>(null);
  const [items, setItems] = useState<Item[]>([]);
  const [approving, setApproving] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [bulkApproving, setBulkApproving] = useState(false);
  async function approveAll() {
    if (!traineeId) return;

    const pendingIds = items
      .filter((it) => (it.pct ?? 0) < 100)
      .map((it) => it.competency.id);

    if (pendingIds.length === 0) return;

    setBulkApproving(true);
    setErr(null);

    try {
      // Call RPC for each competency
      for (const compId of pendingIds) {
        const { error } = await supabase.rpc(
          "instructor_mark_competency_complete",
          {
            p_student_id: traineeId,
            p_competency_id: compId,
          }
        );
        if (error) {
          throw new Error(error.message);
        }
      }

      // Refresh from the view so pct reflects overrides
      await load();

      setToast("All competencies approved.");
      setTimeout(() => setToast(null), 2000);
    } catch (e) {
      setErr(
        `Could not approve all competencies. ${messageFrom(e, "")}`.trim()
      );
    } finally {
      setBulkApproving(false);
    }
  }

  async function load() {
    try {
      setErr(null);
      setLoading(true);

      if (!traineeId) {
        if (isMounted.current) {
          setTrainee(null);
          setItems([]);
        }
        return;
      }

      // 1) Trainee profile
      const { data: t, error: tErr } = await supabase
        .from("profiles")
        .select("id,email,first_name,last_name,full_name,role")
        .eq("id", traineeId)
        .maybeSingle<TraineeProfile>();
      if (tErr) throw tErr;
      if (!t) throw new Error("Trainee not found.");
      if (isMounted.current) setTrainee(t);

      // 2) Assignments
      const { data: assigns, error: aErr } = await supabase
        .from("competency_assignments")
        .select("student_id,competency_id")
        .eq("student_id", traineeId)
        .returns<AssignmentRow[]>();
      if (aErr) throw aErr;

      const compIds = Array.from(
        new Set((assigns ?? []).map((a) => a.competency_id))
      );
      if (compIds.length === 0) {
        if (isMounted.current) setItems([]);
        return;
      }

      // 3) Competencies
      const [{ data: comps, error: cErr }, { data: tagsData, error: tagsErr }] =
        await Promise.all([
          supabase
            .from("competencies")
            .select("id,name,difficulty,tags")
            .in("id", compIds),
          supabase.from("tags").select("id, name"),
        ]);
      if (cErr) throw cErr;
      if (tagsErr) throw tagsErr;
      const tagNameById = new Map(
        ((tagsData ?? []) as TagRow[]).map((t) => [t.id, t.name]),
      );
      const compsResolved = ((comps ?? []) as CompetencyRaw[]).map((c) => ({
        ...c,
        tags: (c.tags ?? [])
          .map((id) => tagNameById.get(id))
          .filter((v): v is string => Boolean(v)),
      }));

      // 4) Progress
      const { data: progress, error: pErr } = await supabase
        .from("student_competency_progress")
        .select("student_id,competency_id,pct")
        .eq("student_id", traineeId)
        .in("competency_id", compIds)
        .returns<ProgressRow[]>();
      if (pErr) throw pErr;

      const pctByComp = new Map<string, number>();
      (progress ?? []).forEach((r) => pctByComp.set(r.competency_id, r.pct));

      // 5) Has questions?
      const { data: qRows, error: qErr } = await supabase
        .from("competency_questions")
        .select("competency_id")
        .in("competency_id", compIds)
        .returns<QuestionRow[]>();
      if (qErr) throw qErr;

      const hasQ = new Set((qRows ?? []).map((q) => q.competency_id));

      const list: Item[] = compsResolved.map((c) => ({
        competency: c,
        pct: pctByComp.get(c.id) ?? 0,
        hasQuestions: hasQ.has(c.id),
      }));

      // sort: difficulty then name
      list.sort((a, b) => {
        const da =
          DIFF_ORDER[(a.competency.difficulty ?? "").toLowerCase()] ?? 99;
        const db =
          DIFF_ORDER[(b.competency.difficulty ?? "").toLowerCase()] ?? 99;
        if (da !== db) return da - db;
        const an = (a.competency.name ?? "").toLowerCase();
        const bn = (b.competency.name ?? "").toLowerCase();
        return an.localeCompare(bn);
      });

      if (isMounted.current) setItems(list);
    } catch (e) {
      if (isMounted.current) setErr(messageFrom(e));
    } finally {
      if (isMounted.current) setLoading(false);
    }
  }

  useEffect(() => {
    isMounted.current = true;
    void load();
    return () => {
      isMounted.current = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [traineeId]);

  async function approve(compId: string) {
    if (!traineeId) return;
    setApproving(compId);
    try {
      // 1) Call the secure RPC that writes to a base table (NOT the view)
      const { error: rpcErr } = await supabase.rpc(
        "instructor_mark_competency_complete",
        { p_student_id: traineeId, p_competency_id: compId }
      );
      if (rpcErr) throw new Error(rpcErr.message);

      // 2) Re-check via the progress view; if RLS blocks, we’ll see it here.
      const { data: progCheck, error: progErr } = await supabase
        .from("student_competency_progress")
        .select("pct")
        .eq("student_id", traineeId)
        .eq("competency_id", compId)
        .maybeSingle<{ pct: number }>();
      if (progErr) throw progErr;

      if (!progCheck || (progCheck.pct ?? 0) < 100) {
        // This is the *same* message you saw; we keep it explicit to diagnose DB/RLS.
        throw new Error(
          "Approval recorded failed RLS or RPC had no effect (pct still < 100)."
        );
      }

      // 3) Refresh list
      await load();

      setToast("Competency approved.");
      setTimeout(() => setToast(null), 2000);
    } catch (e) {
      setErr(`Could not approve competency. ${messageFrom(e, "")}`.trim());
    } finally {
      setApproving(null);
    }
  }

  const displayName = useMemo(() => {
    if (!trainee) return "Trainee";
    return (
      trainee.full_name ||
      [trainee.first_name ?? "", trainee.last_name ?? ""].join(" ").trim() ||
      trainee.email ||
      "Trainee"
    );
  }, [trainee]);

  return (
    <main className="bg-[var(--background)] text-[var(--foreground)] min-h-[100dvh]">
      {/* Header */}
      <section className="mx-auto max-w-6xl px-6 pt-8 pb-3">
        <div className="flex items-center justify-between">
          <div className="min-w-0">
            <h1 className="text-2xl md:text-3xl font-semibold tracking-tight truncate">
              {displayName}
            </h1>
            <p className="mt-1 text-sm text-[var(--muted)] truncate">
              Enrolled Competencies
            </p>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => router.push("/instructor")}
              className="rounded-xl border border-[var(--border)] bg-[var(--field)] px-3 py-2 text-sm hover:shadow-sm"
            >
              ← Back
            </button>
            <button
              type="button"
              onClick={approveAll}
              disabled={
                loading ||
                bulkApproving ||
                items.length === 0 ||
                !items.some((it) => (it.pct ?? 0) < 100)
              }
              className={[
                "rounded-xl px-3 py-2 text-sm font-medium border transition",
                "disabled:opacity-50 disabled:cursor-not-allowed",
                "border-emerald-700 bg-emerald-600/90 text-white hover:bg-emerald-600",
              ].join(" ")}
            >
              {bulkApproving ? "Approving all…" : "Approve all"}
            </button>
          </div>
        </div>
      </section>

      {/* Errors */}
      <section className="mx-auto max-w-6xl px-6">
        {err && (
          <div className="mb-4 rounded-xl border border-red-900/40 bg-red-950/40 px-4 py-3 text-sm text-red-200">
            {err}
          </div>
        )}
      </section>

      {/* List */}
      <section className="mx-auto max-w-6xl px-6 pb-10">
        {loading && (
          <div className="space-y-3">
            {Array.from({ length: 3 }).map((_, i) => (
              <div
                key={i}
                className="h-24 rounded-2xl border border-[var(--border)] bg-[var(--surface)] animate-pulse"
              />
            ))}
          </div>
        )}

        {!loading && items.length === 0 && (
          <div className="text-sm text-[var(--muted)]">
            No competencies found for this trainee.
          </div>
        )}

        {!loading && items.length > 0 && (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {items.map((it) => {
              const c = it.competency;
              const pct = it.pct ?? 0;
              const completed = pct >= 100;

              return (
                <article
                  key={c.id}
                  className="relative flex flex-col rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-4 h-full"
                >
                  {/* Top-right actions */}
                  <div className="absolute right-3 top-3 flex items-center gap-2">
                    {c.difficulty && (
                      <span className="inline-block rounded-full px-2 py-0.5 text-[10px] font-semibold bg-[var(--field)] border border-[var(--border)] text-[var(--foreground)]/80">
                        {c.difficulty}
                      </span>
                    )}

                    {/* Review chevron if questions exist */}
                    {it.hasQuestions && (
                      <button
                        title="Review answers"
                        onClick={() =>
                          router.push(
                            `/instructor/review/${c.id}?student=${traineeId}`
                          )
                        }
                        className="inline-flex h-8 w-8 items-center justify-center rounded-xl border border-[var(--border)] bg-white text-[var(--foreground)] hover:bg-[var(--accent)] hover:text-white transition"
                      >
                        <svg
                          width="16"
                          height="16"
                          viewBox="0 0 24 24"
                          fill="none"
                        >
                          <path
                            d="M9 18l6-6-6-6"
                            stroke="currentColor"
                            strokeWidth="2"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                          />
                        </svg>
                      </button>
                    )}
                  </div>

                  <h3 className="pr-24 font-semibold leading-snug">
                    {c.name ?? "Untitled competency"}
                  </h3>

                  {!!c.tags?.length && (
                    <div className="mt-2 flex flex-wrap gap-1">
                      {c.tags!.slice(0, 6).map((t) => (
                        <span
                          key={t}
                          className="text-[10px] rounded-full border border-[var(--border)] bg-[var(--surface)] px-2 py-0.5 text-[var(--foreground)]/80"
                        >
                          #{t}
                        </span>
                      ))}
                    </div>
                  )}

                  <div className="mt-auto pt-3 flex items-center justify-between gap-3">
                    {/* progress */}
                    <div className="min-w-0">
                      <div className="text-xs text-[var(--muted)]">
                        {completed ? "Completed" : "Progress"}
                      </div>
                      <div className="mt-1 flex items-center gap-2">
                        <div className="h-1.5 w-40 overflow-hidden rounded-full bg-[var(--field)] border border-[var(--border)]">
                          <div
                            className="h-full"
                            style={{
                              width: `${pct}%`,
                              background: "var(--accent)",
                            }}
                          />
                        </div>
                        <span className="text-xs font-semibold w-8">
                          {pct}%
                        </span>
                      </div>
                    </div>

                    {/* approve */}
                    <button
                      disabled={completed || approving === c.id}
                      onClick={() => approve(c.id)}
                      className={[
                        "shrink-0 inline-flex items-center gap-2 rounded-xl px-3 py-2 text-sm font-medium transition",
                        completed
                          ? "border border-[var(--border)] bg-[var(--field)] text-[var(--muted)]"
                          : "border border-emerald-700 bg-emerald-600/90 text-white hover:bg-emerald-600",
                      ].join(" ")}
                    >
                      {approving === c.id
                        ? "Approving…"
                        : completed
                        ? "Approved"
                        : "Approve"}
                    </button>
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </section>

      {/* Tiny toast */}
      {toast && (
        <div className="fixed inset-x-0 bottom-6 z-50 flex justify-center">
          <div
            className="rounded-lg bg-emerald-600 text-white px-3 py-2 text-sm shadow-lg"
            role="status"
          >
            {toast}
          </div>
        </div>
      )}
    </main>
  );
}
