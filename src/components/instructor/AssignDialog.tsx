"use client";

import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabaseClient";

type Competency = {
  id: string;
  name: string | null;
  difficulty: string | null;
  tags: string[] | null;
  position: number | null;
};

type CompetencyRaw = Omit<Competency, "tags"> & {
  tags: string[] | null; // UUID[] from DB
};

type TagRow = {
  id: string;
  name: string;
};

type Props = {
  studentId: string;
  open: boolean;
  onClose: () => void;
  onAssigned?: () => void; // callback after successful assign/unassign
};

export default function AssignDialog({
  studentId,
  open,
  onClose,
  onAssigned,
}: Props) {
  const [allComps, setAllComps] = useState<Competency[]>([]);
  const [assigned, setAssigned] = useState<Set<string>>(new Set());
  const [q, setQ] = useState("");
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const filtered = useMemo(() => {
    const qq = q.trim().toLowerCase();
    if (!qq) return allComps;
    return allComps.filter((c) => (c.name ?? c.id).toLowerCase().includes(qq));
  }, [q, allComps]);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;

    (async () => {
      setLoading(true);
      setErr(null);
      try {
        // 1) Load all competencies
        const [{ data: comps, error: cErr }, { data: tagsData, error: tagsErr }] =
          await Promise.all([
            supabase
              .from("competencies")
              .select("id, name, difficulty, tags, position")
              .order("position", { ascending: true, nullsFirst: false }),
            supabase.from("tags").select("id, name"),
          ]);
        if (cErr) throw cErr;
        if (tagsErr) throw tagsErr;

        const tagNameById = new Map(
          ((tagsData ?? []) as TagRow[]).map((t) => [t.id, t.name]),
        );
        const resolved = ((comps ?? []) as CompetencyRaw[]).map((c) => ({
          ...c,
          tags: (c.tags ?? [])
            .map((id) => tagNameById.get(id))
            .filter((v): v is string => Boolean(v)),
        }));

        if (!cancelled) setAllComps(resolved);

        // 2) Load assignments for this student
        // We use student_competency_progress as "assignment indicator" (adapt if you have a separate join table)
        const { data: progress, error: pErr } = await supabase
          .from("student_competency_progress")
          .select("competency_id")
          .eq("student_id", studentId);
        if (pErr) throw pErr;

        const ids = new Set<string>(
          (progress ?? []).map(
            (r: { competency_id: string }) => r.competency_id
          )
        );
        if (!cancelled) setAssigned(ids);
      } catch (e) {
        setErr(e instanceof Error ? e.message : String(e));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [open, studentId]);

  async function toggleAssign(compId: string, nextChecked: boolean) {
    setErr(null);
    try {
      if (nextChecked) {
        // Create a minimal placeholder “assignment”. If you have a dedicated assignments table,
        // upsert into that table instead.
        const { error } = await supabase
          .from("student_competency_progress")
          .upsert(
            {
              student_id: studentId,
              competency_id: compId,
              total_questions: 0,
              answered_questions: 0,
              pct: 0,
            },
            { onConflict: "student_id,competency_id" }
          );
        if (error) throw error;
        setAssigned((prev) => new Set(prev).add(compId));
      } else {
        // Remove assignment (if your schema requires a different table, modify here)
        const { error } = await supabase
          .from("student_competency_progress")
          .delete()
          .eq("student_id", studentId)
          .eq("competency_id", compId);
        if (error) throw error;
        setAssigned((prev) => {
          const n = new Set(prev);
          n.delete(compId);
          return n;
        });
      }
      onAssigned?.();
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    }
  }

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/40 backdrop-blur-sm">
      <div className="w-[min(720px,92vw)] rounded-2xl border border-[var(--border)] bg-[var(--surface)] shadow-xl">
        <div className="flex items-center justify-between px-5 py-4 border-b border-[var(--border)]">
          <h2 className="text-lg font-semibold">Assign competencies</h2>
          <button
            onClick={onClose}
            className="rounded-lg px-3 py-1.5 text-sm border border-[var(--border)] hover:bg-[var(--field)]"
          >
            Close
          </button>
        </div>

        <div className="p-5">
          <div className="mb-4 rounded-xl border border-[var(--border)] bg-[var(--field)]">
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search competencies…"
              className="w-full bg-transparent px-3 py-2.5 outline-none placeholder:[color:var(--muted)]"
            />
          </div>

          {err && (
            <div className="mb-3 rounded-xl border border-red-900/40 bg-red-950/40 px-4 py-3 text-sm text-red-200">
              {err}
            </div>
          )}

          {loading ? (
            <div className="grid grid-cols-[repeat(auto-fill,minmax(280px,1fr))] gap-3">
              {Array.from({ length: 6 }).map((_, i) => (
                <div
                  key={i}
                  className="h-20 rounded-xl border border-[var(--border)] bg-[var(--surface)] animate-pulse"
                />
              ))}
            </div>
          ) : filtered.length === 0 ? (
            <div className="text-sm text-[var(--muted)]">No results.</div>
          ) : (
            <div className="grid grid-cols-[repeat(auto-fill,minmax(280px,1fr))] gap-3">
              {filtered.map((c) => {
                const checked = assigned.has(c.id);
                return (
                  <label
                    key={c.id}
                    className="flex items-start gap-3 rounded-xl border border-[var(--border)] bg-[var(--surface)] p-3 cursor-pointer hover:shadow"
                  >
                    <input
                      type="checkbox"
                      className="mt-1"
                      checked={checked}
                      onChange={(e) =>
                        toggleAssign(c.id, e.currentTarget.checked)
                      }
                    />
                    <div className="min-w-0">
                      <div className="font-medium truncate">
                        {c.name ?? c.id}
                      </div>
                      <div className="text-xs text-[var(--muted)]">
                        {c.difficulty ?? "—"}
                      </div>
                    </div>
                  </label>
                );
              })}
            </div>
          )}
        </div>

        <div className="flex items-center justify-end gap-3 px-5 py-4 border-t border-[var(--border)]">
          <button
            onClick={onClose}
            className="rounded-xl px-4 py-2 border border-[var(--border)] hover:bg-[var(--field)]"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
}
