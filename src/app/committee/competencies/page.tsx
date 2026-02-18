// src/app/committee/competencies/page.tsx
"use client";

import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { Plus, Search, X } from "lucide-react";

// ── Types ──────────────────────────────────────────────────────────────────
type Competency = {
  id: string;
  name: string;
  difficulty: string;
  tags: string[] | null;
  created_at: string;
};

type QuestionOption = {
  label: string;
  body: string;
  is_correct: boolean;
};

const DIFF_ORDER = ["Beginner", "Intermediate", "Expert"] as const;

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
export default function CompetenciesPage() {
  const [rows, setRows] = useState<Competency[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  // Filters
  const [query, setQuery] = useState("");
  const [tagFilters, setTagFilters] = useState<string[]>([]);

  // Propose Competency modal
  const [proposeOpen, setProposeOpen] = useState(false);
  const [propName, setPropName] = useState("");
  const [propDifficulty, setPropDifficulty] =
    useState<(typeof DIFF_ORDER)[number]>("Intermediate");
  const [propTags, setPropTags] = useState<string[]>([]);
  const [propReason, setPropReason] = useState("");
  const [submitting, setSubmitting] = useState(false);

  // Propose Question modal
  const [qModalOpen, setQModalOpen] = useState(false);
  const [qCompId, setQCompId] = useState("");
  const [qBody, setQBody] = useState("");
  const [qOptions, setQOptions] = useState<QuestionOption[]>([
    { label: "A", body: "", is_correct: true },
    { label: "B", body: "", is_correct: false },
    { label: "C", body: "", is_correct: false },
    { label: "D", body: "", is_correct: false },
  ]);
  const [submittingQ, setSubmittingQ] = useState(false);

  // ── Data load ────────────────────────────────────────────────────────────
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        setLoading(true);
        setErr(null);

        const { data, error } = await supabase
          .from("competencies")
          .select("id, name, difficulty, tags, created_at")
          .order("created_at", { ascending: false });
        if (error) throw error;
        if (!cancelled) setRows((data ?? []) as Competency[]);
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

  // ── Derived ──────────────────────────────────────────────────────────────
  const allTags = useMemo(() => {
    const set = new Set<string>();
    rows.forEach((r) => (r.tags ?? []).forEach((t) => set.add(t)));
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [rows]);

  const list = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return rows
      .filter((r) => {
        const inSearch =
          !needle ||
          r.name.toLowerCase().includes(needle) ||
          r.difficulty.toLowerCase().includes(needle) ||
          (r.tags ?? []).some((t) => t.toLowerCase().includes(needle));
        const tagsOk =
          tagFilters.length === 0 ||
          tagFilters.every((t) =>
            (r.tags ?? []).map((x) => x.toLowerCase()).includes(t.toLowerCase())
          );
        return inSearch && tagsOk;
      })
      .sort((a, b) => {
        const order = (d: string) => {
          const v = d.toLowerCase();
          if (v === "beginner") return 0;
          if (v === "intermediate") return 1;
          if (v === "expert") return 2;
          return 3;
        };
        const da = order(a.difficulty),
          db = order(b.difficulty);
        if (da !== db) return da - db;
        return a.name.localeCompare(b.name);
      });
  }, [rows, query, tagFilters]);

  // ── Helpers ──────────────────────────────────────────────────────────────
  function showToast(msg: string) {
    setToast(msg);
    setTimeout(() => setToast(null), 2400);
  }

  function resetQForm(preCompId = "") {
    setQCompId(preCompId);
    setQBody("");
    setQOptions([
      { label: "A", body: "", is_correct: true },
      { label: "B", body: "", is_correct: false },
      { label: "C", body: "", is_correct: false },
      { label: "D", body: "", is_correct: false },
    ]);
  }

  // ── Handlers ─────────────────────────────────────────────────────────────
  async function handlePropose() {
    try {
      setSubmitting(true);
      setErr(null);
      const nameTrim = propName.trim();
      if (!nameTrim) throw new Error("Please enter a competency name.");
      const { data: u2 } = await supabase.auth.getUser();
      const uid = u2.user?.id;
      if (!uid) throw new Error("Please sign in again.");
      const { error } = await supabase.from("competencies_stage").insert({
        name: nameTrim,
        difficulty: propDifficulty,
        tags: propTags,
        justification: propReason.trim() || null,
        suggested_by: uid,
      });
      if (error) throw error;
      setProposeOpen(false);
      setPropName("");
      setPropTags([]);
      setPropDifficulty("Intermediate");
      setPropReason("");
      showToast("Competency proposal submitted.");
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setSubmitting(false);
    }
  }

  async function handleProposeQuestion() {
    try {
      setSubmittingQ(true);
      setErr(null);
      const compId = qCompId.trim();
      if (!compId) throw new Error("Please choose a competency.");
      const prompt = qBody.trim();
      if (!prompt) throw new Error("Please enter the question text.");
      const cleaned = qOptions.map((o) => ({ ...o, body: o.body.trim() }));
      if (cleaned.some((o) => !o.body))
        throw new Error("Please fill all four answer options.");
      const { data: u2 } = await supabase.auth.getUser();
      const uid = u2.user?.id;
      if (!uid) throw new Error("Please sign in again.");
      const correctIdx = cleaned.findIndex((o) => o.is_correct);
      const { data: newId, error: rpcErr } = await supabase.rpc(
        "committee_propose_question",
        {
          p_competency_id: compId,
          p_question_text: prompt,
          p_options: cleaned.map((o) => o.body),
          p_correct_index: (correctIdx >= 0 ? correctIdx : 0) + 1,
        }
      );
      if (rpcErr) throw rpcErr;
      if (!newId) throw new Error("Failed to create question proposal.");
      setQModalOpen(false);
      resetQForm();
      showToast("Question proposal submitted.");
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setSubmittingQ(false);
    }
  }

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div className="px-8 py-8 max-w-6xl mx-auto">
      {/* Header */}
      <div className="mb-6 flex items-start justify-between gap-4">
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
              : `${rows.length} active competencies`}
          </p>
        </div>

        <div className="flex gap-2 flex-shrink-0 mt-1">
          <button
            onClick={() => setProposeOpen(true)}
            className="flex items-center gap-2 px-4 py-2.5 rounded-full text-sm font-semibold text-white transition-all hover:opacity-90 hover:shadow-[0_0_12px_color-mix(in_oklab,var(--accent)_40%,transparent)]"
            style={{ background: "var(--accent)" }}
          >
            <Plus size={15} />
            Propose Competency
          </button>
          <button
            onClick={() => {
              resetQForm();
              setQModalOpen(true);
            }}
            className="flex items-center gap-2 px-4 py-2.5 rounded-full text-sm font-semibold border border-[var(--border)] bg-[var(--surface)] text-[var(--foreground)] transition-all hover:border-[color:var(--accent)] hover:text-[var(--accent)]"
          >
            <Plus size={15} />
            Propose Question
          </button>
        </div>
      </div>

      {err && (
        <div className="mb-4 rounded-2xl border border-[color:var(--err)]/30 bg-[color:var(--err)]/10 px-4 py-3 text-sm text-[var(--err)]">
          {err}
        </div>
      )}

      {/* Filters */}
      <div className="mb-5">
        <div className="flex items-center gap-2 mb-3">
          <div className="relative flex-1">
            <Search
              size={15}
              className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--muted)]"
            />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search name, difficulty, tag…"
              className="w-full pl-9 pr-3 py-2 rounded-full border border-[var(--border)] bg-[var(--field)] text-sm outline-none focus:border-[color:var(--accent)] transition-colors"
            />
          </div>
          {(query || tagFilters.length > 0) && (
            <button
              onClick={() => {
                setQuery("");
                setTagFilters([]);
              }}
              className="flex items-center gap-1.5 px-3 py-2 rounded-full border border-[var(--border)] bg-[var(--surface)] text-xs text-[var(--muted)] hover:text-[var(--foreground)] transition-colors"
            >
              <X size={12} />
              Clear
            </button>
          )}
        </div>

        {allTags.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {allTags.map((t) => (
              <button
                key={t}
                onClick={() =>
                  setTagFilters((prev) =>
                    prev.includes(t)
                      ? prev.filter((x) => x !== t)
                      : [...prev, t]
                  )
                }
                className={cls(
                  "rounded-full px-2.5 py-0.5 text-[11px] border transition-all",
                  tagFilters.includes(t)
                    ? "border-[color:var(--accent)] bg-[color:var(--accent)]/15 text-[var(--accent)]"
                    : "border-[var(--border)] bg-[var(--field)] text-[var(--muted)] hover:text-[var(--foreground)]"
                )}
              >
                {t}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Table */}
      {loading ? (
        <div className="text-sm text-[var(--muted)]">Loading…</div>
      ) : (
        <div className="overflow-x-auto rounded-2xl border border-[var(--border)] bg-[var(--surface)]">
          <table className="min-w-full text-sm">
            <thead>
              <tr className="border-b border-[var(--border)] bg-[var(--field)]/40">
                <th className="px-4 py-3 text-left text-xs font-semibold text-[var(--muted)] w-12">
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
                  Added
                </th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-[var(--muted)] w-44">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody>
              {list.length === 0 && (
                <tr>
                  <td
                    colSpan={6}
                    className="px-4 py-8 text-center text-sm text-[var(--muted)]"
                  >
                    No competencies match your filters.
                  </td>
                </tr>
              )}
              {list.map((c, idx) => (
                <tr
                  key={c.id}
                  className="border-t border-[var(--border)] hover:bg-[color:var(--accent)]/3 transition-colors"
                >
                  <td className="px-4 py-3 align-middle text-xs text-[var(--muted)]">
                    {idx + 1}
                  </td>
                  <td className="px-4 py-3 align-middle font-medium text-[var(--foreground)]">
                    {c.name}
                  </td>
                  <td className="px-4 py-3 align-middle">
                    <span
                      className="inline-block rounded-full px-2.5 py-0.5 text-[11px] font-semibold"
                      style={{ background: diffColor(c.difficulty), color: "#000" }}
                    >
                      {c.difficulty}
                    </span>
                  </td>
                  <td className="px-4 py-3 align-middle">
                    {c.tags && c.tags.length > 0 ? (
                      <div className="flex flex-wrap gap-1.5 max-w-xs">
                        {c.tags.map((t) => (
                          <span
                            key={t}
                            className="rounded-full border border-[var(--border)] bg-[var(--field)] px-2 py-0.5 text-[11px] text-[var(--muted)]"
                          >
                            {t}
                          </span>
                        ))}
                      </div>
                    ) : (
                      <span className="text-xs text-[var(--muted)]">—</span>
                    )}
                  </td>
                  <td className="px-4 py-3 align-middle text-xs text-[var(--muted)] whitespace-nowrap">
                    {new Date(c.created_at).toLocaleDateString()}
                  </td>
                  <td className="px-4 py-3 align-middle">
                    <button
                      onClick={() => {
                        resetQForm(c.id);
                        setQModalOpen(true);
                      }}
                      className="rounded-full border border-[var(--border)] bg-[var(--field)] px-3 py-1.5 text-xs text-[var(--foreground)] hover:border-[color:var(--accent)] hover:text-[var(--accent)] transition-all"
                    >
                      Propose question
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* ── Propose Competency Modal ── */}
      {proposeOpen && (
        <div
          role="dialog"
          aria-modal="true"
          onClick={() => setProposeOpen(false)}
          className="fixed inset-0 z-50 grid place-items-center bg-black/50 px-4"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-lg max-h-[90vh] overflow-y-auto rounded-2xl border border-[var(--border)] bg-[var(--surface)] shadow-2xl p-6"
          >
            <div className="mb-4 flex items-center justify-between border-b border-[var(--border)] pb-4">
              <h3 className="text-base font-semibold text-[var(--foreground)]">
                Propose a new competency
              </h3>
              <button
                onClick={() => setProposeOpen(false)}
                className="h-8 w-8 grid place-items-center rounded-full border border-[var(--border)] bg-[var(--field)] text-[var(--muted)] hover:text-[var(--foreground)] transition-colors"
              >
                <X size={14} />
              </button>
            </div>
            <div className="grid gap-4">
              <label className="grid gap-1 text-sm">
                <span className="text-[var(--muted)]">Name *</span>
                <input
                  value={propName}
                  onChange={(e) => setPropName(e.target.value)}
                  placeholder="e.g., IVUS interpretation for calcified lesions"
                  className="rounded-2xl border border-[var(--border)] bg-[var(--field)] px-3 py-2 text-sm outline-none focus:border-[color:var(--accent)] transition-colors w-full"
                />
              </label>

              <label className="grid gap-1 text-sm">
                <span className="text-[var(--muted)]">Difficulty *</span>
                <select
                  value={propDifficulty}
                  onChange={(e) =>
                    setPropDifficulty(
                      e.target.value as (typeof DIFF_ORDER)[number]
                    )
                  }
                  className="rounded-2xl border border-[var(--border)] bg-[var(--field)] px-3 py-2 text-sm outline-none w-full"
                >
                  {DIFF_ORDER.map((d) => (
                    <option key={d} value={d}>
                      {d}
                    </option>
                  ))}
                </select>
              </label>

              {allTags.length > 0 && (
                <div className="grid gap-2 text-sm">
                  <span className="text-[var(--muted)]">Tags</span>
                  <div className="flex flex-wrap gap-1.5">
                    {allTags.map((t) => (
                      <button
                        key={t}
                        type="button"
                        onClick={() =>
                          setPropTags((prev) =>
                            prev.includes(t)
                              ? prev.filter((x) => x !== t)
                              : [...prev, t]
                          )
                        }
                        className={cls(
                          "rounded-full px-2.5 py-0.5 text-[11px] border transition-all",
                          propTags.includes(t)
                            ? "border-[color:var(--accent)] bg-[color:var(--accent)]/15 text-[var(--accent)]"
                            : "border-[var(--border)] bg-[var(--field)] text-[var(--muted)] hover:text-[var(--foreground)]"
                        )}
                      >
                        {t}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              <label className="grid gap-1 text-sm">
                <span className="text-[var(--muted)]">Justification</span>
                <textarea
                  value={propReason}
                  onChange={(e) => setPropReason(e.target.value)}
                  placeholder="Why should this competency be added?"
                  rows={3}
                  className="rounded-2xl border border-[var(--border)] bg-[var(--field)] px-3 py-2 text-sm outline-none resize-vertical min-h-[72px] w-full"
                />
              </label>

              <div className="flex justify-end gap-2 mt-1">
                <button
                  onClick={() => setProposeOpen(false)}
                  className="rounded-full border border-[var(--border)] bg-[var(--surface)] px-4 py-2 text-sm text-[var(--muted)] hover:text-[var(--foreground)] transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={handlePropose}
                  disabled={submitting}
                  className="rounded-full px-4 py-2 text-sm font-semibold text-white disabled:opacity-60 transition-all hover:opacity-90"
                  style={{ background: "var(--accent)" }}
                >
                  {submitting ? "Submitting…" : "Submit proposal"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── Propose Question Modal ── */}
      {qModalOpen && (
        <div
          role="dialog"
          aria-modal="true"
          onClick={() => setQModalOpen(false)}
          className="fixed inset-0 z-50 grid place-items-center bg-black/50 px-4"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-[640px] max-h-[90vh] overflow-y-auto rounded-2xl border border-[var(--border)] bg-[var(--surface)] shadow-2xl p-6"
          >
            <div className="mb-4 flex items-center justify-between border-b border-[var(--border)] pb-4">
              <h3 className="text-base font-semibold text-[var(--foreground)]">
                Propose a test question
              </h3>
              <button
                onClick={() => setQModalOpen(false)}
                className="h-8 w-8 grid place-items-center rounded-full border border-[var(--border)] bg-[var(--field)] text-[var(--muted)] hover:text-[var(--foreground)] transition-colors"
              >
                <X size={14} />
              </button>
            </div>
            <div className="grid gap-4">
              <label className="grid gap-1 text-sm">
                <span className="text-[var(--muted)]">Competency *</span>
                <select
                  value={qCompId}
                  onChange={(e) => setQCompId(e.target.value)}
                  className="rounded-2xl border border-[var(--border)] bg-[var(--field)] px-3 py-2 text-sm outline-none w-full"
                >
                  <option value="">Select a competency…</option>
                  {rows
                    .slice()
                    .sort((a, b) => a.name.localeCompare(b.name))
                    .map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name} ({c.difficulty})
                      </option>
                    ))}
                </select>
              </label>

              <label className="grid gap-1 text-sm">
                <span className="text-[var(--muted)]">Question *</span>
                <textarea
                  value={qBody}
                  onChange={(e) => setQBody(e.target.value)}
                  placeholder="e.g., Which IVUS finding best indicates concentric calcification?"
                  rows={3}
                  className="rounded-2xl border border-[var(--border)] bg-[var(--field)] px-3 py-2 text-sm outline-none resize-vertical min-h-[72px] w-full"
                />
              </label>

              <div className="grid gap-2 text-sm">
                <span className="text-[var(--muted)]">Answer options *</span>
                <div className="space-y-2">
                  {qOptions.map((o, idx) => (
                    <div
                      key={o.label}
                      className="rounded-2xl border border-[var(--border)] bg-[var(--field)] p-3 grid gap-2"
                    >
                      <label className="flex items-center gap-2 text-xs text-[var(--muted)]">
                        <input
                          type="radio"
                          name="correct-option"
                          checked={o.is_correct}
                          onChange={() =>
                            setQOptions((prev) =>
                              prev.map((x, i) => ({
                                ...x,
                                is_correct: i === idx,
                              }))
                            )
                          }
                        />
                        <span className="font-semibold text-[var(--foreground)]">
                          {o.label}
                        </span>
                        <span>— mark as correct</span>
                      </label>
                      <input
                        value={o.body}
                        onChange={(e) =>
                          setQOptions((prev) =>
                            prev.map((x, i) =>
                              i === idx ? { ...x, body: e.target.value } : x
                            )
                          )
                        }
                        placeholder="Answer text"
                        className="rounded-xl border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-sm outline-none w-full"
                      />
                    </div>
                  ))}
                </div>
              </div>

              <div className="flex justify-end gap-2 mt-1">
                <button
                  onClick={() => setQModalOpen(false)}
                  className="rounded-full border border-[var(--border)] bg-[var(--surface)] px-4 py-2 text-sm text-[var(--muted)] hover:text-[var(--foreground)] transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={handleProposeQuestion}
                  disabled={submittingQ}
                  className="rounded-full px-4 py-2 text-sm font-semibold text-white disabled:opacity-60 transition-all hover:opacity-90"
                  style={{ background: "var(--accent)" }}
                >
                  {submittingQ ? "Submitting…" : "Submit question"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Toast */}
      {toast && (
        <div className="fixed inset-x-0 bottom-6 z-50 grid place-items-center pointer-events-none">
          <div className="rounded-full border border-[var(--border)] bg-[var(--surface)] px-4 py-2.5 text-sm shadow-lg">
            {toast}
          </div>
        </div>
      )}
    </div>
  );
}
