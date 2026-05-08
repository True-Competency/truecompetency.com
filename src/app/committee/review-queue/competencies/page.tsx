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
  subgoal_id: string | null;
};

type SuggestedCompetencyRaw = Omit<SuggestedCompetency, "tags"> & {
  tags: string[] | null; // UUID[] from DB
};

type SubgoalRow = {
  id: string;
  code: string;
  name: string;
  domain_id: string;
};

type DomainRow = { id: string; code: string; name: string };

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
  const [subgoalLabels, setSubgoalLabels] = useState<
    Record<string, { code: string; name: string; domainCode: string }>
  >({});
  const [committeeSize, setCommitteeSize] = useState<number>(0);
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
        const [
          { data: sug, error: sErr },
          { data: tagsData, error: tagsErr },
          { data: subgoalsData, error: sgErr },
          { data: domainsData, error: dErr },
          { count: committeeCount, error: cmErr },
        ] = await Promise.all([
          supabase
            .from("competencies_stage")
            .select(
              "id, name, difficulty, tags, justification, suggested_by, subgoal_id",
            )
            .order("name", { ascending: true }),
          supabase
            .from("tags")
            .select("id, name")
            .order("name", { ascending: true }),
          supabase.from("subgoals").select("id, code, name, domain_id"),
          supabase.from("domains").select("id, code, name"),
          supabase
            .from("profiles")
            .select("id", { count: "exact", head: true })
            .eq("role", "committee"),
        ]);
        if (sErr) throw sErr;
        if (tagsErr) throw tagsErr;
        if (sgErr) throw sgErr;
        if (dErr) throw dErr;
        if (cmErr) throw cmErr;

        const domainCodeById = new Map(
          ((domainsData ?? []) as DomainRow[]).map((d) => [d.id, d.code]),
        );
        const subgoalLabelMap: Record<
          string,
          { code: string; name: string; domainCode: string }
        > = {};
        ((subgoalsData ?? []) as SubgoalRow[]).forEach((s) => {
          subgoalLabelMap[s.id] = {
            code: s.code,
            name: s.name,
            domainCode: domainCodeById.get(s.domain_id) ?? "",
          };
        });
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
          setSubgoalLabels(subgoalLabelMap);
          setCommitteeSize(committeeCount ?? 0);
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
              className="w-full pl-9 pr-3 py-2 rounded-full border border-[var(--border)] bg-[var(--field)] text-sm appearance-none outline-none focus:outline-none focus:ring-0 focus:border-[color:var(--accent)] focus:shadow-[0_0_0_3px_color-mix(in_oklab,var(--accent)_18%,transparent)] transition-all"
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

      {/* Proposal list */}
      {loading ? (
        <div className="text-sm text-[var(--muted)]">Loading…</div>
      ) : filtered.length === 0 ? (
        <div className="flex flex-col items-center gap-3 py-20 text-[var(--muted)]">
          <Inbox size={40} className="opacity-30" />
          <p className="text-sm">No proposed competencies pending review.</p>
        </div>
      ) : (
        <div className="flex flex-col gap-4">
          {filtered.map((c) => {
            const vote = myVotes[c.id];
            const counts = voteCounts[c.id] ?? { forCount: 0, againstCount: 0 };
            const total = counts.forCount + counts.againstCount;
            const yesPct = total > 0 ? (counts.forCount / total) * 100 : 0;
            const noPct = total > 0 ? (counts.againstCount / total) * 100 : 0;
            const proposerName = c.suggested_by
              ? (suggestedByNames[c.suggested_by] ?? "Committee member")
              : "Committee member";
            const sg = c.subgoal_id ? subgoalLabels[c.subgoal_id] : null;

            return (
              <article
                key={c.id}
                className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] overflow-hidden transition-all hover:border-[color:var(--accent)]/40"
              >
                <div className="flex flex-col md:flex-row">
                  {/* Left 70% — info */}
                  <div className="flex-1 md:basis-[70%] p-5 min-w-0 flex flex-col">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0 flex-1">
                        <h3 className="text-base font-semibold text-[var(--foreground)] leading-snug">
                          {c.name}
                        </h3>
                        {sg ? (
                          <div className="mt-1.5 inline-flex items-center gap-1 rounded-full border border-[color:var(--accent)]/30 bg-[color:var(--accent)]/8 px-2 py-0.5 text-[10px] font-semibold text-[var(--accent)]">
                            <span>{sg.code}</span>
                            <span className="font-normal text-[var(--muted)]">
                              {sg.name}
                            </span>
                          </div>
                        ) : (
                          <div className="mt-1.5 inline-flex items-center rounded-full border border-[color:var(--warn)]/40 bg-[color:var(--warn)]/10 px-2 py-0.5 text-[10px] font-semibold text-[var(--warn)]">
                            No subgoal
                          </div>
                        )}
                      </div>
                      <span
                        className="flex-shrink-0 inline-block rounded-full px-2.5 py-0.5 text-[11px] font-semibold"
                        style={{
                          background: diffColor(c.difficulty),
                          color: "#000",
                        }}
                      >
                        {c.difficulty}
                      </span>
                    </div>

                    {c.tags && c.tags.length > 0 && (
                      <div className="mt-3 flex flex-wrap gap-1.5">
                        {c.tags.map((t) => (
                          <span
                            key={t}
                            className="rounded-full border border-[var(--border)] bg-[var(--field)] px-2 py-0.5 text-[10px] text-[var(--muted)]"
                          >
                            #{t}
                          </span>
                        ))}
                      </div>
                    )}

                    {c.justification && (
                      <p className="mt-3 text-sm text-[var(--muted)] italic leading-snug">
                        “{c.justification}”
                      </p>
                    )}

                    <p className="mt-auto pt-3 text-xs text-[var(--muted)]">
                      Proposed by{" "}
                      <span className="font-semibold text-[var(--foreground)]">
                        {proposerName}
                      </span>
                    </p>
                  </div>

                  {/* Separator */}
                  <div className="w-full h-px md:w-px md:h-auto bg-[var(--border)] flex-shrink-0" />

                  {/* Right 30% — vote panel */}
                  <div className="md:basis-[30%] flex-shrink-0 p-5 flex flex-col gap-3 bg-[var(--field)]/30">
                    <p className="text-xs text-[var(--muted)]">
                      <span className="font-semibold text-[var(--foreground)]">
                        {total}
                      </span>{" "}
                      of{" "}
                      <span className="font-semibold text-[var(--foreground)]">
                        {committeeSize}
                      </span>{" "}
                      committee member{committeeSize === 1 ? "" : "s"} voted
                    </p>

                    <div
                      className="h-3 w-full overflow-hidden rounded-full bg-[var(--border)]/40"
                      role="progressbar"
                      aria-valuemin={0}
                      aria-valuemax={100}
                      aria-valuenow={Math.round(yesPct)}
                      aria-label={`${counts.forCount} yes votes, ${counts.againstCount} no votes`}
                    >
                      {total > 0 && (
                        <div className="flex h-full w-full">
                          <div
                            className="h-full bg-[var(--ok)]"
                            style={{ width: `${yesPct}%` }}
                          />
                          <div
                            className="h-full bg-[var(--err)]"
                            style={{ width: `${noPct}%` }}
                          />
                        </div>
                      )}
                    </div>

                    <div className="flex flex-col gap-2">
                      <div className="flex items-center justify-between gap-3">
                        <button
                          onClick={() => handleVote(c.id, true)}
                          aria-label="Approve"
                          className={cls(
                            "inline-flex items-center gap-2 rounded-full border px-5 py-2 text-sm font-semibold transition-all",
                            vote === true
                              ? "border-[color:var(--ok)] bg-[color:var(--ok)]/15 text-[var(--ok)]"
                              : "border-[var(--border)] bg-[var(--surface)] text-[var(--foreground)] hover:border-[color:var(--ok)]",
                          )}
                        >
                          <Check size={14} className="text-[color:var(--ok)]" />
                          Approve
                        </button>
                        <span className="text-sm whitespace-nowrap text-[var(--ok)] font-semibold">
                          {counts.forCount} yes
                        </span>
                      </div>
                      <div className="flex items-center justify-between gap-3">
                        <button
                          onClick={() => handleVote(c.id, false)}
                          aria-label="Reject"
                          className={cls(
                            "inline-flex items-center gap-2 rounded-full border px-5 py-2 text-sm font-semibold transition-all",
                            vote === false
                              ? "border-[color:var(--err)] bg-[color:var(--err)]/15 text-[var(--err)]"
                              : "border-[var(--border)] bg-[var(--surface)] text-[var(--foreground)] hover:border-[color:var(--err)]",
                          )}
                        >
                          <X size={14} className="text-[color:var(--err)]" />
                          Reject
                        </button>
                        <span className="text-sm whitespace-nowrap text-[var(--err)] font-semibold">
                          {counts.againstCount} no
                        </span>
                      </div>
                    </div>
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      )}
    </div>
  );
}
