// src/app/committee/page.tsx
"use client";

import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import Link from "next/link";
import {
  ShieldCheck,
  ClipboardList,
  AlertTriangle,
  ArrowRight,
  Plus,
  BookOpen,
  Users,
  FileText,
  Vote,
} from "lucide-react";

type Profile = {
  id: string;
  full_name: string | null;
  first_name: string | null;
  last_name: string | null;
};

type RecentProposal = {
  id: string;
  name: string;
  difficulty: string;
  created_at: string;
};

type RecentVote = {
  id: string;
  voter_name: string;
  vote: boolean; // true = for, false = against
  competency_name: string;
  created_at: string;
};

type DashboardStats = {
  totalCompetencies: number;
  coveredCompetencies: number;
  emptyCompetencies: number;
  pendingCompetencies: number;
  pendingQuestions: number;
  totalMembers: number;
};

// Difficulty color maps to your existing CSS variables
const DIFFICULTY_COLOR: Record<string, string> = {
  Beginner: "var(--ok)",
  Intermediate: "var(--warn)",
  Expert: "var(--err)",
};

export default function CommitteeDashboard() {
  const [profile, setProfile] = useState<Profile | null>(null);
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [recentProposals, setRecentProposals] = useState<RecentProposal[]>([]);
  const [recentVotes, setRecentVotes] = useState<RecentVote[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        setLoading(true);
        setErr(null);

        // ── 1. Current user profile ──────────────────────────────────────
        const { data: u } = await supabase.auth.getUser();
        if (u.user?.id) {
          const { data: prof } = await supabase
            .from("profiles")
            .select("id, full_name, first_name, last_name")
            .eq("id", u.user.id)
            .maybeSingle<Profile>();
          if (prof && !cancelled) setProfile(prof);
        }

        // ── 2. All competency IDs ─────────────────────────────────────────
        const { data: comps, error: cErr } = await supabase
          .from("competencies")
          .select("id");
        if (cErr) throw cErr;
        const allIds = (comps ?? []).map((c: { id: string }) => c.id);
        const totalCompetencies = allIds.length;

        // ── 3. Question coverage per competency ───────────────────────────
        let coveredCount = 0;
        let withQuestionsCount = 0;
        if (allIds.length > 0) {
          const { data: qRows, error: qErr } = await supabase
            .from("competency_questions")
            .select("competency_id");
          if (qErr) throw qErr;

          const counts: Record<string, number> = {};
          (qRows ?? []).forEach((q: { competency_id: string }) => {
            counts[q.competency_id] = (counts[q.competency_id] ?? 0) + 1;
          });
          coveredCount = Object.values(counts).filter((n) => n >= 1).length;
          withQuestionsCount = Object.keys(counts).filter((id) =>
            allIds.includes(id),
          ).length;
        }

        // ── 4. Pending proposals + questions + member count ───────────────
        const [
          { count: pendingComps },
          { count: pendingQs },
          { count: memberCount },
        ] = await Promise.all([
          supabase
            .from("competencies_stage")
            .select("id", { count: "exact", head: true }),
          supabase
            .from("competency_questions_stage")
            .select("id", { count: "exact", head: true }),
          supabase
            .from("profiles")
            .select("id", { count: "exact", head: true })
            .eq("role", "committee"),
        ]);

        // ── 5. Recent proposals (last 5) ──────────────────────────────────
        const { data: proposals, error: pErr } = await supabase
          .from("competencies_stage")
          .select("id, name, difficulty, created_at")
          .order("created_at", { ascending: false })
          .limit(5);
        if (pErr) throw pErr;

        // ── 6. Recent votes with voter name ───────────────────────────────
        // Joins committee_votes → profiles for voter name
        // and committee_votes → competencies_stage for competency name
        const { data: votes, error: vErr } = await supabase
          .from("committee_votes")
          .select(
            `
            id,
            vote,
            created_at,
            profiles!voter_id ( full_name, first_name, last_name ),
            competencies_stage ( name )
          `,
          )
          .order("created_at", { ascending: false })
          .limit(5);
        if (vErr) throw vErr;

        if (!cancelled) {
          setStats({
            totalCompetencies,
            coveredCompetencies: coveredCount,
            emptyCompetencies: totalCompetencies - withQuestionsCount,
            pendingCompetencies: pendingComps ?? 0,
            pendingQuestions: pendingQs ?? 0,
            totalMembers: memberCount ?? 0,
          });

          setRecentProposals(
            (proposals ?? []).map((p: RecentProposal) => ({
              id: p.id,
              name: p.name,
              difficulty: p.difficulty,
              created_at: p.created_at,
            })),
          );

          setRecentVotes(
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            (votes ?? []).map((v: any) => {
              const p = v.profiles;
              const voterName =
                p?.full_name ||
                [p?.first_name, p?.last_name].filter(Boolean).join(" ") ||
                "Unknown";
              return {
                id: v.id,
                voter_name: voterName,
                vote: v.vote,
                competency_name: v.competencies_stage?.name ?? "Unknown",
                created_at: v.created_at,
              };
            }),
          );
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

  const welcome = useMemo(() => {
    if (!profile) return "Welcome Back";
    const name =
      profile.full_name ||
      [profile.first_name, profile.last_name].filter(Boolean).join(" ");
    return name ? `Welcome Back, Dr. ${name}` : "Welcome Back";
  }, [profile]);

  const coveragePct =
    stats && stats.totalCompetencies > 0
      ? Math.round((stats.coveredCompetencies / stats.totalCompetencies) * 100)
      : 0;

  const pendingTotal = stats
    ? stats.pendingCompetencies + stats.pendingQuestions
    : 0;

  // Relative time helper — "2 hours ago", "3 days ago"
  function timeAgo(iso: string): string {
    const diff = Date.now() - new Date(iso).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 60) return `${mins}m ago`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return `${hrs}h ago`;
    return `${Math.floor(hrs / 24)}d ago`;
  }

  return (
    <div className="px-8 py-8 max-w-6xl mx-auto">
      {/* ── Welcome header ───────────────────────────────────────────────── */}
      <div className="mb-8">
        <h1
          className="text-3xl font-bold tracking-tight text-[var(--foreground)]"
          style={{ fontFamily: "var(--font-heading, sans-serif)" }}
        >
          {loading ? "Loading…" : welcome}
        </h1>
        <div className="accent-underline mt-3" />
        <p className="mt-3 text-sm text-[var(--muted)]">
          Here&apos;s an overview of your committee&apos;s activity.
        </p>
      </div>

      {err && (
        <div className="mb-6 rounded-2xl border border-[color:var(--err)]/30 bg-[color:var(--err)]/10 px-4 py-3 text-sm text-[color:var(--err)]">
          {err}
        </div>
      )}

      {/* ── Bento grid ───────────────────────────────────────────────────── */}
      {/*
        Layout (6-col grid):
        Row 1: Coverage(3) | Members(1) | Pending(2)
        Row 2: Empty(2)    | Proposals(2) tall | Votes(2) tall
      */}
      <div className="grid grid-cols-6 gap-4 mb-10">
        {/* ① Coverage — spans 3 cols, 1 row */}
        <div className="col-span-6 sm:col-span-3 card p-5 flex flex-col gap-3">
          <div className="flex items-center justify-between">
            <div
              className="w-10 h-10 rounded-full grid place-items-center flex-shrink-0"
              style={{
                background: "color-mix(in oklab, var(--ok) 18%, transparent)",
              }}
            >
              <ShieldCheck size={19} style={{ color: "var(--ok)" }} />
            </div>
            <span className="text-3xl font-bold text-[var(--foreground)]">
              {loading ? "—" : `${coveragePct}%`}
            </span>
          </div>
          <div>
            <div className="text-sm font-semibold text-[var(--foreground)]">
              Competency Coverage
            </div>
            <div className="text-xs text-[var(--muted)] mt-0.5 leading-snug">
              {loading
                ? "Computing…"
                : `${stats?.coveredCompetencies ?? 0} of ${stats?.totalCompetencies ?? 0} competencies have at least one question`}
            </div>
          </div>
          <div className="h-1.5 rounded-full bg-[var(--border)] overflow-hidden">
            <div
              className="h-full rounded-full transition-all duration-700"
              style={{ width: `${coveragePct}%`, background: "var(--ok)" }}
            />
          </div>
          <Link
            href="/committee/competencies"
            className="flex items-center gap-1.5 text-xs text-[var(--muted)] hover:text-[var(--foreground)] transition-colors group mt-auto"
          >
            <span>View competencies</span>
            <ArrowRight
              size={12}
              className="group-hover:translate-x-0.5 transition-transform"
            />
          </Link>
        </div>

        {/* ② Members count — spans 1 col */}
        <div className="col-span-3 sm:col-span-1 card p-5 flex flex-col justify-between gap-3">
          <div
            className="w-10 h-10 rounded-full grid place-items-center flex-shrink-0"
            style={{
              background: "color-mix(in oklab, var(--accent) 18%, transparent)",
            }}
          >
            <Users size={19} style={{ color: "var(--accent)" }} />
          </div>
          <div>
            <div className="text-3xl font-bold text-[var(--foreground)]">
              {loading ? "—" : (stats?.totalMembers ?? 0)}
            </div>
            <div className="text-sm font-semibold text-[var(--foreground)] mt-0.5">
              Members
            </div>
            <div className="text-xs text-[var(--muted)] mt-0.5">
              Active committee members
            </div>
          </div>
          <Link
            href="/committee/members"
            className="flex items-center gap-1.5 text-xs text-[var(--muted)] hover:text-[var(--foreground)] transition-colors group mt-auto"
          >
            <span>View all</span>
            <ArrowRight
              size={12}
              className="group-hover:translate-x-0.5 transition-transform"
            />
          </Link>
        </div>

        {/* ③ Pending reviews — spans 2 cols */}
        <div className="col-span-3 sm:col-span-2 card p-5 flex flex-col gap-3">
          <div className="flex items-center justify-between">
            <div
              className="w-10 h-10 rounded-full grid place-items-center flex-shrink-0"
              style={{
                background: "color-mix(in oklab, var(--warn) 18%, transparent)",
              }}
            >
              <ClipboardList size={19} style={{ color: "var(--warn)" }} />
            </div>
            <span className="text-3xl font-bold text-[var(--foreground)]">
              {loading ? "—" : pendingTotal}
            </span>
          </div>
          <div>
            <div className="text-sm font-semibold text-[var(--foreground)]">
              Pending Reviews
            </div>
            <div className="text-xs text-[var(--muted)] mt-0.5 leading-snug">
              {loading
                ? "Computing…"
                : `${stats?.pendingCompetencies ?? 0} competencies · ${stats?.pendingQuestions ?? 0} questions`}
            </div>
          </div>
          <div className="flex flex-col gap-1 mt-auto">
            <Link
              href="/committee/review-queue/competencies"
              className="flex items-center gap-1.5 text-xs text-[var(--muted)] hover:text-[var(--foreground)] transition-colors group"
            >
              <span>Review competencies</span>
              <ArrowRight
                size={12}
                className="group-hover:translate-x-0.5 transition-transform"
              />
            </Link>
            <Link
              href="/committee/review-queue/questions"
              className="flex items-center gap-1.5 text-xs text-[var(--muted)] hover:text-[var(--foreground)] transition-colors group"
            >
              <span>Review questions</span>
              <ArrowRight
                size={12}
                className="group-hover:translate-x-0.5 transition-transform"
              />
            </Link>
          </div>
        </div>

        {/* ④ Without questions — spans 2 cols */}
        <div className="col-span-6 sm:col-span-2 card p-5 flex flex-col gap-3">
          <div className="flex items-center justify-between">
            <div
              className="w-10 h-10 rounded-full grid place-items-center flex-shrink-0"
              style={{
                background: "color-mix(in oklab, var(--err) 18%, transparent)",
              }}
            >
              <AlertTriangle size={19} style={{ color: "var(--err)" }} />
            </div>
            <span className="text-3xl font-bold text-[var(--foreground)]">
              {loading ? "—" : (stats?.emptyCompetencies ?? 0)}
            </span>
          </div>
          <div>
            <div className="text-sm font-semibold text-[var(--foreground)]">
              Without Questions
            </div>
            <div className="text-xs text-[var(--muted)] mt-0.5 leading-snug">
              {loading
                ? "Computing…"
                : `${stats?.emptyCompetencies ?? 0} competencies have no test questions yet`}
            </div>
          </div>
          <Link
            href="/committee/competencies"
            className="flex items-center gap-1.5 text-xs text-[var(--muted)] hover:text-[var(--foreground)] transition-colors group mt-auto"
          >
            <span>Add questions</span>
            <ArrowRight
              size={12}
              className="group-hover:translate-x-0.5 transition-transform"
            />
          </Link>
        </div>

        {/* ⑤ Recent Proposals — spans 2 cols, tall */}
        <div className="col-span-6 sm:col-span-2 card p-5 flex flex-col gap-4">
          <div className="flex items-center gap-2">
            <div
              className="w-8 h-8 rounded-full grid place-items-center flex-shrink-0"
              style={{
                background:
                  "color-mix(in oklab, var(--accent) 18%, transparent)",
              }}
            >
              <FileText size={15} style={{ color: "var(--accent)" }} />
            </div>
            <span className="text-sm font-semibold text-[var(--foreground)]">
              Recent Proposals
            </span>
          </div>

          <div className="flex flex-col gap-2 flex-1">
            {loading ? (
              <div className="text-xs text-[var(--muted)]">Loading…</div>
            ) : recentProposals.length === 0 ? (
              <div className="text-xs text-[var(--muted)]">
                No proposals yet
              </div>
            ) : (
              recentProposals.map((p) => (
                <div
                  key={p.id}
                  className="flex items-start justify-between gap-2 py-2 border-b border-[var(--border)] last:border-0"
                >
                  <div className="flex flex-col gap-0.5 min-w-0">
                    {/* Competency name — truncate if long */}
                    <span className="text-xs font-medium text-[var(--foreground)] truncate">
                      {p.name}
                    </span>
                    <span className="text-[11px] text-[var(--muted)]">
                      {timeAgo(p.created_at)}
                    </span>
                  </div>
                  {/* Difficulty badge using your existing color system */}
                  <span
                    className="text-[10px] font-semibold px-2 py-0.5 rounded-full flex-shrink-0"
                    style={{
                      color: DIFFICULTY_COLOR[p.difficulty] ?? "var(--muted)",
                      background: `color-mix(in oklab, ${DIFFICULTY_COLOR[p.difficulty] ?? "var(--muted)"} 15%, transparent)`,
                    }}
                  >
                    {p.difficulty}
                  </span>
                </div>
              ))
            )}
          </div>

          <Link
            href="/committee/review-queue/competencies"
            className="flex items-center gap-1.5 text-xs text-[var(--muted)] hover:text-[var(--foreground)] transition-colors group mt-auto"
          >
            <span>View all proposals</span>
            <ArrowRight
              size={12}
              className="group-hover:translate-x-0.5 transition-transform"
            />
          </Link>
        </div>

        {/* ⑥ Vote Activity — spans 2 cols, tall */}
        <div className="col-span-6 sm:col-span-2 card p-5 flex flex-col gap-4">
          <div className="flex items-center gap-2">
            <div
              className="w-8 h-8 rounded-full grid place-items-center flex-shrink-0"
              style={{
                background: "color-mix(in oklab, var(--ok) 18%, transparent)",
              }}
            >
              <Vote size={15} style={{ color: "var(--ok)" }} />
            </div>
            <span className="text-sm font-semibold text-[var(--foreground)]">
              Vote Activity
            </span>
          </div>

          <div className="flex flex-col gap-2 flex-1">
            {loading ? (
              <div className="text-xs text-[var(--muted)]">Loading…</div>
            ) : recentVotes.length === 0 ? (
              <div className="text-xs text-[var(--muted)]">No votes yet</div>
            ) : (
              recentVotes.map((v) => (
                <div
                  key={v.id}
                  className="flex items-start justify-between gap-2 py-2 border-b border-[var(--border)] last:border-0"
                >
                  <div className="flex flex-col gap-0.5 min-w-0">
                    {/* Voter name */}
                    <span className="text-xs font-medium text-[var(--foreground)] truncate">
                      Dr. {v.voter_name}
                    </span>
                    {/* What they voted on */}
                    <span className="text-[11px] text-[var(--muted)] truncate">
                      {v.competency_name}
                    </span>
                    <span className="text-[11px] text-[var(--muted)]">
                      {timeAgo(v.created_at)}
                    </span>
                  </div>
                  {/* Vote result badge */}
                  <span
                    className="text-[10px] font-semibold px-2 py-0.5 rounded-full flex-shrink-0"
                    style={{
                      color: v.vote ? "var(--ok)" : "var(--err)",
                      background: v.vote
                        ? "color-mix(in oklab, var(--ok) 15%, transparent)"
                        : "color-mix(in oklab, var(--err) 15%, transparent)",
                    }}
                  >
                    {v.vote ? "For" : "Against"}
                  </span>
                </div>
              ))
            )}
          </div>

          <Link
            href="/committee/review-queue/competencies"
            className="flex items-center gap-1.5 text-xs text-[var(--muted)] hover:text-[var(--foreground)] transition-colors group mt-auto"
          >
            <span>View review queue</span>
            <ArrowRight
              size={12}
              className="group-hover:translate-x-0.5 transition-transform"
            />
          </Link>
        </div>
      </div>

      {/* ── Quick actions ────────────────────────────────────────────────── */}
      <div>
        <h2 className="text-xs font-bold uppercase tracking-widest text-[var(--muted)] mb-4">
          Quick Actions
        </h2>
        <div className="flex flex-wrap gap-3">
          <Link
            href="/committee/competencies"
            className="flex items-center gap-2 px-5 py-2.5 rounded-full text-sm font-semibold text-white transition-all hover:opacity-90 hover:shadow-[0_0_14px_color-mix(in_oklab,var(--accent)_40%,transparent)]"
            style={{ background: "var(--accent)" }}
          >
            <Plus size={15} />
            Propose Competency
          </Link>
          <Link
            href="/committee/competencies"
            className="flex items-center gap-2 px-5 py-2.5 rounded-full text-sm font-semibold border border-[var(--border)] bg-[var(--surface)] text-[var(--foreground)] transition-all hover:border-[color:var(--accent)] hover:text-[var(--accent)]"
          >
            <Plus size={15} />
            Propose Question
          </Link>
          <Link
            href="/committee/review-queue/competencies"
            className="flex items-center gap-2 px-5 py-2.5 rounded-full text-sm font-semibold border border-[var(--border)] bg-[var(--surface)] text-[var(--foreground)] transition-all hover:border-[color:var(--accent)] hover:text-[var(--accent)]"
          >
            <ClipboardList size={15} />
            Review Queue
          </Link>
          <Link
            href="/committee/members"
            className="flex items-center gap-2 px-5 py-2.5 rounded-full text-sm font-semibold border border-[var(--border)] bg-[var(--surface)] text-[var(--foreground)] transition-all hover:border-[color:var(--accent)] hover:text-[var(--accent)]"
          >
            <BookOpen size={15} />
            View Members
          </Link>
        </div>
      </div>
    </div>
  );
}
