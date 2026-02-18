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
} from "lucide-react";

type Profile = {
  id: string;
  full_name: string | null;
  first_name: string | null;
  last_name: string | null;
};

type DashboardStats = {
  totalCompetencies: number;
  coveredCompetencies: number; // ≥ 3 questions
  emptyCompetencies: number;   // 0 questions
  pendingCompetencies: number;
  pendingQuestions: number;
};

export default function CommitteeDashboard() {
  const [profile, setProfile] = useState<Profile | null>(null);
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        setLoading(true);
        setErr(null);

        // 1. Current user profile
        const { data: u } = await supabase.auth.getUser();
        if (u.user?.id) {
          const { data: prof } = await supabase
            .from("profiles")
            .select("id, full_name, first_name, last_name")
            .eq("id", u.user.id)
            .maybeSingle<Profile>();
          if (prof && !cancelled) setProfile(prof);
        }

        // 2. All competency IDs
        const { data: comps, error: cErr } = await supabase
          .from("competencies")
          .select("id");
        if (cErr) throw cErr;
        const allIds = (comps ?? []).map((c: { id: string }) => c.id);
        const totalCompetencies = allIds.length;

        // 3. Question counts per active competency
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
          coveredCount = Object.values(counts).filter((n) => n >= 3).length;
          withQuestionsCount = Object.keys(counts).filter((id) =>
            allIds.includes(id)
          ).length;
        }

        // 4. Pending proposals (count only)
        const [{ count: pendingComps }, { count: pendingQs }] =
          await Promise.all([
            supabase
              .from("competencies_stage")
              .select("id", { count: "exact", head: true }),
            supabase
              .from("competency_questions_stage")
              .select("id", { count: "exact", head: true }),
          ]);

        if (!cancelled) {
          setStats({
            totalCompetencies,
            coveredCompetencies: coveredCount,
            emptyCompetencies: totalCompetencies - withQuestionsCount,
            pendingCompetencies: pendingComps ?? 0,
            pendingQuestions: pendingQs ?? 0,
          });
        }
      } catch (e) {
        if (!cancelled)
          setErr(e instanceof Error ? e.message : String(e));
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

  return (
    <div className="px-8 py-8 max-w-5xl mx-auto">
      {/* ── Welcome header ── */}
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
        <div className="mb-6 rounded-2xl border border-[color:var(--err)]/30 bg-[color:var(--err)]/10 px-4 py-3 text-sm text-[var(--err)]">
          {err}
        </div>
      )}

      {/* ── Stat widgets ── */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-5 mb-10">
        {/* 1. Coverage */}
        <div className="card p-5 flex flex-col gap-3">
          <div className="flex items-center justify-between">
            <div
              className="w-10 h-10 rounded-full grid place-items-center flex-shrink-0"
              style={{
                background:
                  "color-mix(in oklab, var(--ok) 18%, transparent)",
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
                : `${stats?.coveredCompetencies ?? 0} of ${stats?.totalCompetencies ?? 0} competencies have ≥ 3 questions`}
            </div>
          </div>

          {/* Progress bar */}
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

        {/* 2. Pending Reviews */}
        <div className="card p-5 flex flex-col gap-3">
          <div className="flex items-center justify-between">
            <div
              className="w-10 h-10 rounded-full grid place-items-center flex-shrink-0"
              style={{
                background:
                  "color-mix(in oklab, var(--accent) 18%, transparent)",
              }}
            >
              <ClipboardList size={19} style={{ color: "var(--accent)" }} />
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
                : `${stats?.pendingCompetencies ?? 0} competencies · ${stats?.pendingQuestions ?? 0} questions awaiting review`}
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

        {/* 3. Empty competencies */}
        <div className="card p-5 flex flex-col gap-3">
          <div className="flex items-center justify-between">
            <div
              className="w-10 h-10 rounded-full grid place-items-center flex-shrink-0"
              style={{
                background:
                  "color-mix(in oklab, var(--warn) 18%, transparent)",
              }}
            >
              <AlertTriangle size={19} style={{ color: "var(--warn)" }} />
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
      </div>

      {/* ── Quick actions ── */}
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
