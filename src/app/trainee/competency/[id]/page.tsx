// src/app/trainee/competency/[id]/page.tsx
"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";
import type {
  TagRow,
  Competency as CanonicalCompetency,
} from "@/lib/types";

/* ------------------------- Types ------------------------- */
type CompetencyDetail = Pick<
  CanonicalCompetency,
  "id" | "name" | "difficulty" | "tags" | "created_at"
>;

type Question = {
  id: string;
  competency_id: string;
  body: string;
  created_at: string;
};

type Option = {
  id: string;
  question_id: string;
  body: string;
};

type Answer = {
  student_id: string;
  question_id: string;
  is_correct: boolean | null; // MCQ only (backend enforces selected_option_id)
  answered_at: string;
};

type OptionsByQ = Record<string, Option[]>;

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/* --------------------- Page ---------------------- */
export default function TraineeCompetencyPage() {
  const router = useRouter();
  const params = useParams<{ id: string }>();
  const competencyId = params.id;

  // session/user
  const [userId, setUserId] = useState<string | null>(null);

  // data
  const [competency, setCompetency] = useState<CompetencyDetail | null>(null);
  const [questions, setQuestions] = useState<Question[]>([]);
  const [optionsByQ, setOptionsByQ] = useState<OptionsByQ>({});
  const [answers, setAnswers] = useState<Record<string, Answer>>({}); // by question_id

  // UI/local
  const [choice, setChoice] = useState<Record<string, string>>({}); // qid -> optionId
  const [loading, setLoading] = useState(true);
  const [savingQ, setSavingQ] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  // refs per question for auto-scroll after "wrong"
  const qRefs = useRef<Record<string, HTMLElement | null>>({});

  // progress
  const total = questions.length;
  const answeredCount = useMemo(
    () => Object.values(answers).filter((a) => a?.is_correct === true).length,
    [answers],
  );
  const pct = total ? Math.round((answeredCount / total) * 100) : 0;

  /* -------------------- Initial load -------------------- */
  useEffect(() => {
    let cancelled = false;

    (async () => {
      setLoading(true);
      setErr(null);
      try {
        const { data: u, error: uerr } = await supabase.auth.getUser();
        if (uerr) throw uerr;
        const uid = u.user?.id ?? null;
        setUserId(uid);
        if (!uid) {
          router.replace(
            `/signin?redirect=/trainee/competency/${competencyId}`,
          );
          return;
        }

        // competency
        const [{ data: comp, error: cerr }, { data: tagsData, error: tagsErr }] =
          await Promise.all([
            supabase
              .from("competencies")
              .select("id, name, difficulty, tags, created_at")
              .eq("id", competencyId)
              .single<CompetencyDetail>(),
            supabase.from("tags").select("id, name"),
          ]);
        if (cerr) throw cerr;
        if (tagsErr) throw tagsErr;
        if (!comp) throw new Error("Competency not found.");
        const tagNameById = new Map(
          ((tagsData ?? []) as TagRow[]).map((t) => [t.id, t.name]),
        );
        const resolvedComp: CompetencyDetail = {
          ...comp,
          tags: (comp.tags ?? [])
            .map((id) => tagNameById.get(id))
            .filter((v): v is string => Boolean(v)),
        };
        if (cancelled) return;
        setCompetency(resolvedComp);

        // questions
        const { data: qs, error: qerr } = await supabase
          .from("competency_questions")
          .select("id, competency_id, body, created_at")
          .eq("competency_id", competencyId)
          .order("created_at", { ascending: true })
          .returns<Question[]>();
        if (qerr) throw qerr;
        if (cancelled) return;
        const list = qs ?? [];
        setQuestions(list);

        // options (MCQ) for all questions
        if (list.length > 0) {
          const ids = list.map((q) => q.id);
          const { data: opts, error: oerr } = await supabase
            .from("question_options")
            .select("id, question_id, body")
            .in("question_id", ids)
            .returns<Option[]>();
          if (oerr) throw oerr;

          const byQ: OptionsByQ = {};
          (opts ?? []).forEach((o) => {
            if (!byQ[o.question_id]) byQ[o.question_id] = [];
            byQ[o.question_id].push(o);
          });

          // randomize display order per question (presentation-only)
          Object.keys(byQ).forEach((qid) => {
            byQ[qid] = shuffle(byQ[qid]);
          });

          setOptionsByQ(byQ);
        } else {
          setOptionsByQ({});
        }

        // existing answers
        if (list.length > 0 && uid) {
          const ids = list.map((q) => q.id);
          const { data: ans, error: aerr } = await supabase
            .from("student_answers")
            .select("student_id, question_id, is_correct, answered_at")
            .eq("student_id", uid)
            .in("question_id", ids)
            .returns<Answer[]>();
          if (aerr) throw aerr;

          const byId: Record<string, Answer> = {};
          (ans ?? []).forEach((a) => (byId[a.question_id] = a));
          setAnswers(byId);
        } else {
          setAnswers({});
        }
      } catch (e: unknown) {
        const msg =
          e instanceof Error
            ? e.message
            : typeof e === "string"
              ? e
              : "Something went wrong";
        setErr(msg);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [competencyId, router]);

  /* -------------------- Handlers -------------------- */
  async function submitMCQ(qid: string) {
    if (!userId) return;
    const selected = choice[qid];
    if (!selected) {
      setErr("Please select an option first.");
      return;
    }

    setSavingQ(qid);
    setErr(null);
    try {
      // optimistic (just mark as answered locally)
      setAnswers((prev) => ({
        ...prev,
        [qid]: {
          student_id: userId,
          question_id: qid,
          is_correct: prev[qid]?.is_correct ?? null,
          answered_at: new Date().toISOString(),
        },
      }));

      const { error } = await supabase.from("student_answers").upsert(
        {
          student_id: userId,
          question_id: qid,
          selected_option_id: selected, // DB trigger computes is_correct
          answered_at: new Date().toISOString(),
        },
        { onConflict: "student_id,question_id" },
      );
      if (error) throw error;

      // re-fetch this answer to show correctness
      const { data: refreshed, error: rerr } = await supabase
        .from("student_answers")
        .select("student_id, question_id, is_correct, answered_at")
        .eq("student_id", userId)
        .eq("question_id", qid)
        .single<Answer>();
      if (rerr) throw rerr;

      setAnswers((prev) => ({ ...prev, [qid]: refreshed }));

      // if wrong, scroll into view for quick retry
      if (refreshed?.is_correct === false) {
        qRefs.current[qid]?.scrollIntoView({
          behavior: "smooth",
          block: "center",
        });
      }
    } catch (e: unknown) {
      const msg =
        e instanceof Error
          ? e.message
          : typeof e === "string"
            ? e
            : "Failed to submit answer";
      setErr(msg);
    } finally {
      setSavingQ(null);
    }
  }

  /* -------------------- Render -------------------- */
  return (
    <main className="px-8 py-8 max-w-6xl mx-auto">
      {/* Hero */}
      <div className="mb-6 flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
        <div className="min-w-0">
          <h1
            className="text-3xl font-bold tracking-tight text-[var(--foreground)]"
            style={{ fontFamily: "var(--font-heading, sans-serif)" }}
          >
            {competency ? competency.name : "Loading…"}
          </h1>
          <div className="accent-underline mt-3" />
          <p className="mt-3 text-sm text-[var(--muted)]">
            {competency?.difficulty ?? "—"}
          </p>
        </div>
        <div className="md:w-60 md:flex-shrink-0">
          <Progress pct={pct} />
        </div>
      </div>

      {/* Answered count */}
      <div className="mb-4 text-sm text-[var(--muted)]">
        {answeredCount}/{total} answered • {pct}%
      </div>

      {err && (
        <div className="mb-4 rounded-2xl border border-[color:var(--err)]/30 bg-[color:var(--err)]/10 px-4 py-3 text-sm text-[var(--err)]">
          {err}
        </div>
      )}

      {loading ? (
        <div className="space-y-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <div
              key={i}
              className="h-24 rounded-2xl border border-[var(--border)] bg-[var(--surface)] animate-pulse"
            />
          ))}
        </div>
      ) : questions.length === 0 ? (
        <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] px-4 py-8 text-center text-sm text-[var(--muted)]">
          No questions have been added to this competency yet.
        </div>
      ) : (
        <div className="space-y-4">
          {questions.map((q, idx) => {
            const a = answers[q.id];
            const isCorrect = a?.is_correct === true;
            const isWrong = a?.is_correct === false;
            const opts = optionsByQ[q.id] ?? [];

            return (
              <article
                key={q.id}
                ref={(el) => {
                  qRefs.current[q.id] = el;
                }}
                className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-5"
              >
                {/* Header */}
                <div className="flex items-start justify-between gap-4">
                  <div className="min-w-0">
                    <div className="text-xs font-semibold uppercase tracking-[0.14em] text-[var(--muted)]">
                      Question {idx + 1}
                    </div>
                    <p className="mt-2 text-sm font-medium text-[var(--foreground)] leading-snug">
                      {q.body}
                    </p>
                  </div>
                  <span
                    className={
                      isCorrect
                        ? "flex-shrink-0 rounded-full border border-[color:var(--ok)]/35 bg-[color:var(--ok)]/12 px-2.5 py-0.5 text-[11px] font-semibold text-[var(--ok)]"
                        : isWrong
                          ? "flex-shrink-0 rounded-full border border-[color:var(--err)]/35 bg-[color:var(--err)]/12 px-2.5 py-0.5 text-[11px] font-semibold text-[var(--err)]"
                          : "flex-shrink-0 rounded-full border border-[var(--border)] bg-[var(--field)] px-2.5 py-0.5 text-[11px] font-semibold text-[var(--muted)]"
                    }
                  >
                    {isCorrect ? "Correct" : isWrong ? "Wrong" : "Unanswered"}
                  </span>
                </div>

                {/* Answer UI */}
                <div className="mt-4">
                  {opts.length > 0 ? (
                    <div className="space-y-2">
                      {opts.map((o) => {
                        const isSelected = choice[q.id] === o.id;
                        return (
                          <label
                            key={o.id}
                            className={
                              "flex items-start gap-3 rounded-xl border bg-[var(--field)] px-3 py-2.5 cursor-pointer transition-colors " +
                              (isCorrect || savingQ === q.id
                                ? "cursor-default "
                                : "hover:border-[color:var(--accent)]/60 ") +
                              (isSelected
                                ? "border-[color:var(--accent)]/60"
                                : "border-[var(--border)]")
                            }
                          >
                            <input
                              type="radio"
                              name={`q_${q.id}`}
                              className="mt-1 accent-[color:var(--accent)]"
                              value={o.id}
                              disabled={isCorrect || savingQ === q.id}
                              checked={isSelected}
                              onChange={() =>
                                setChoice((prev) => ({
                                  ...prev,
                                  [q.id]: o.id,
                                }))
                              }
                            />
                            <span className="text-sm text-[var(--foreground)] leading-snug">
                              {o.body}
                            </span>
                          </label>
                        );
                      })}

                      {!isCorrect && (
                        <div className="mt-3 flex justify-end">
                          <button
                            type="button"
                            onClick={() => submitMCQ(q.id)}
                            disabled={
                              !choice[q.id] || savingQ === q.id || isCorrect
                            }
                            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-full text-sm font-semibold text-white transition-all hover:opacity-90 hover:shadow-[0_0_12px_color-mix(in_oklab,var(--accent)_40%,transparent)] disabled:opacity-60 disabled:cursor-not-allowed disabled:hover:shadow-none"
                            style={{ background: "var(--accent)" }}
                          >
                            {savingQ === q.id ? "Submitting…" : "Submit answer"}
                          </button>
                        </div>
                      )}
                    </div>
                  ) : (
                    <div className="rounded-xl border border-[var(--border)] bg-[var(--field)] px-3 py-2.5 text-sm text-[var(--muted)]">
                      This question is not available yet (no answer options
                      configured).
                    </div>
                  )}
                </div>

                {a && (
                  <div className="mt-3 text-xs text-[var(--muted)]">
                    Saved {new Date(a.answered_at).toLocaleString()} •{" "}
                    {a.is_correct ? "Correct" : "Wrong"}
                  </div>
                )}
              </article>
            );
          })}
        </div>
      )}
    </main>
  );
}

/* ----------------------------- UI Bits --------------------------------- */
function Progress({ pct }: { pct: number }) {
  return (
    <div>
      <div className="mb-1.5 flex items-center justify-between text-xs text-[var(--muted)]">
        <span>Progress</span>
        <span>{pct}%</span>
      </div>
      <div className="h-1.5 rounded-full bg-[var(--border)] overflow-hidden">
        <div
          className="h-full rounded-full transition-all duration-700"
          style={{ width: `${pct}%`, background: "var(--accent)" }}
        />
      </div>
    </div>
  );
}
