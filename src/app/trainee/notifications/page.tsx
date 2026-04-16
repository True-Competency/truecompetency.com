// src/app/trainee/notifications/page.tsx
"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";
import {
  BookOpen,
  CheckCircle2,
  XCircle,
  Trophy,
  Calendar,
} from "lucide-react";

// ── Types ──────────────────────────────────────────────────────────────────────

type EventType =
  | "competency_enrolled"
  | "question_correct"
  | "question_incorrect"
  | "competency_completed";

type FeedEvent = {
  id: string; // unique key for React
  type: EventType;
  timestamp: string; // ISO string
  competencyName: string;
  questionBody?: string; // only for question events
};

type AssignmentRow = {
  competency_id: string;
  assigned_at: string;
  competencies: { name: string } | null;
};

type AnswerRow = {
  question_id: string;
  is_correct: boolean;
  answered_at: string;
  competency_questions: {
    body: string;
    competencies: { name: string } | null;
  } | null;
};

type ProgressRow = {
  competency_id: string;
  pct: number;
  competencies: { name: string } | null;
};

// ── Helpers ───────────────────────────────────────────────────────────────────

function formatRelativeTime(isoString: string): string {
  const now = Date.now();
  const then = new Date(isoString).getTime();
  const diffMs = now - then;
  const diffMin = Math.floor(diffMs / 60000);
  const diffHr = Math.floor(diffMs / 3600000);
  const diffDay = Math.floor(diffMs / 86400000);

  if (diffMin < 1) return "just now";
  if (diffMin < 60) return `${diffMin}m ago`;
  if (diffHr < 24) return `${diffHr}h ago`;
  if (diffDay < 7) return `${diffDay}d ago`;
  return new Date(isoString).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
  });
}

function eventConfig(type: EventType): {
  icon: React.ReactNode;
  color: string;
  label: string;
} {
  switch (type) {
    case "competency_enrolled":
      return {
        icon: <BookOpen size={16} />,
        color: "var(--accent)",
        label: "Enrolled",
      };
    case "question_correct":
      return {
        icon: <CheckCircle2 size={16} />,
        color: "var(--ok)",
        label: "Correct answer",
      };
    case "question_incorrect":
      return {
        icon: <XCircle size={16} />,
        color: "var(--err)",
        label: "Incorrect answer",
      };
    case "competency_completed":
      return {
        icon: <Trophy size={16} />,
        color: "var(--warn)",
        label: "Completed",
      };
  }
}

// Group events by date label
function groupByDate(events: FeedEvent[]): Record<string, FeedEvent[]> {
  const groups: Record<string, FeedEvent[]> = {};
  const today = new Date();
  const yesterday = new Date(today);
  yesterday.setDate(today.getDate() - 1);

  events.forEach((e) => {
    const d = new Date(e.timestamp);
    let label: string;

    if (d.toDateString() === today.toDateString()) {
      label = "Today";
    } else if (d.toDateString() === yesterday.toDateString()) {
      label = "Yesterday";
    } else {
      label = d.toLocaleDateString("en-US", {
        weekday: "long",
        month: "long",
        day: "numeric",
      });
    }

    if (!groups[label]) groups[label] = [];
    groups[label].push(e);
  });

  return groups;
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function TraineeNotificationsPage() {
  const router = useRouter();

  const [events, setEvents] = useState<FeedEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  // ── Fetch ──────────────────────────────────────────────────────────────────

  useEffect(() => {
    let cancelled = false;

    (async () => {
      setLoading(true);
      setErr(null);

      try {
        const { data: userRes, error: userErr } = await supabase.auth.getUser();
        if (userErr) throw userErr;
        const uid = userRes.user?.id ?? null;
        if (!uid) {
          router.replace("/signin?redirect=/trainee/notifications");
          return;
        }

        // 30-day window
        const since = new Date(
          Date.now() - 30 * 24 * 60 * 60 * 1000,
        ).toISOString();

        // All queries in parallel
        const [
          { data: assignments, error: aErr },
          { data: answers, error: ansErr },
          { data: progress, error: pErr },
        ] = await Promise.all([
          // Enrolled competencies in last 30 days
          supabase
            .from("competency_assignments")
            .select("competency_id, assigned_at, competencies(name)")
            .eq("student_id", uid)
            .gte("assigned_at", since)
            .order("assigned_at", { ascending: false })
            .returns<AssignmentRow[]>(),

          // Answers submitted in last 30 days
          supabase
            .from("student_answers")
            .select(
              "question_id, is_correct, answered_at, competency_questions(body, competencies(name))",
            )
            .eq("student_id", uid)
            .gte("answered_at", since)
            .order("answered_at", { ascending: false })
            .returns<AnswerRow[]>(),

          // Completed competencies — check progress view for pct >= 100
          // We join competencies to get the name
          supabase
            .from("student_competency_progress")
            .select("competency_id, pct, competencies(name)")
            .eq("student_id", uid)
            .gte("pct", 100)
            .returns<ProgressRow[]>(),
        ]);

        if (aErr) throw aErr;
        if (ansErr) throw ansErr;
        if (pErr) throw pErr;
        if (cancelled) return;

        const feed: FeedEvent[] = [];

        // Enrollment events
        (assignments ?? []).forEach((r) => {
          feed.push({
            id: `enroll_${r.competency_id}_${r.assigned_at}`,
            type: "competency_enrolled",
            timestamp: r.assigned_at,
            competencyName: r.competencies?.name ?? "Unknown competency",
          });
        });

        // Answer events
        (answers ?? []).forEach((r) => {
          feed.push({
            id: `answer_${r.question_id}_${r.answered_at}`,
            type: r.is_correct ? "question_correct" : "question_incorrect",
            timestamp: r.answered_at,
            competencyName:
              r.competency_questions?.competencies?.name ??
              "Unknown competency",
            questionBody: r.competency_questions?.body ?? undefined,
          });
        });

        // Completion events — use answered_at of last answer as proxy timestamp
        // since progress view doesn't have a completed_at timestamp
        const completedIds = new Set(
          (assignments ?? []).map((r) => r.competency_id),
        );
        (progress ?? []).forEach((r) => {
          // Only show completion if they were assigned within the 30-day window
          if (!completedIds.has(r.competency_id)) return;
          const lastAnswer = (answers ?? [])
            .filter(
              (a) =>
                a.competency_questions?.competencies?.name ===
                r.competencies?.name,
            )
            .sort(
              (a, b) =>
                new Date(b.answered_at).getTime() -
                new Date(a.answered_at).getTime(),
            )[0];

          if (lastAnswer) {
            feed.push({
              id: `complete_${r.competency_id}`,
              type: "competency_completed",
              timestamp: lastAnswer.answered_at,
              competencyName: r.competencies?.name ?? "Unknown competency",
            });
          }
        });

        // Sort all events newest first
        feed.sort(
          (a, b) =>
            new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime(),
        );

        setEvents(feed);
      } catch (e) {
        setErr(e instanceof Error ? e.message : String(e));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [router]);

  // ── Group by date ──────────────────────────────────────────────────────────

  const grouped = useMemo(() => groupByDate(events), [events]);
  const dateLabels = Object.keys(grouped);

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="h-screen overflow-hidden px-8 py-8 max-w-6xl mx-auto flex flex-col">
      {/* Header */}
      <div className="mb-6 flex-shrink-0">
        <h1
          className="text-3xl font-bold tracking-tight text-[var(--foreground)]"
          style={{ fontFamily: "var(--font-heading, sans-serif)" }}
        >
          Activity
        </h1>
        <div className="accent-underline mt-3" />
        <p className="mt-3 text-sm text-[var(--muted)]">
          {loading ? "Loading…" : `${events.length} events in the last 30 days`}
        </p>
      </div>

      {/* Error */}
      {err && (
        <div className="mb-4 flex-shrink-0 rounded-2xl border border-[color:var(--err)]/30 bg-[color:var(--err)]/10 px-4 py-3 text-sm text-[var(--err)]">
          {err}
        </div>
      )}

      {/* Feed */}
      <div className="flex-1 overflow-auto">
        {loading ? (
          <div className="space-y-3">
            {Array.from({ length: 8 }).map((_, i) => (
              <div
                key={i}
                className="h-16 rounded-2xl border border-[var(--border)] bg-[var(--surface)] animate-pulse"
              />
            ))}
          </div>
        ) : events.length === 0 ? (
          // Empty state
          <div className="h-full flex flex-col items-center justify-center gap-4 rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-12 text-center">
            <div
              className="h-14 w-14 rounded-2xl grid place-items-center"
              style={{
                background:
                  "color-mix(in oklab, var(--accent) 12%, transparent)",
              }}
            >
              <Calendar size={24} style={{ color: "var(--accent)" }} />
            </div>
            <div>
              <p className="text-base font-semibold text-[var(--foreground)]">
                No activity in the last 30 days
              </p>
              <p className="mt-1 text-sm text-[var(--muted)]">
                Enroll in competencies and start answering questions to see your
                activity here.
              </p>
            </div>
          </div>
        ) : (
          <div className="space-y-6">
            {dateLabels.map((label) => (
              <div key={label}>
                {/* Date group label */}
                <div className="mb-3 flex items-center gap-3">
                  <span className="text-xs font-semibold text-[var(--muted)] uppercase tracking-widest">
                    {label}
                  </span>
                  <div className="flex-1 h-px bg-[var(--border)]" />
                </div>

                {/* Events in this group */}
                <div className="space-y-2">
                  {grouped[label].map((event) => {
                    const config = eventConfig(event.type);
                    return (
                      <div
                        key={event.id}
                        className="flex items-center gap-4 rounded-2xl border border-[var(--border)] bg-[var(--surface)] px-4 py-3 overflow-hidden relative"
                        style={{
                          borderLeft: `3px solid ${config.color}`,
                        }}
                      >
                        {/* Bare icon — no background */}
                        <div
                          className="flex-shrink-0"
                          style={{ color: config.color }}
                        >
                          {config.icon}
                        </div>

                        {/* Content */}
                        <div className="flex-1 min-w-0">
                          <div className="flex items-baseline gap-2 flex-wrap">
                            <span
                              className="text-xs font-semibold flex-shrink-0"
                              style={{ color: config.color }}
                            >
                              {config.label}
                            </span>
                            <span className="text-sm text-[var(--foreground)] truncate">
                              {event.competencyName}
                            </span>
                          </div>
                          {event.questionBody && (
                            <p className="mt-0.5 text-xs text-[var(--muted)] line-clamp-1">
                              {event.questionBody}
                            </p>
                          )}
                        </div>

                        {/* Timestamp */}
                        <span className="text-xs text-[var(--muted)] flex-shrink-0">
                          {formatRelativeTime(event.timestamp)}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
