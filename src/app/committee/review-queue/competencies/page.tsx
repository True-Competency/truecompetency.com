// src/app/committee/review-queue/competencies/page.tsx
"use client";

import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { Search, X, Check, Inbox } from "lucide-react";

// ── Types ──────────────────────────────────────────────────────────────────
type SuggestedCompetency = {
  id: string;
  name: string;
  difficulty: string;
  tags: string[] | null;
  justification: string | null;
  suggested_by: string | null;
};

type SuggestedCompetencyRaw = Omit<SuggestedCompetency, "tags"> & {
  tags: string[] | null; // UUID[] from DB
};

type TagRow = {
  id: string;
  name: string;
};

type Profile = {
  id: string;
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
export default function ReviewQueueCompetencies() {
  const [me, setMe] = useState<Profile | null>(null);
  const [suggested, setSuggested] = useState<SuggestedCompetency[]>([]);
  const [myVotes, setMyVotes] = useState<Record<string, boolean>>({});
  const [voteCounts, setVoteCounts] = useState<
    Record<string, { forCount: number; againstCount: number }>
  >({});
  const [suggestedByNames, setSuggestedByNames] = useState<
    Record<string, string>
  >({});
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [tagFilters, setTagFilters] = useState<string[]>([]);
  const [tagOptions, setTagOptions] = useState<string[]>([]);

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

        // Suggested competencies
        const [{ data: sug, error: sErr }, { data: tagsData, error: tagsErr }] =
          await Promise.all([
            supabase
              .from("competencies_stage")
              .select("id, name, difficulty, tags, justification, suggested_by")
              .order("name", { ascending: true }),
            supabase.from("tags").select("id, name").order("name", { ascending: true }),
          ]);
        if (sErr) throw sErr;
        if (tagsErr) throw tagsErr;
        const tagNameById = new Map(
          ((tagsData ?? []) as TagRow[]).map((t) => [t.id, t.name]),
        );
        const sugRows = ((sug ?? []) as SuggestedCompetencyRaw[]).map((r) => ({
          ...r,
          tags: (r.tags ?? [])
            .map((id) => tagNameById.get(id))
            .filter((v): v is string => Boolean(v)),
        }));

        // Proposer names
        const proposerIds = Array.from(
          new Set(sugRows.map((r) => r.suggested_by).filter(Boolean) as string[])
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

        // All committee votes
        const { data: votes, error: vErr } = await supabase
          .from("committee_votes")
          .select("stage_id, voter_id, vote");
        if (vErr) throw vErr;

        const myMap: Record<string, boolean> = {};
        const countsMap: Record<
          string,
          { forCount: number; againstCount: number }
        > = {};
        (votes ?? []).forEach(
          (v: { stage_id: string; voter_id: string; vote: boolean }) => {
            if (!countsMap[v.stage_id])
              countsMap[v.stage_id] = { forCount: 0, againstCount: 0 };
            if (v.vote) countsMap[v.stage_id].forCount++;
            else countsMap[v.stage_id].againstCount++;
            if (v.voter_id === uid) myMap[v.stage_id] = v.vote;
          }
        );

        if (!cancelled) {
          setSuggested(sugRows);
          setTagOptions(((tagsData ?? []) as TagRow[]).map((t) => t.name));
          setSuggestedByNames(namesMap);
          setMyVotes(myMap);
          setVoteCounts(countsMap);
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

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return suggested.filter((r) => {
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
    });
  }, [suggested, query, tagFilters]);

  // ── Vote handler ─────────────────────────────────────────────────────────
  async function handleVote(stageId: string, value: boolean) {
    if (!me?.id) return;
    try {
      const { error } = await supabase.from("committee_votes").upsert(
        { stage_id: stageId, voter_id: me.id, vote: value },
        { onConflict: "stage_id,voter_id" }
      );
      if (error) throw error;

      setMyVotes((prev) => ({ ...prev, [stageId]: value }));
      setVoteCounts((prev) => {
        const existing = prev[stageId] ?? { forCount: 0, againstCount: 0 };
        const prevVote = myVotes[stageId];
        let { forCount, againstCount } = existing;
        if (prevVote === true) forCount = Math.max(0, forCount - 1);
        else if (prevVote === false) againstCount = Math.max(0, againstCount - 1);
        if (value) forCount++;
        else againstCount++;
        return { ...prev, [stageId]: { forCount, againstCount } };
      });
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
          Review Queue — Competencies
        </h1>
        <div className="accent-underline mt-3" />
        <p className="mt-3 text-sm text-[var(--muted)]">
          {loading
            ? "Loading…"
            : `${suggested.length} proposed competencies pending review`}
        </p>
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
              className="flex items-center gap-1.5 px-3 py-2 rounded-full border border-[var(--border)] bg-[var(--surface)] text-xs text-[var(--foreground)] transition-all hover:border-[color:var(--accent)] hover:text-[var(--accent)]"
            >
              <X size={12} />
              Clear
            </button>
          )}
        </div>
        {tagOptions.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {tagOptions.map((t) => (
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
                    : "border-[var(--border)] bg-[var(--field)] text-[var(--foreground)] hover:border-[color:var(--accent)] hover:text-[var(--accent)]"
                )}
              >
                #{t}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Table */}
      {loading ? (
        <div className="text-sm text-[var(--muted)]">Loading…</div>
      ) : filtered.length === 0 ? (
        <div className="flex flex-col items-center gap-3 py-20 text-[var(--muted)]">
          <Inbox size={40} className="opacity-30" />
          <p className="text-sm">No proposed competencies pending review.</p>
        </div>
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
                <th className="px-4 py-3 text-left text-xs font-semibold text-[var(--muted)] max-w-[260px]">
                  Justification
                </th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-[var(--muted)] w-36">
                  Proposed by
                </th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-[var(--muted)] w-28">
                  Your vote
                </th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-[var(--muted)] w-36">
                  Tally
                </th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((c, idx) => {
                const vote = myVotes[c.id];
                const counts = voteCounts[c.id] ?? {
                  forCount: 0,
                  againstCount: 0,
                };
                const total = counts.forCount + counts.againstCount;
                const pct =
                  total > 0
                    ? Math.round((counts.forCount / total) * 100)
                    : 0;

                return (
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
                        style={{
                          background: diffColor(c.difficulty),
                          color: "#000",
                        }}
                      >
                        {c.difficulty}
                      </span>
                    </td>
                    <td className="px-4 py-3 align-middle">
                      {c.tags && c.tags.length > 0 ? (
                        <div className="flex flex-wrap gap-1 max-w-[200px]">
                          {c.tags.map((t) => (
                            <span
                              key={t}
                              className="rounded-full border border-[var(--border)] bg-[var(--field)] px-2 py-0.5 text-[11px] text-[var(--muted)]"
                            >
                              #{t}
                            </span>
                          ))}
                        </div>
                      ) : (
                        <span className="text-xs text-[var(--muted)]">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3 align-middle text-xs text-[var(--muted)] max-w-[260px]">
                      {c.justification ?? "—"}
                    </td>
                    <td className="px-4 py-3 align-middle text-xs text-[var(--muted)] whitespace-nowrap">
                      {c.suggested_by
                        ? (suggestedByNames[c.suggested_by] ??
                          "Committee member")
                        : "Committee member"}
                    </td>
                    <td className="px-4 py-3 align-middle">
                      <div className="flex gap-2">
                        <button
                          onClick={() => handleVote(c.id, true)}
                          title="Approve"
                          className={cls(
                            "h-8 w-8 rounded-full grid place-items-center transition-all",
                            vote === true
                              ? "bg-[var(--ok)] text-white shadow-[0_2px_6px_color-mix(in_oklab,var(--ok)_40%,transparent)]"
                              : "bg-[color:var(--ok)]/20 text-[var(--ok)] hover:bg-[var(--ok)] hover:text-white"
                          )}
                        >
                          <Check size={14} />
                        </button>
                        <button
                          onClick={() => handleVote(c.id, false)}
                          title="Reject"
                          className={cls(
                            "h-8 w-8 rounded-full grid place-items-center transition-all",
                            vote === false
                              ? "bg-[var(--err)] text-white shadow-[0_2px_6px_color-mix(in_oklab,var(--err)_40%,transparent)]"
                              : "bg-[color:var(--err)]/20 text-[var(--err)] hover:bg-[var(--err)] hover:text-white"
                          )}
                        >
                          <X size={14} />
                        </button>
                      </div>
                    </td>
                    <td className="px-4 py-3 align-middle">
                      <div className="flex flex-col gap-1">
                        <div className="flex items-center gap-2 text-xs">
                          <span style={{ color: "var(--ok)" }}>
                            ↑ {counts.forCount}
                          </span>
                          <span style={{ color: "var(--err)" }}>
                            ↓ {counts.againstCount}
                          </span>
                        </div>
                        <div className="h-1 w-20 rounded-full bg-[var(--border)] overflow-hidden">
                          <div
                            className="h-full rounded-full transition-all"
                            style={{
                              width: `${pct}%`,
                              background:
                                pct >= 50 ? "var(--ok)" : "var(--err)",
                            }}
                          />
                        </div>
                        <span className="text-[10px] text-[var(--muted)]">
                          {pct}% approval
                        </span>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
