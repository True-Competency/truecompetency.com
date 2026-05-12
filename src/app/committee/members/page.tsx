// src/app/committee/members/page.tsx
"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import ReactCountryFlag from "react-country-flag";
import {
  Crown,
  Building2,
  Globe,
  BookOpen,
  Vote,
  MailPlus,
  Layers,
  Sparkles,
  Hospital,
  Plus,
  X,
  Clock,
  RefreshCw,
} from "lucide-react";

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
  country_code: string | null;
  avatar_path: string | null;
  committee_role: string | null;
  proposed_competencies: number;
  votes_cast: number;
};

type PendingInvite = {
  id: string;
  email: string;
  invited_at: string;
  hours_since_invite: number;
};

// ── Avatar color ───────────────────────────────────────────────────────────
const AVATAR_COLORS = [
  "#5170ff",
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

function formatTimeAgo(hours: number): string {
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  const weeks = Math.floor(days / 7);
  return `${weeks}w ago`;
}

// ── Component ──────────────────────────────────────────────────────────────
export default function CommitteeMembers() {
  const [members, setMembers] = useState<Member[]>([]);
  const [pendingInvites, setPendingInvites] = useState<PendingInvite[]>([]);
  const [loading, setLoading] = useState(true);
  const [pendingLoading, setPendingLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [isChairViewer, setIsChairViewer] = useState(false);
  const [inviteOpen, setInviteOpen] = useState(false);
  const [inviteMode, setInviteMode] = useState<"external" | "module">(
    "external",
  );
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteMsg, setInviteMsg] = useState<string | null>(null);
  const [inviteErr, setInviteErr] = useState<string | null>(null);
  const [inviting, setInviting] = useState(false);

  // Re-invite state
  const [reinvitingId, setReinvitingId] = useState<string | null>(null);
  const [reinviteMsg, setReinviteMsg] = useState<string | null>(null);
  const [reinviteErr, setReinviteErr] = useState<string | null>(null);

  // ── Fetch members ──────────────────────────────────────────────────────
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        setLoading(true);
        setErr(null);

        const { data: profiles, error: pErr } = await supabase
          .from("profiles")
          .select(
            "id, full_name, first_name, last_name, email, hospital, university, country_name, country_code, avatar_path, committee_role",
          )
          .eq("role", "committee");
        if (pErr) throw pErr;

        const memberList = (profiles ?? []) as Omit<
          Member,
          "proposed_competencies" | "votes_cast"
        >[];
        const memberIds = memberList.map((m) => m.id);

        if (memberIds.length === 0) {
          if (!cancelled) setMembers([]);
          return;
        }

        const [compStage, compVotes] = await Promise.all([
          supabase
            .from("competencies_stage")
            .select("suggested_by")
            .in("suggested_by", memberIds),
          supabase
            .from("committee_votes")
            .select("voter_id")
            .in("voter_id", memberIds),
        ]);

        const compCounts: Record<string, number> = {};
        const voteCounts: Record<string, number> = {};

        (compStage.data ?? []).forEach(
          (r: { suggested_by: string }) =>
            (compCounts[r.suggested_by] =
              (compCounts[r.suggested_by] ?? 0) + 1),
        );
        (compVotes.data ?? []).forEach(
          (r: { voter_id: string }) =>
            (voteCounts[r.voter_id] = (voteCounts[r.voter_id] ?? 0) + 1),
        );

        const enriched: Member[] = memberList.map((m) => ({
          ...m,
          proposed_competencies: compCounts[m.id] ?? 0,
          votes_cast: voteCounts[m.id] ?? 0,
        }));

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

  // ── Fetch chair status + pending invites ───────────────────────────────
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data: u } = await supabase.auth.getUser();
      const uid = u.user?.id;
      if (!uid || cancelled) return;

      const { data: me } = await supabase
        .from("profiles")
        .select("role, committee_role")
        .eq("id", uid)
        .maybeSingle<{ role: string | null; committee_role: string | null }>();

      const isChair =
        me?.role === "admin" ||
        (me?.role === "committee" && me?.committee_role === "chief_editor");
      if (!cancelled) setIsChairViewer(isChair);

      // Only chairs can see pending invites
      if (isChair && !cancelled) {
        setPendingLoading(true);
        try {
          const res = await fetch("/api/committee/pending-invites");
          const json = (await res.json()) as {
            pending?: PendingInvite[];
            error?: string;
          };
          if (res.ok && json.pending && !cancelled) {
            setPendingInvites(json.pending);
          }
        } catch {
          // Non-critical — don't block the page
        } finally {
          if (!cancelled) setPendingLoading(false);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // ── Invite handlers ────────────────────────────────────────────────────
  function resetInviteModal() {
    setInviteMode("external");
    setInviteEmail("");
    setInviteMsg(null);
    setInviteErr(null);
  }

  function openInviteModal() {
    resetInviteModal();
    setInviteOpen(true);
  }

  async function submitExternalInvite(e: React.FormEvent) {
    e.preventDefault();
    setInviteErr(null);
    setInviteMsg(null);

    const email = inviteEmail.trim().toLowerCase();
    if (!/^\S+@\S+\.\S+$/.test(email)) {
      setInviteErr("Please enter a valid email address.");
      return;
    }

    setInviting(true);
    try {
      const res = await fetch("/api/committee/invitations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      const json = (await res.json().catch(() => null)) as {
        error?: string;
        message?: string;
      } | null;

      if (!res.ok) throw new Error(json?.error || "Failed to send invitation.");

      setInviteMsg(json?.message || `Invitation sent to ${email}.`);
      setInviteEmail("");
    } catch (error) {
      setInviteErr(
        error instanceof Error ? error.message : "Failed to send invitation.",
      );
    } finally {
      setInviting(false);
    }
  }

  // ── Re-invite handler ──────────────────────────────────────────────────
  async function handleReinvite(invite: PendingInvite) {
    setReinvitingId(invite.id);
    setReinviteMsg(null);
    setReinviteErr(null);

    try {
      const res = await fetch("/api/committee/reinvite", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: invite.email, userId: invite.id }),
      });
      const json = (await res.json()) as { error?: string; message?: string };

      if (!res.ok) throw new Error(json.error || "Failed to re-invite.");

      // Remove from pending list and show success
      setPendingInvites((prev) => prev.filter((p) => p.id !== invite.id));
      setReinviteMsg(`Re-invitation sent to ${invite.email}.`);
      setTimeout(() => setReinviteMsg(null), 4000);
    } catch (error) {
      setReinviteErr(
        error instanceof Error ? error.message : "Failed to re-invite.",
      );
      setTimeout(() => setReinviteErr(null), 5000);
    } finally {
      setReinvitingId(null);
    }
  }

  const chair = members.find((m) => m.committee_role === "chief_editor");
  const regularMembers = members.filter(
    (m) => m.committee_role !== "chief_editor",
  );

  return (
    <div className="px-8 py-8 max-w-5xl mx-auto">
      {/* ── Header ── */}
      <div className="mb-8 flex items-start justify-between gap-4">
        <div>
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

        {isChairViewer && (
          <button
            onClick={openInviteModal}
            className="mt-1 inline-flex items-center gap-2 rounded-full px-4 py-2.5 text-sm font-semibold text-white transition-all hover:opacity-90 hover:shadow-[0_0_12px_color-mix(in_oklab,var(--accent)_40%,transparent)]"
            style={{ background: "var(--accent)" }}
          >
            <Plus size={15} />
            Invite members
          </button>
        )}
      </div>

      {/* ── Global error ── */}
      {err && (
        <div className="mb-6 rounded-2xl border border-[color:var(--err)]/30 bg-[color:var(--err)]/10 px-4 py-3 text-sm text-[var(--err)]">
          {err}
        </div>
      )}

      {/* ── Re-invite feedback ── */}
      {reinviteMsg && (
        <div className="mb-4 rounded-2xl border border-[color:var(--ok)]/30 bg-[color:var(--ok)]/10 px-4 py-3 text-sm text-[var(--ok)]">
          {reinviteMsg}
        </div>
      )}
      {reinviteErr && (
        <div className="mb-4 rounded-2xl border border-[color:var(--err)]/30 bg-[color:var(--err)]/10 px-4 py-3 text-sm text-[var(--err)]">
          {reinviteErr}
        </div>
      )}

      {loading && (
        <div className="text-sm text-[var(--muted)]">Loading members…</div>
      )}

      {/* ── Chair ── */}
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
        <div className="mb-8">
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

      {/* ── Pending invitations (chair only) ── */}
      {isChairViewer && !pendingLoading && pendingInvites.length > 0 && (
        <div>
          <h2 className="text-xs font-bold uppercase tracking-widest text-[var(--muted)] mb-4 flex items-center gap-2">
            Pending Invitations
            <span
              className="inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold normal-case tracking-normal"
              style={{
                background: "color-mix(in oklab, var(--warn) 15%, transparent)",
                color: "var(--warn)",
              }}
            >
              Stale — tracking redesign in progress
            </span>
          </h2>
          <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] overflow-hidden">
            <table className="min-w-full text-sm">
              <thead>
                <tr className="border-b border-[var(--border)] bg-[var(--field)]/40">
                  <th className="px-4 py-3 text-left text-xs font-semibold text-[var(--muted)]">
                    Email
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-[var(--muted)] w-36">
                    Invited
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-[var(--muted)] w-28">
                    Status
                  </th>
                  <th className="px-4 py-3 text-right text-xs font-semibold text-[var(--muted)] w-32">
                    Action
                  </th>
                </tr>
              </thead>
              <tbody>
                {pendingInvites.map((invite) => (
                  <tr
                    key={invite.id}
                    className="border-t border-[var(--border)]"
                  >
                    <td className="px-4 py-3 text-sm font-medium text-[var(--foreground)]">
                      {invite.email}
                    </td>
                    <td className="px-4 py-3 text-xs text-[var(--muted)] whitespace-nowrap">
                      <div className="flex items-center gap-1.5">
                        <Clock size={11} />
                        {formatTimeAgo(invite.hours_since_invite)}
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className="inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[11px] font-semibold"
                        style={{
                          background:
                            "color-mix(in oklab, var(--warn) 15%, transparent)",
                          color: "var(--warn)",
                        }}
                      >
                        <Clock size={10} />
                        {invite.hours_since_invite >= 24
                          ? "Expired"
                          : "Pending"}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <button
                        type="button"
                        onClick={() => handleReinvite(invite)}
                        disabled={reinvitingId === invite.id}
                        className="inline-flex items-center gap-1.5 rounded-full border border-[var(--border)] bg-[var(--surface)] px-3 py-1.5 text-xs font-medium text-[var(--foreground)] transition-all hover:border-[color:var(--accent)] hover:text-[var(--accent)] disabled:opacity-50"
                      >
                        <RefreshCw
                          size={11}
                          className={
                            reinvitingId === invite.id ? "animate-spin" : ""
                          }
                        />
                        {reinvitingId === invite.id ? "Sending…" : "Re-invite"}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="mt-2 text-xs text-[var(--muted)]">
            New invitations are not currently tracked here — only legacy
            unconfirmed users from the previous invite flow appear in this list.
            Re-inviting sends a fresh email with a self-service signup link.
          </p>
        </div>
      )}

      {/* ── Invite modal ── */}
      {inviteOpen && isChairViewer && (
        <div
          role="dialog"
          aria-modal="true"
          onClick={() => setInviteOpen(false)}
          className="fixed inset-0 z-50 grid place-items-center bg-black/50 px-4"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-2xl rounded-2xl border border-[var(--border)] bg-[var(--surface)] shadow-2xl p-6"
          >
            <div className="mb-4 flex items-center justify-between border-b border-[var(--border)] pb-4">
              <h3 className="text-base font-semibold text-[var(--foreground)]">
                Invite Committee Members
              </h3>
              <button
                onClick={() => setInviteOpen(false)}
                className="h-8 w-8 flex-shrink-0 grid place-items-center rounded-full border border-[var(--border)] bg-[var(--field)] text-[var(--foreground)] transition-all hover:border-[color:var(--accent)] hover:text-[var(--accent)]"
              >
                <X size={14} />
              </button>
            </div>

            <p className="mb-4 text-sm text-[var(--muted)]">
              Choose how you want to invite a new committee member.
            </p>

            <div className="grid gap-3 sm:grid-cols-2">
              <button
                type="button"
                onClick={() => setInviteMode("external")}
                className={`rounded-2xl border p-4 text-left transition-all ${
                  inviteMode === "external"
                    ? "border-[color:var(--accent)] bg-[color:var(--accent)]/10"
                    : "border-[var(--border)] bg-[var(--field)] hover:border-[color:var(--accent)]/50"
                }`}
              >
                <div className="mb-2 inline-flex h-9 w-9 items-center justify-center rounded-full bg-[var(--surface)] border border-[var(--border)] text-[var(--accent)]">
                  <MailPlus size={16} />
                </div>
                <div className="text-sm font-semibold text-[var(--foreground)]">
                  Invite external member
                </div>
                <p className="mt-1 text-xs text-[var(--muted)]">
                  Send an invitation to a committee member by email.
                </p>
              </button>

              <button
                type="button"
                disabled
                className="relative rounded-2xl border border-[var(--border)] bg-[var(--field)] p-4 text-left opacity-85 cursor-not-allowed"
              >
                <span className="absolute right-3 top-3 inline-flex items-center gap-1 rounded-full border border-[var(--border)] bg-[var(--surface)] px-2 py-0.5 text-[10px] font-semibold text-[var(--accent)]">
                  <Sparkles size={10} />
                  Coming soon
                </span>
                <div className="mb-2 inline-flex h-9 w-9 items-center justify-center rounded-full bg-[var(--surface)] border border-[var(--border)] text-[var(--muted)]">
                  <Layers size={16} />
                </div>
                <div className="text-sm font-semibold text-[var(--foreground)]">
                  Invite from another module
                </div>
                <p className="mt-1 text-xs text-[var(--muted)]">
                  Soon you will be able to invite existing committee members
                  from other True Competency modules in one click!
                </p>
              </button>
            </div>

            {inviteMode === "external" && (
              <form onSubmit={submitExternalInvite} className="mt-5 space-y-3">
                <label className="block text-sm font-medium text-[var(--foreground)]">
                  Committee member email
                </label>
                <input
                  value={inviteEmail}
                  onChange={(e) => setInviteEmail(e.target.value)}
                  placeholder="name@hospital.org"
                  disabled={inviting}
                  className="w-full rounded-full border border-[var(--border)] bg-[var(--field)] px-4 py-2.5 text-sm appearance-none outline-none focus:outline-none focus:ring-0 focus:border-[color:var(--accent)] focus:shadow-[0_0_0_3px_color-mix(in_oklab,var(--accent)_18%,transparent)] transition-all"
                />

                {inviteErr && (
                  <div className="rounded-xl border border-[color:var(--err)]/30 bg-[color:var(--err)]/10 px-3 py-2 text-xs text-[var(--err)]">
                    {inviteErr}
                  </div>
                )}
                {inviteMsg && (
                  <div className="rounded-xl border border-[color:var(--ok)]/30 bg-[color:var(--ok)]/10 px-3 py-2 text-xs text-[var(--ok)]">
                    {inviteMsg}
                  </div>
                )}

                <div className="pt-1 flex items-center justify-end gap-2">
                  <button
                    type="button"
                    onClick={() => setInviteOpen(false)}
                    disabled={inviting}
                    className="rounded-full border border-[var(--border)] bg-[var(--surface)] px-4 py-2 text-sm text-[var(--foreground)] transition-all hover:border-[color:var(--accent)] hover:text-[var(--accent)]"
                  >
                    Close
                  </button>
                  <button
                    type="submit"
                    disabled={inviting}
                    className="rounded-full px-4 py-2 text-sm font-semibold text-white transition-all hover:opacity-90 hover:shadow-[0_0_12px_color-mix(in_oklab,var(--accent)_40%,transparent)]"
                    style={{ background: "var(--accent)" }}
                  >
                    {inviting ? "Sending…" : "Send invite"}
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ── Member card ────────────────────────────────────────────────────────────
function MemberCard({
  member: m,
  featured = false,
}: {
  member: Member;
  featured?: boolean;
}) {
  const isChair = m.committee_role === "chief_editor";
  const color = avatarColor(m);
  const countryCode =
    m.country_code && /^[A-Za-z]{2}$/.test(m.country_code)
      ? m.country_code.toUpperCase()
      : null;
  const avatarUrl = m.avatar_path
    ? supabase.storage.from("profile-pictures").getPublicUrl(m.avatar_path).data
        .publicUrl
    : "";

  return (
    <div
      className={`card p-5 flex flex-col gap-4 relative overflow-hidden ${featured ? "sm:flex-row sm:gap-6 sm:p-6" : ""}`}
    >
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

      <div
        className={`overflow-hidden rounded-full grid place-items-center text-white font-bold flex-shrink-0 shadow-lg ${featured ? "w-20 h-20 text-2xl" : "w-14 h-14 text-lg"}`}
        style={{ background: color }}
      >
        {avatarUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={avatarUrl}
            alt={getDisplayName(m)}
            className="h-full w-full object-cover object-center"
          />
        ) : (
          getInitials(m)
        )}
      </div>

      <div className="flex-1 min-w-0">
        <div
          className={`font-semibold text-[var(--foreground)] ${featured ? "text-lg" : "text-sm"}`}
        >
          Dr. {getDisplayName(m)}
        </div>

        <div className="mt-1.5 space-y-1">
          {m.hospital && (
            <div className="flex items-center gap-1.5 text-xs text-[var(--muted)]">
              <Hospital size={12} className="flex-shrink-0" />
              <span className="truncate">{m.hospital}</span>
            </div>
          )}
          {!m.hospital && m.university && (
            <div className="flex items-center gap-1.5 text-xs text-[var(--muted)]">
              <Building2 size={12} className="flex-shrink-0" />
              <span className="truncate">{m.university}</span>
            </div>
          )}
          {m.country_name && (
            <div className="flex items-center gap-1.5 text-xs text-[var(--muted)]">
              {countryCode ? (
                <ReactCountryFlag
                  countryCode={countryCode}
                  svg
                  style={{
                    width: "1em",
                    height: "1em",
                    borderRadius: 2,
                    flexShrink: 0,
                  }}
                  title={m.country_name}
                  aria-label={m.country_name}
                />
              ) : (
                <Globe size={12} className="flex-shrink-0" />
              )}
              <span>{m.country_name}</span>
            </div>
          )}
        </div>

        <div className="border-t border-[var(--border)] mt-3 pt-3">
          <div className="grid grid-cols-2 gap-2 text-center">
            <StatPill
              icon={<BookOpen size={11} />}
              value={m.proposed_competencies}
              label="Competencies"
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
