// src/app/committee/members/page.tsx
"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { Crown, Building2, Globe, BookOpen, HelpCircle, Vote } from "lucide-react";

// ── Types ──────────────────────────────────────────────────────────────────
type Member = {
  id: string;
  full_name: string | null;
  first_name: string | null;
  last_name: string | null;
  email: string | null;
  hospital: string | null;
  university: string | null;
  country_name: string | null;
  committee_role: string | null;
  proposed_competencies: number;
  proposed_questions: number;
  votes_cast: number;
};

// ── Avatar color ───────────────────────────────────────────────────────────
const AVATAR_COLORS = [
  "#5170ff", // accent
  "#7c3aed",
  "#0891b2",
  "#059669",
  "#dc2626",
  "#ea580c",
  "#0284c7",
  "#7e22ce",
];

function avatarColor(m: Member): string {
  if (m.committee_role === "chief_editor") return "var(--warn)";
  // stable color derived from the UUID's first char code
  const idx = m.id.charCodeAt(0) % AVATAR_COLORS.length;
  return AVATAR_COLORS[idx];
}

function getInitials(m: Member): string {
  const fn = m.first_name?.[0] ?? "";
  const ln = m.last_name?.[0] ?? "";
  return (fn + ln || m.full_name?.[0] || m.email?.[0] || "?").toUpperCase();
}

function getDisplayName(m: Member): string {
  return (
    m.full_name ||
    [m.first_name, m.last_name].filter(Boolean).join(" ") ||
    m.email ||
    "Committee Member"
  );
}

// ── Component ──────────────────────────────────────────────────────────────
export default function CommitteeMembers() {
  const [members, setMembers] = useState<Member[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        setLoading(true);
        setErr(null);

        // Fetch all committee member profiles
        const { data: profiles, error: pErr } = await supabase
          .from("profiles")
          .select(
            "id, full_name, first_name, last_name, email, hospital, university, country_name, committee_role"
          )
          .eq("role", "committee");
        if (pErr) throw pErr;

        const memberList = (profiles ?? []) as Omit<
          Member,
          "proposed_competencies" | "proposed_questions" | "votes_cast"
        >[];
        const memberIds = memberList.map((m) => m.id);

        if (memberIds.length === 0) {
          if (!cancelled) setMembers([]);
          return;
        }

        // Fetch stats in parallel
        const [compStage, qStage, compVotes, qVotes] = await Promise.all([
          supabase
            .from("competencies_stage")
            .select("suggested_by")
            .in("suggested_by", memberIds),
          supabase
            .from("competency_questions_stage")
            .select("suggested_by")
            .in("suggested_by", memberIds),
          supabase
            .from("committee_votes")
            .select("voter_id")
            .in("voter_id", memberIds),
          supabase
            .from("committee_question_votes")
            .select("voter_id")
            .in("voter_id", memberIds),
        ]);

        const compCounts: Record<string, number> = {};
        const qCounts: Record<string, number> = {};
        const voteCounts: Record<string, number> = {};

        (compStage.data ?? []).forEach(
          (r: { suggested_by: string }) =>
            (compCounts[r.suggested_by] =
              (compCounts[r.suggested_by] ?? 0) + 1)
        );
        (qStage.data ?? []).forEach(
          (r: { suggested_by: string }) =>
            (qCounts[r.suggested_by] = (qCounts[r.suggested_by] ?? 0) + 1)
        );
        (compVotes.data ?? []).forEach(
          (r: { voter_id: string }) =>
            (voteCounts[r.voter_id] = (voteCounts[r.voter_id] ?? 0) + 1)
        );
        (qVotes.data ?? []).forEach(
          (r: { voter_id: string }) =>
            (voteCounts[r.voter_id] = (voteCounts[r.voter_id] ?? 0) + 1)
        );

        const enriched: Member[] = memberList.map((m) => ({
          ...m,
          proposed_competencies: compCounts[m.id] ?? 0,
          proposed_questions: qCounts[m.id] ?? 0,
          votes_cast: voteCounts[m.id] ?? 0,
        }));

        // Sort: chair first, then alphabetically
        enriched.sort((a, b) => {
          if (
            a.committee_role === "chief_editor" &&
            b.committee_role !== "chief_editor"
          )
            return -1;
          if (
            b.committee_role === "chief_editor" &&
            a.committee_role !== "chief_editor"
          )
            return 1;
          return getDisplayName(a).localeCompare(getDisplayName(b));
        });

        if (!cancelled) setMembers(enriched);
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

  const chair = members.find((m) => m.committee_role === "chief_editor");
  const regularMembers = members.filter(
    (m) => m.committee_role !== "chief_editor"
  );

  return (
    <div className="px-8 py-8 max-w-5xl mx-auto">
      {/* Header */}
      <div className="mb-8">
        <h1
          className="text-3xl font-bold tracking-tight text-[var(--foreground)]"
          style={{ fontFamily: "var(--font-heading, sans-serif)" }}
        >
          Committee Members
        </h1>
        <div className="accent-underline mt-3" />
        <p className="mt-3 text-sm text-[var(--muted)]">
          {loading
            ? "Loading…"
            : `${members.length} member${members.length !== 1 ? "s" : ""} in the competency committee`}
        </p>
      </div>

      {err && (
        <div className="mb-6 rounded-2xl border border-[color:var(--err)]/30 bg-[color:var(--err)]/10 px-4 py-3 text-sm text-[var(--err)]">
          {err}
        </div>
      )}

      {loading && (
        <div className="text-sm text-[var(--muted)]">Loading members…</div>
      )}

      {/* ── Chair (featured) ── */}
      {!loading && chair && (
        <div className="mb-8">
          <h2 className="text-xs font-bold uppercase tracking-widest text-[var(--muted)] mb-4">
            Committee Chair
          </h2>
          <MemberCard member={chair} featured />
        </div>
      )}

      {/* ── Regular members ── */}
      {!loading && regularMembers.length > 0 && (
        <div>
          <h2 className="text-xs font-bold uppercase tracking-widest text-[var(--muted)] mb-4">
            Members
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
            {regularMembers.map((m) => (
              <MemberCard key={m.id} member={m} />
            ))}
          </div>
        </div>
      )}

      {!loading && members.length === 0 && (
        <div className="text-center text-[var(--muted)] py-16 text-sm">
          No committee members found.
        </div>
      )}
    </div>
  );
}

// ── Member card component ──────────────────────────────────────────────────
function MemberCard({
  member: m,
  featured = false,
}: {
  member: Member;
  featured?: boolean;
}) {
  const isChair = m.committee_role === "chief_editor";
  const color = avatarColor(m);
  const institution = m.hospital || m.university;

  return (
    <div
      className={`card p-5 flex flex-col gap-4 relative overflow-hidden ${
        featured ? "sm:flex-row sm:gap-6 sm:p-6" : ""
      }`}
    >
      {/* Chair crown badge */}
      {isChair && (
        <div
          className="absolute top-3 right-3 flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-bold"
          style={{
            background: "color-mix(in oklab, var(--warn) 20%, transparent)",
            color: "var(--warn)",
          }}
        >
          <Crown size={10} />
          Chair
        </div>
      )}

      {/* Avatar */}
      <div
        className={`rounded-full grid place-items-center text-white font-bold flex-shrink-0 shadow-lg ${
          featured ? "w-20 h-20 text-2xl" : "w-14 h-14 text-lg"
        }`}
        style={{ background: color }}
      >
        {getInitials(m)}
      </div>

      {/* Info */}
      <div className="flex-1 min-w-0">
        <div
          className={`font-semibold text-[var(--foreground)] ${
            featured ? "text-lg" : "text-sm"
          }`}
        >
          Dr. {getDisplayName(m)}
        </div>

        <div className="mt-1.5 space-y-1">
          {institution && (
            <div className="flex items-center gap-1.5 text-xs text-[var(--muted)]">
              <Building2 size={12} className="flex-shrink-0" />
              <span className="truncate">{institution}</span>
            </div>
          )}
          {m.country_name && (
            <div className="flex items-center gap-1.5 text-xs text-[var(--muted)]">
              <Globe size={12} className="flex-shrink-0" />
              <span>{m.country_name}</span>
            </div>
          )}
        </div>

        {/* Divider */}
        <div className="border-t border-[var(--border)] mt-3 pt-3">
          {/* Stats */}
          <div className="grid grid-cols-3 gap-2 text-center">
            <StatPill
              icon={<BookOpen size={11} />}
              value={m.proposed_competencies}
              label="Competencies"
            />
            <StatPill
              icon={<HelpCircle size={11} />}
              value={m.proposed_questions}
              label="Questions"
            />
            <StatPill
              icon={<Vote size={11} />}
              value={m.votes_cast}
              label="Votes"
            />
          </div>
        </div>
      </div>
    </div>
  );
}

function StatPill({
  icon,
  value,
  label,
}: {
  icon: React.ReactNode;
  value: number;
  label: string;
}) {
  return (
    <div className="flex flex-col items-center gap-0.5">
      <div className="flex items-center gap-1 text-[var(--muted)]">{icon}</div>
      <div className="text-sm font-bold text-[var(--foreground)]">{value}</div>
      <div className="text-[10px] text-[var(--muted)] leading-tight text-center">
        {label}
      </div>
    </div>
  );
}
