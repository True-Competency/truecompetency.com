// src/app/committee/review-queue/questions/page.tsx
"use client";

import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { Search, X, Check, Inbox } from "lucide-react";

// ── Types ──────────────────────────────────────────────────────────────────
type Competency = {
  id: string;
  name: string;
  difficulty: string;
  tags: string[] | null;
};

type CompetencyRaw = Omit<Competency, "tags"> & {
  tags: string[] | null; // UUID[] from DB
};

type TagRow = {
  id: string;
  name: string;
};

type QuestionOption = {
  label: string;
  body: string;
  is_correct: boolean;
};

type QuestionProposal = {
  id: string;
  competency_id: string;
  question_text: string;
  options: QuestionOption[];
  media: QuestionMediaItem[];
  suggested_by: string | null;
};

type Profile = { id: string };
type QuestionMediaItem = {
  id: string;
  stage_id: string | null;
  file_name: string;
  file_type: string | null;
  mime_type: string | null;
  file_size: number | null;
  storage_path: string;
  signed_url: string | null;
};

function cls(...xs: Array<string | false | null | undefined>) {
  return xs.filter(Boolean).join(" ");
}

function diffColor(d: string): string {
  const v = d.toLowerCase();
  if (v === "beginner") return "var(--ok)";
  if (v === "intermediate") return "var(--warn)";
  if (v === "expert") return "var(--err)";
  return "var(--border)";
}

// ── Component ──────────────────────────────────────────────────────────────
export default function ReviewQueueQuestions() {
  const [me, setMe] = useState<Profile | null>(null);
  const [competencies, setCompetencies] = useState<Competency[]>([]);
  const [questions, setQuestions] = useState<QuestionProposal[]>([]);
  const [myVotes, setMyVotes] = useState<Record<string, boolean>>({});
  const [voteCounts, setVoteCounts] = useState<
    Record<
      string,
      { forCount: number; againstCount: number; total: number }
    >
  >({});
  const [suggestedByNames, setSuggestedByNames] = useState<
    Record<string, string>
  >({});
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [query, setQuery] = useState("");

  // ── Data load ────────────────────────────────────────────────────────────
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        setLoading(true);
        setErr(null);

        const { data: u } = await supabase.auth.getUser();
        const uid = u.user?.id ?? null;
        if (uid && !cancelled) setMe({ id: uid });

        // Active competencies (for context)
        const [{ data: comps, error: cErr }, { data: tagsData, error: tagsErr }] =
          await Promise.all([
            supabase.from("competencies").select("id, name, difficulty, tags"),
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

        // Question proposals
        const { data: qs, error: qErr } = await supabase
          .from("competency_questions_stage")
          .select("id, competency_id, question_text, suggested_by")
          .order("created_at", { ascending: false });
        if (qErr) throw qErr;
        const qRows = (qs ?? []) as Omit<QuestionProposal, "options">[];

        // Options for each question
        const ids = qRows.map((q) => q.id);
        const optByQ: Record<string, QuestionOption[]> = {};
        const mediaByQ: Record<string, QuestionMediaItem[]> = {};
        if (ids.length > 0) {
          const { data: opts, error: oErr } = await supabase
            .from("competency_question_options_stage")
            .select("stage_question_id, option_text, is_correct, sort_order")
            .in("stage_question_id", ids)
            .order("sort_order", { ascending: true });
          if (oErr) throw oErr;
          (opts ?? []).forEach(
            (o: {
              stage_question_id: string;
              option_text: string;
              is_correct: boolean;
            }) => {
              if (!optByQ[o.stage_question_id]) optByQ[o.stage_question_id] = [];
              const arr = optByQ[o.stage_question_id];
              arr.push({
                label: String.fromCharCode("A".charCodeAt(0) + arr.length),
                body: o.option_text,
                is_correct: o.is_correct,
              });
            }
          );

          const { data: mediaRows, error: mErr } = await supabase
            .from("question_media")
            .select(
              "id, stage_id, file_name, file_type, mime_type, file_size, storage_path, created_at"
            )
            .in("stage_id", ids)
            .order("created_at", { ascending: true });
          if (mErr) throw mErr;

          const mediaWithUrls = await Promise.all(
            ((mediaRows ?? []) as Omit<QuestionMediaItem, "signed_url">[]).map(
              async (m) => {
                const { data: signed } = await supabase.storage
                  .from("question-media")
                  .createSignedUrl(m.storage_path, 60 * 60);
                return {
                  ...m,
                  signed_url: signed?.signedUrl ?? null,
                } as QuestionMediaItem;
              }
            )
          );

          mediaWithUrls.forEach((m) => {
            if (!m.stage_id) return;
            if (!mediaByQ[m.stage_id]) mediaByQ[m.stage_id] = [];
            mediaByQ[m.stage_id].push(m);
          });
        }

        // Proposer names
        const proposerIds = Array.from(
          new Set(qRows.map((r) => r.suggested_by).filter(Boolean) as string[])
        );
        const namesMap: Record<string, string> = {};
        if (proposerIds.length > 0) {
          const { data: profs } = await supabase
            .from("profiles")
            .select("id, full_name, first_name, last_name, email")
            .in("id", proposerIds);
          (profs ?? []).forEach(
            (p: {
              id: string;
              full_name: string | null;
              first_name: string | null;
              last_name: string | null;
              email: string | null;
            }) => {
              namesMap[p.id] =
                p.full_name ||
                [p.first_name, p.last_name].filter(Boolean).join(" ") ||
                p.email ||
                "Committee member";
            }
          );
        }

        // Question votes
        const { data: qVotes, error: qvErr } = await supabase
          .from("committee_question_votes")
          .select("stage_question_id, voter_id, vote");
        if (qvErr) throw qvErr;

        const myQMap: Record<string, boolean> = {};
        const qCounts: Record<
          string,
          { forCount: number; againstCount: number; total: number }
        > = {};
        (qVotes ?? []).forEach(
          (v: {
            stage_question_id: string;
            voter_id: string;
            vote: boolean;
          }) => {
            if (!qCounts[v.stage_question_id])
              qCounts[v.stage_question_id] = {
                forCount: 0,
                againstCount: 0,
                total: 0,
              };
            qCounts[v.stage_question_id].total++;
            if (v.vote) qCounts[v.stage_question_id].forCount++;
            else qCounts[v.stage_question_id].againstCount++;
            if (v.voter_id === uid) myQMap[v.stage_question_id] = v.vote;
          }
        );

        if (!cancelled) {
          setCompetencies(compsResolved);
          setQuestions(
            qRows.map((q) => ({
              ...q,
              options: optByQ[q.id] ?? [],
              media: mediaByQ[q.id] ?? [],
            }))
          );
          setSuggestedByNames(namesMap);
          setMyVotes(myQMap);
          setVoteCounts(qCounts);
        }
      } catch (e) {
        if (!cancelled) setErr(e instanceof Error ? e.message : String(e));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const compById = useMemo(() => {
    const m: Record<string, Competency> = {};
    competencies.forEach((c) => (m[c.id] = c));
    return m;
  }, [competencies]);

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return questions;
    return questions.filter((q) => {
      const comp = compById[q.competency_id];
      const hay = [q.question_text, comp?.name ?? "", comp?.difficulty ?? ""]
        .join(" ")
        .toLowerCase();
      return hay.includes(needle);
    });
  }, [questions, compById, query]);

  // ── Vote handler ─────────────────────────────────────────────────────────
  async function handleVote(stageQId: string, value: boolean) {
    if (!me?.id) return;
    try {
      const { error } = await supabase.rpc("committee_vote_on_question", {
        p_stage_question_id: stageQId,
        p_vote: value,
      });
      if (error) throw error;

      // Re-fetch after vote (question may auto-merge and disappear)
      const { data: qVotes } = await supabase
        .from("committee_question_votes")
        .select("stage_question_id, voter_id, vote");

      const myQMap: Record<string, boolean> = {};
      const qCounts: Record<
        string,
        { forCount: number; againstCount: number; total: number }
      > = {};
      (qVotes ?? []).forEach(
        (v: {
          stage_question_id: string;
          voter_id: string;
          vote: boolean;
        }) => {
          if (!qCounts[v.stage_question_id])
            qCounts[v.stage_question_id] = {
              forCount: 0,
              againstCount: 0,
              total: 0,
            };
          qCounts[v.stage_question_id].total++;
          if (v.vote) qCounts[v.stage_question_id].forCount++;
          else qCounts[v.stage_question_id].againstCount++;
          if (v.voter_id === me.id) myQMap[v.stage_question_id] = v.vote;
        }
      );

      // Also remove approved question from list if gone
      const { data: remaining } = await supabase
        .from("competency_questions_stage")
        .select("id");
      const remainingIds = new Set(
        (remaining ?? []).map((r: { id: string }) => r.id)
      );

      setQuestions((prev) => prev.filter((q) => remainingIds.has(q.id)));
      setMyVotes(myQMap);
      setVoteCounts(qCounts);
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    }
  }

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div className="px-8 py-8 max-w-6xl mx-auto">
      {/* Header */}
      <div className="mb-6">
        <h1
          className="text-3xl font-bold tracking-tight text-[var(--foreground)]"
          style={{ fontFamily: "var(--font-heading, sans-serif)" }}
        >
          Review Queue — Questions
        </h1>
        <div className="accent-underline mt-3" />
        <p className="mt-3 text-sm text-[var(--muted)]">
          {loading
            ? "Loading…"
            : `${questions.length} proposed questions pending review`}
        </p>
      </div>

      {err && (
        <div className="mb-4 rounded-2xl border border-[color:var(--err)]/30 bg-[color:var(--err)]/10 px-4 py-3 text-sm text-[var(--err)]">
          {err}
        </div>
      )}

      {/* Search */}
      <div className="mb-5 flex items-center gap-2">
        <div className="relative flex-1 max-w-sm">
          <Search
            size={15}
            className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--muted)]"
          />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search question or competency…"
            className="w-full pl-9 pr-3 py-2 rounded-full border border-[var(--border)] bg-[var(--field)] text-sm appearance-none outline-none focus:outline-none focus:ring-0 focus:border-[color:var(--accent)] focus:shadow-[0_0_0_3px_color-mix(in_oklab,var(--accent)_18%,transparent)] transition-all"
          />
        </div>
        {query && (
          <button
            onClick={() => setQuery("")}
            className="flex items-center gap-1.5 px-3 py-2 rounded-full border border-[var(--border)] bg-[var(--surface)] text-xs text-[var(--foreground)] transition-all hover:border-[color:var(--accent)] hover:text-[var(--accent)]"
          >
            <X size={12} />
            Clear
          </button>
        )}
      </div>

      {/* Content */}
      {loading ? (
        <div className="text-sm text-[var(--muted)]">Loading…</div>
      ) : filtered.length === 0 ? (
        <div className="flex flex-col items-center gap-3 py-20 text-[var(--muted)]">
          <Inbox size={40} className="opacity-30" />
          <p className="text-sm">No proposed questions pending review.</p>
        </div>
      ) : (
        <div className="space-y-4">
          {filtered.map((q, idx) => {
            const comp = compById[q.competency_id];
            const vote = myVotes[q.id];
            const counts = voteCounts[q.id] ?? {
              forCount: 0,
              againstCount: 0,
              total: 0,
            };
            const pct =
              counts.total > 0
                ? Math.round((counts.forCount / counts.total) * 100)
                : 0;

            return (
              <div
                key={q.id}
                className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-5"
              >
                {/* Question header */}
                <div className="flex items-start justify-between gap-4 mb-4">
                  <div className="flex items-start gap-3 flex-1 min-w-0">
                    <span className="w-6 h-6 rounded-full grid place-items-center text-[10px] font-bold text-[var(--muted)] bg-[var(--field)] border border-[var(--border)] flex-shrink-0 mt-0.5">
                      {idx + 1}
                    </span>
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-[var(--foreground)] leading-snug">
                        {q.question_text}
                      </p>
                      {comp && (
                        <div className="flex flex-wrap items-center gap-2 mt-2">
                          <span className="text-xs text-[var(--muted)]">
                            {comp.name}
                          </span>
                          <span
                            className="inline-block rounded-full px-2 py-0.5 text-[10px] font-semibold"
                            style={{
                              background: diffColor(comp.difficulty),
                              color: "#000",
                            }}
                          >
                            {comp.difficulty}
                          </span>
                          {(comp.tags ?? []).slice(0, 3).map((t) => (
                            <span
                              key={t}
                              className="rounded-full border border-[var(--border)] bg-[var(--field)] px-2 py-0.5 text-[10px] text-[var(--muted)]"
                            >
                              #{t}
                            </span>
                          ))}
                        </div>
                      )}
                      <p className="text-xs text-[var(--muted)] mt-1">
                        Proposed by{" "}
                        {q.suggested_by
                          ? (suggestedByNames[q.suggested_by] ??
                            "Committee member")
                          : "Committee member"}
                      </p>
                    </div>
                  </div>

                  {/* Vote buttons */}
                  <div className="flex items-center gap-2 flex-shrink-0">
                    <button
                      onClick={() => handleVote(q.id, true)}
                      title="Approve"
                      className={cls(
                        "h-9 w-9 rounded-full grid place-items-center transition-all",
                        vote === true
                          ? "bg-[var(--ok)] text-white shadow-[0_2px_8px_color-mix(in_oklab,var(--ok)_40%,transparent)]"
                          : "bg-[color:var(--ok)]/20 text-[var(--ok)] hover:bg-[var(--ok)] hover:text-white"
                      )}
                    >
                      <Check size={15} />
                    </button>
                    <button
                      onClick={() => handleVote(q.id, false)}
                      title="Reject"
                      className={cls(
                        "h-9 w-9 rounded-full grid place-items-center transition-all",
                        vote === false
                          ? "bg-[var(--err)] text-white shadow-[0_2px_8px_color-mix(in_oklab,var(--err)_40%,transparent)]"
                          : "bg-[color:var(--err)]/20 text-[var(--err)] hover:bg-[var(--err)] hover:text-white"
                      )}
                    >
                      <X size={15} />
                    </button>
                  </div>
                </div>

                {/* Answer options */}
                {q.options.length > 0 && (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mb-4">
                    {q.options.map((o) => (
                      <div
                        key={`${q.id}_${o.label}`}
                        className={cls(
                          "flex items-start gap-2.5 rounded-xl border px-3 py-2 text-xs",
                          o.is_correct
                            ? "border-[color:var(--ok)]/50 bg-[color:var(--ok)]/10 text-[var(--foreground)]"
                            : "border-[var(--border)] bg-[var(--field)] text-[var(--muted)]"
                        )}
                      >
                        <span
                          className={cls(
                            "font-bold flex-shrink-0",
                            o.is_correct
                              ? "text-[var(--ok)]"
                              : "text-[var(--muted)]"
                          )}
                        >
                          {o.label}
                        </span>
                        <span className="leading-snug">{o.body}</span>
                        {o.is_correct && (
                          <span className="ml-auto flex-shrink-0 text-[var(--ok)] font-semibold">
                            ✓
                          </span>
                        )}
                      </div>
                    ))}
                  </div>
                )}

                {/* Attachments */}
                {q.media.length > 0 && (
                  <div className="mb-4">
                    <p className="text-xs font-semibold text-[var(--muted)] mb-2">
                      Attachments
                    </p>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                      {q.media.map((m) => {
                        const isImage = (m.mime_type ?? "").startsWith("image/");
                        const isVideo = (m.mime_type ?? "").startsWith("video/");
                        return (
                          <div
                            key={m.id}
                            className="rounded-xl border border-[var(--border)] bg-[var(--field)] p-2"
                          >
                            {m.signed_url && isImage && (
                              <a
                                href={m.signed_url}
                                target="_blank"
                                rel="noreferrer"
                                className="block"
                              >
                                {/* eslint-disable-next-line @next/next/no-img-element */}
                                <img
                                  src={m.signed_url}
                                  alt={m.file_name}
                                  className="w-full h-36 object-cover rounded-lg border border-[var(--border)] bg-black/5"
                                />
                              </a>
                            )}
                            {m.signed_url && isVideo && (
                              <video
                                src={m.signed_url}
                                controls
                                preload="metadata"
                                className="w-full h-36 rounded-lg border border-[var(--border)] bg-black"
                              />
                            )}
                            {(!m.signed_url || (!isImage && !isVideo)) && (
                              <div className="h-36 rounded-lg border border-[var(--border)] bg-[var(--surface)] grid place-items-center text-xs text-[var(--muted)] px-3 text-center">
                                Preview unavailable
                              </div>
                            )}
                            <p className="mt-2 text-xs text-[var(--foreground)] truncate">
                              {m.file_name}
                            </p>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* Vote tally */}
                <div className="flex items-center gap-4 border-t border-[var(--border)] pt-3">
                  <div className="flex items-center gap-3 text-xs">
                    <span style={{ color: "var(--ok)" }}>
                      ↑ {counts.forCount} for
                    </span>
                    <span style={{ color: "var(--err)" }}>
                      ↓ {counts.againstCount} against
                    </span>
                    <span className="text-[var(--muted)]">
                      ({counts.total} total)
                    </span>
                  </div>
                  <div className="flex items-center gap-2 flex-1">
                    <div className="h-1.5 flex-1 rounded-full bg-[var(--border)] overflow-hidden">
                      <div
                        className="h-full rounded-full transition-all"
                        style={{
                          width: `${pct}%`,
                          background:
                            pct >= 50 ? "var(--ok)" : "var(--err)",
                        }}
                      />
                    </div>
                    <span className="text-[10px] text-[var(--muted)] whitespace-nowrap">
                      {pct}% · auto-merges at ≥ 50% &amp; ≥ 4 votes
                    </span>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
