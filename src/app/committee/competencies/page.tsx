// src/app/committee/competencies/page.tsx
"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import type { TagRow, Competency } from "@/lib/types";
import {
  ArrowRight,
  ChevronDown,
  GripVertical,
  Paperclip,
  Plus,
  Search,
  X,
} from "lucide-react";

// ── Types ──────────────────────────────────────────────────────────────────

type Domain = {
  id: string;
  name: string;
  code: string;
  position: number;
  description: string | null;
};

type Subgoal = {
  id: string;
  domain_id: string;
  name: string;
  code: string;
  position: number;
  description: string | null;
};

type QuestionOption = {
  label: string;
  body: string;
  is_correct: boolean;
};

type CompetencyQuestion = {
  id: string;
  competency_id: string;
  body: string;
  created_at: string;
  options: QuestionOption[];
  media: QuestionMediaItem[];
};

type QuestionMediaItem = {
  id: string;
  question_id: string | null;
  file_name: string;
  file_type: string | null;
  mime_type: string | null;
  file_size: number | null;
  storage_path: string;
  signed_url: string | null;
};


function byPositionThenCode<T extends { position: number; code: string }>(
  a: T,
  b: T,
) {
  if (a.position !== b.position) return a.position - b.position;
  return a.code.localeCompare(b.code);
}

function CompetencyRow({
  c,
  questionCount,
  onPreview,
}: {
  c: Competency;
  questionCount: number;
  onPreview: () => void;
}) {
  return (
    <tr className="border-t border-[var(--border)] hover:bg-[color:var(--accent)]/3 transition-colors">
      <td className="px-4 py-3 align-middle text-xs text-[var(--muted)]">
        {c.position ?? "—"}
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
                #{t}
              </span>
            ))}
          </div>
        ) : (
          <span className="text-xs text-[var(--muted)]">—</span>
        )}
      </td>
      <td className="px-4 py-3 align-middle">
        {questionCount === 0 ? (
          <span className="inline-flex w-[8.5rem] items-center justify-center rounded-full border border-[color:var(--err)]/30 bg-[color:var(--err)]/10 px-3 py-1.5 text-xs font-semibold text-[var(--err)] whitespace-nowrap">
            No question
          </span>
        ) : (
          <button
            onClick={onPreview}
            className="inline-flex w-[8.5rem] items-center justify-center gap-1.5 rounded-full border border-[color:var(--ok)]/35 bg-[color:var(--ok)]/12 px-3 py-1.5 text-xs font-semibold text-[var(--ok)] transition-colors hover:border-[color:var(--ok)] hover:bg-[color:var(--ok)]/20 whitespace-nowrap"
          >
            <span>
              {questionCount} question{questionCount !== 1 ? "s" : ""}
            </span>
            <ArrowRight size={12} />
          </button>
        )}
      </td>
    </tr>
  );
}

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
  const [tagsCatalog, setTagsCatalog] = useState<TagRow[]>([]);
  const [domains, setDomains] = useState<Domain[]>([]);
  const [subgoals, setSubgoals] = useState<Subgoal[]>([]);
  const [questionsByComp, setQuestionsByComp] = useState<
    Record<string, CompetencyQuestion[]>
  >({});
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  // Filters
  const [query, setQuery] = useState("");
  const [tagFilters, setTagFilters] = useState<string[]>([]);

  // Accordion state — domain/subgoal expansion. All collapsed on initial render.
  // Filter activation auto-expands matching sections; clearing the filter resets
  // to all-collapsed (chosen over "preserve" so the chair gets a clean slate when
  // they finish a search).
  const [expandedDomains, setExpandedDomains] = useState<Set<string>>(
    () => new Set(),
  );
  const [expandedSubgoals, setExpandedSubgoals] = useState<Set<string>>(
    () => new Set(),
  );
  const UNASSIGNED_KEY = "__unassigned__";
  const prevFilterActiveRef = useRef(false);

  // Propose Competency modal
  const [proposeOpen, setProposeOpen] = useState(false);
  const [propName, setPropName] = useState("");
  const [propDifficulty, setPropDifficulty] =
    useState<(typeof DIFF_ORDER)[number]>("Intermediate");
  const [propTagIds, setPropTagIds] = useState<string[]>([]);
  const [propReason, setPropReason] = useState("");
  const [propBypass, setPropBypass] = useState(false);
  const [propDomainId, setPropDomainId] = useState<string>("");
  const [propSubgoalId, setPropSubgoalId] = useState<string>("");
  const [submitting, setSubmitting] = useState(false);

  const [questionPreviewComp, setQuestionPreviewComp] = useState<Competency | null>(
    null,
  );
  const [isChair, setIsChair] = useState(false);
  const [reorderOpen, setReorderOpen] = useState(false);
  const [reorderSaving, setReorderSaving] = useState(false);
  const [reorderDraft, setReorderDraft] = useState<Competency[]>([]);
  const [reorderInitialPos, setReorderInitialPos] = useState<
    Record<string, number>
  >({});
  const [reorderInitialSubgoal, setReorderInitialSubgoal] = useState<
    Record<string, string | null>
  >({});
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [dropIndex, setDropIndex] = useState<number | null>(null);
  const [dragSourceDomainId, setDragSourceDomainId] = useState<string | null>(
    null,
  );
  const [lastMove, setLastMove] = useState<{ from: number; to: number } | null>(
    null,
  );
  const [moveHistory, setMoveHistory] = useState<string[]>([]);
  const lastMoveKeyRef = useRef<string | null>(null);

  // ── Data load ────────────────────────────────────────────────────────────
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        setLoading(true);
        setErr(null);
        const [
          { data, error },
          { data: tagsData, error: tagsErr },
          { data: questionRows, error: questionsErr },
          { data: domainsData, error: domainsErr },
          { data: subgoalsData, error: subgoalsErr },
        ] =
          await Promise.all([
            supabase
              .from("competencies")
              .select("id, name, difficulty, tags, position, subgoal_id, created_at")
              .order("position", { ascending: true, nullsFirst: false }),
            supabase.from("tags").select("id, name").order("name", { ascending: true }),
            supabase
              .from("competency_questions")
              .select("id, competency_id, body, created_at")
              .order("created_at", { ascending: true }),
            supabase
              .from("domains")
              .select("id, name, code, position, description"),
            supabase
              .from("subgoals")
              .select("id, domain_id, name, code, position, description"),
          ]);
        if (error) throw error;
        if (tagsErr) throw tagsErr;
        if (questionsErr) throw questionsErr;
        if (domainsErr) throw domainsErr;
        if (subgoalsErr) throw subgoalsErr;

        const tagNameById = new Map(
          ((tagsData ?? []) as TagRow[]).map((t) => [t.id, t.name]),
        );
        const resolved = ((data ?? []) as Competency[]).map((c) => ({
          ...c,
          tags: (c.tags ?? [])
            .map((id) => tagNameById.get(id))
            .filter((v): v is string => Boolean(v)),
        }));

        const liveQuestions = (questionRows ?? []) as Array<{
          id: string;
          competency_id: string;
          body: string;
          created_at: string;
        }>;
        const questionIds = liveQuestions.map((q) => q.id);
        const questionOptionsMap: Record<string, QuestionOption[]> = {};
        const questionMediaMap: Record<string, QuestionMediaItem[]> = {};

        if (questionIds.length > 0) {
          const { data: optionRows, error: optionsErr } = await supabase
            .from("question_options")
            .select("question_id, body, is_correct, sort_order")
            .in("question_id", questionIds)
            .order("sort_order", { ascending: true });
          if (optionsErr) throw optionsErr;

          (optionRows ?? []).forEach(
            (option: {
              question_id: string;
              body: string;
              is_correct: boolean;
            }) => {
              if (!questionOptionsMap[option.question_id]) {
                questionOptionsMap[option.question_id] = [];
              }
              const arr = questionOptionsMap[option.question_id];
              arr.push({
                label: String.fromCharCode("A".charCodeAt(0) + arr.length),
                body: option.body,
                is_correct: option.is_correct,
              });
            },
          );

          const { data: mediaRows, error: mediaErr } = await supabase
            .from("question_media")
            .select(
              "id, question_id, file_name, file_type, mime_type, file_size, storage_path, created_at",
            )
            .in("question_id", questionIds)
            .order("created_at", { ascending: true });
          if (mediaErr) throw mediaErr;

          const mediaWithUrls = await Promise.all(
            ((mediaRows ?? []) as Omit<QuestionMediaItem, "signed_url">[]).map(
              async (item) => {
                const { data: signed } = await supabase.storage
                  .from("question-media")
                  .createSignedUrl(item.storage_path, 60 * 60);
                return {
                  ...item,
                  signed_url: signed?.signedUrl ?? null,
                } as QuestionMediaItem;
              },
            ),
          );

          mediaWithUrls.forEach((item) => {
            if (!item.question_id) return;
            if (!questionMediaMap[item.question_id]) {
              questionMediaMap[item.question_id] = [];
            }
            questionMediaMap[item.question_id].push(item);
          });
        }

        const questionsMap: Record<string, CompetencyQuestion[]> = {};
        liveQuestions.forEach((question) => {
          if (!questionsMap[question.competency_id]) {
            questionsMap[question.competency_id] = [];
          }
          questionsMap[question.competency_id].push({
            ...question,
            options: questionOptionsMap[question.id] ?? [],
            media: questionMediaMap[question.id] ?? [],
          });
        });

        if (!cancelled) {
          setRows(resolved);
          setTagsCatalog((tagsData ?? []) as TagRow[]);
          setQuestionsByComp(questionsMap);
          setDomains((domainsData ?? []) as Domain[]);
          setSubgoals((subgoalsData ?? []) as Subgoal[]);
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

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data: u } = await supabase.auth.getUser();
      const uid = u.user?.id;
      if (!uid || cancelled) return;
      const { data } = await supabase
        .from("profiles")
        .select("committee_role")
        .eq("id", uid)
        .maybeSingle<{ committee_role: string | null }>();
      if (!cancelled) setIsChair(data?.committee_role === "chief_editor");
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // ── Derived ──────────────────────────────────────────────────────────────
  const list = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return rows.filter((r) => {
      const inSearch =
        !needle ||
        r.name.toLowerCase().includes(needle) ||
        r.difficulty.toLowerCase().includes(needle) ||
        (r.tags ?? []).some((t) => t.toLowerCase().includes(needle));
      const tagsOk =
        tagFilters.length === 0 ||
        tagFilters.every((t) =>
          (r.tags ?? []).map((x) => x.toLowerCase()).includes(t.toLowerCase()),
        );
      return inSearch && tagsOk;
    });
  }, [rows, query, tagFilters]);
  const tagOptions = useMemo(
    () => tagsCatalog.map((t) => t.name),
    [tagsCatalog],
  );
  const subgoalById = useMemo(
    () => new Map(subgoals.map((s) => [s.id, s])),
    [subgoals],
  );
  const domainById = useMemo(
    () => new Map(domains.map((d) => [d.id, d])),
    [domains],
  );
  const sortedDomains = useMemo(
    () => [...domains].sort(byPositionThenCode),
    [domains],
  );
  const subgoalsByDomain = useMemo(() => {
    const m = new Map<string, Subgoal[]>();
    for (const s of subgoals) {
      const arr = m.get(s.domain_id) ?? [];
      arr.push(s);
      m.set(s.domain_id, arr);
    }
    for (const arr of m.values()) arr.sort(byPositionThenCode);
    return m;
  }, [subgoals]);
  const groupedDraft = useMemo(() => {
    const compsBySubgoal = new Map<string | null, Competency[]>();
    reorderDraft.forEach((c) => {
      const k = c.subgoal_id;
      const arr = compsBySubgoal.get(k) ?? [];
      arr.push(c);
      compsBySubgoal.set(k, arr);
    });
    return {
      domains: sortedDomains.map((d) => ({
        domain: d,
        subgoals: (subgoalsByDomain.get(d.id) ?? []).map((s) => ({
          subgoal: s,
          comps: compsBySubgoal.get(s.id) ?? [],
        })),
      })),
      unassigned: compsBySubgoal.get(null) ?? [],
    };
  }, [reorderDraft, sortedDomains, subgoalsByDomain]);
  const groupedList = useMemo(() => {
    const compsBySubgoal = new Map<string | null, Competency[]>();
    list.forEach((c) => {
      const k = c.subgoal_id;
      const arr = compsBySubgoal.get(k) ?? [];
      arr.push(c);
      compsBySubgoal.set(k, arr);
    });
    return {
      domains: sortedDomains.map((d) => ({
        domain: d,
        subgoals: (subgoalsByDomain.get(d.id) ?? []).map((s) => ({
          subgoal: s,
          comps: compsBySubgoal.get(s.id) ?? [],
        })),
      })),
      unassigned: compsBySubgoal.get(null) ?? [],
    };
  }, [list, sortedDomains, subgoalsByDomain]);

  const filterActive = query.trim() !== "" || tagFilters.length > 0;
  const didInitialExpandRef = useRef(false);

  // First time domains load, default to all domains expanded with all subgoals collapsed.
  useEffect(() => {
    if (didInitialExpandRef.current) return;
    if (sortedDomains.length === 0) return;
    setExpandedDomains(new Set(sortedDomains.map((d) => d.id)));
    setExpandedSubgoals(new Set());
    didInitialExpandRef.current = true;
  }, [sortedDomains]);

  useEffect(() => {
    if (filterActive) {
      const dSet = new Set<string>();
      const sgSet = new Set<string>();
      for (const d of groupedList.domains) {
        let domainHasMatch = false;
        for (const sg of d.subgoals) {
          if (sg.comps.length > 0) {
            sgSet.add(sg.subgoal.id);
            domainHasMatch = true;
          }
        }
        if (domainHasMatch) dSet.add(d.domain.id);
      }
      if (groupedList.unassigned.length > 0) dSet.add(UNASSIGNED_KEY);
      setExpandedDomains(dSet);
      setExpandedSubgoals(sgSet);
    } else if (prevFilterActiveRef.current) {
      // Clearing the filter returns to the default: domains open, subgoals closed.
      setExpandedDomains(new Set(sortedDomains.map((d) => d.id)));
      setExpandedSubgoals(new Set());
    }
    prevFilterActiveRef.current = filterActive;
  }, [filterActive, groupedList, sortedDomains]);

  function toggleDomain(domainId: string) {
    setExpandedDomains((prev) => {
      const next = new Set(prev);
      if (next.has(domainId)) next.delete(domainId);
      else next.add(domainId);
      return next;
    });
  }

  function toggleSubgoal(subgoalId: string) {
    setExpandedSubgoals((prev) => {
      const next = new Set(prev);
      if (next.has(subgoalId)) next.delete(subgoalId);
      else next.add(subgoalId);
      return next;
    });
  }

  // ── Helpers ──────────────────────────────────────────────────────────────
  function showToast(msg: string) {
    setToast(msg);
    setTimeout(() => setToast(null), 2400);
  }

  function getErrorMessage(e: unknown) {
    if (e instanceof Error && e.message) return e.message;
    if (e && typeof e === "object" && "message" in e) {
      const msg = (e as { message?: unknown }).message;
      if (typeof msg === "string" && msg) return msg;
    }
    try {
      return JSON.stringify(e);
    } catch {
      return "Unexpected error.";
    }
  }

  function closeProposeModal() {
    setProposeOpen(false);
    setPropBypass(false);
    setPropDomainId("");
    setPropSubgoalId("");
  }

  function openReorderModal() {
    const initialPos: Record<string, number> = {};
    const initialSub: Record<string, string | null> = {};
    rows.forEach((c, idx) => {
      initialPos[c.id] = c.position ?? idx + 1;
      initialSub[c.id] = c.subgoal_id;
    });
    setReorderInitialPos(initialPos);
    setReorderInitialSubgoal(initialSub);
    setReorderDraft(rows.slice());
    setLastMove(null);
    setMoveHistory([]);
    lastMoveKeyRef.current = null;
    setDragIndex(null);
    setDropIndex(null);
    setDragSourceDomainId(null);
    setReorderOpen(true);
  }

  function domainIdOfSubgoal(subgoalId: string | null): string | null {
    if (!subgoalId) return null;
    return subgoalById.get(subgoalId)?.domain_id ?? null;
  }

  function clearDragState() {
    setDragIndex(null);
    setDropIndex(null);
    setDragSourceDomainId(null);
  }

  function recordMove(label: string) {
    if (lastMoveKeyRef.current === label) return;
    setLastMove({ from: 0, to: 0 });
    setMoveHistory((prev) => [...prev, label]);
    lastMoveKeyRef.current = label;
  }

  function onRowDragStart(e: React.DragEvent, comp: Competency) {
    if (!isChair) return;
    e.dataTransfer.effectAllowed = "move";
    e.dataTransfer.setData("text/plain", comp.id);
    setDragSourceDomainId(domainIdOfSubgoal(comp.subgoal_id));
    setDragIndex(reorderDraft.findIndex((c) => c.id === comp.id));
  }

  function onRowDragOver(e: React.DragEvent, targetComp: Competency) {
    const targetDomainId = domainIdOfSubgoal(targetComp.subgoal_id);
    if (
      dragSourceDomainId &&
      targetDomainId &&
      targetDomainId !== dragSourceDomainId
    ) {
      e.dataTransfer.dropEffect = "none";
      return;
    }
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    setDropIndex(reorderDraft.findIndex((c) => c.id === targetComp.id));
  }

  function onRowDrop(e: React.DragEvent, targetComp: Competency) {
    e.preventDefault();
    const sourceId = e.dataTransfer.getData("text/plain");
    if (!sourceId) return clearDragState();

    const targetDomainId = domainIdOfSubgoal(targetComp.subgoal_id);
    if (
      dragSourceDomainId &&
      targetDomainId &&
      targetDomainId !== dragSourceDomainId
    ) {
      return clearDragState();
    }

    setReorderDraft((prev) => {
      const fromIdx = prev.findIndex((c) => c.id === sourceId);
      const toIdx = prev.findIndex((c) => c.id === targetComp.id);
      if (fromIdx < 0 || toIdx < 0 || fromIdx === toIdx) return prev;
      const next = prev.slice();
      const [moved] = next.splice(fromIdx, 1);
      const adoptedSubgoal = targetComp.subgoal_id;
      const subgoalChanged = moved.subgoal_id !== adoptedSubgoal;
      moved.subgoal_id = adoptedSubgoal;
      next.splice(toIdx, 0, moved);
      const sgName = adoptedSubgoal
        ? subgoalById.get(adoptedSubgoal)?.code ?? "?"
        : "Unassigned";
      recordMove(
        subgoalChanged
          ? `"${moved.name.slice(0, 28)}…" → ${sgName}`
          : `"${moved.name.slice(0, 28)}…" reordered`,
      );
      return next;
    });
    clearDragState();
  }

  function onSubgoalDragOver(e: React.DragEvent, subgoal: Subgoal) {
    if (dragSourceDomainId && subgoal.domain_id !== dragSourceDomainId) {
      e.dataTransfer.dropEffect = "none";
      return;
    }
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
  }

  function onSubgoalDrop(e: React.DragEvent, subgoal: Subgoal) {
    e.preventDefault();
    const sourceId = e.dataTransfer.getData("text/plain");
    if (!sourceId) return clearDragState();
    if (dragSourceDomainId && subgoal.domain_id !== dragSourceDomainId) {
      return clearDragState();
    }

    setReorderDraft((prev) => {
      const fromIdx = prev.findIndex((c) => c.id === sourceId);
      if (fromIdx < 0) return prev;
      const next = prev.slice();
      const [moved] = next.splice(fromIdx, 1);
      const subgoalChanged = moved.subgoal_id !== subgoal.id;
      moved.subgoal_id = subgoal.id;
      let insertAt = next.length;
      for (let i = next.length - 1; i >= 0; i--) {
        if (next[i].subgoal_id === subgoal.id) {
          insertAt = i + 1;
          break;
        }
      }
      next.splice(insertAt, 0, moved);
      if (subgoalChanged) {
        recordMove(
          `"${moved.name.slice(0, 28)}…" → ${subgoal.code} (end)`,
        );
      }
      return next;
    });
    clearDragState();
  }

  async function saveReorder() {
    if (!isChair) return;
    try {
      setReorderSaving(true);
      setErr(null);

      const orderedIds: string[] = [];
      for (const d of groupedDraft.domains) {
        for (const sg of d.subgoals) {
          for (const c of sg.comps) orderedIds.push(c.id);
        }
      }
      for (const c of groupedDraft.unassigned) orderedIds.push(c.id);

      if (orderedIds.length !== reorderDraft.length) {
        throw new Error("Internal error: reorder list size mismatch.");
      }

      const moves = reorderDraft.filter(
        (c) => c.subgoal_id !== reorderInitialSubgoal[c.id],
      );

      if (moves.length > 0) {
        const { error: reassignErr } = await supabase.rpc(
          "chair_reassign_competency_subgoals",
          {
            p_ids: moves.map((m) => m.id),
            p_subgoal_ids: moves.map((m) => m.subgoal_id),
          },
        );
        if (reassignErr) throw reassignErr;
      }

      const { error: rpcErr } = await supabase.rpc(
        "chair_reorder_competencies",
        { p_ordered_ids: orderedIds },
      );
      if (rpcErr) throw rpcErr;

      const idToPosition = new Map(
        orderedIds.map((id, idx) => [id, idx + 1]),
      );
      setRows(
        reorderDraft.map((c) => ({
          ...c,
          position: idToPosition.get(c.id) ?? c.position,
        })),
      );
      setReorderOpen(false);
      showToast(
        moves.length > 0
          ? `Order updated. ${moves.length} competenc${moves.length === 1 ? "y" : "ies"} moved between subgoals.`
          : "Competency order updated.",
      );
    } catch (e) {
      setErr(getErrorMessage(e));
    } finally {
      setReorderSaving(false);
    }
  }

  // ── Handlers ─────────────────────────────────────────────────────────────
  async function handlePropose() {
    try {
      setSubmitting(true);
      setErr(null);
      const nameTrim = propName.trim();
      if (!nameTrim) throw new Error("Please enter a competency name.");
      if (!propSubgoalId) throw new Error("Please choose a subgoal.");
      if (propTagIds.length === 0)
        throw new Error("Please select at least one tag.");
      const { data: u2 } = await supabase.auth.getUser();
      const uid = u2.user?.id;
      if (!uid) throw new Error("Please sign in again.");
      const directInsert = isChair && propBypass;
      if (directInsert) {
        const { data: newCompetencyId, error: rpcErr } = await supabase.rpc(
          "chair_create_competency",
          {
            p_name: nameTrim,
            p_difficulty: propDifficulty,
            p_tags: propTagIds,
            p_subgoal_id: propSubgoalId,
          },
        );
        if (rpcErr) throw rpcErr;
        if (!newCompetencyId) {
          throw new Error("Failed to add competency.");
        }
        const { data: inserted, error } = await supabase
          .from("competencies")
          .select("id, name, difficulty, tags, position, subgoal_id, created_at")
          .eq("id", newCompetencyId)
          .single<Competency>();
        if (error) throw error;

        const resolvedTags = (inserted.tags ?? [])
          .map((id) => tagsCatalog.find((t) => t.id === id)?.name)
          .filter((v): v is string => Boolean(v));
        setRows((prev) => [
          ...prev,
          {
            ...inserted,
            tags: resolvedTags,
          },
        ]);
      } else {
        const { error } = await supabase.from("competencies_stage").insert({
          name: nameTrim,
          difficulty: propDifficulty,
          tags: propTagIds,
          justification: propReason.trim() || null,
          suggested_by: uid,
          subgoal_id: propSubgoalId,
        });
        if (error) throw error;
      }
      closeProposeModal();
      setPropName("");
      setPropTagIds([]);
      setPropDifficulty("Intermediate");
      setPropReason("");
      setPropBypass(false);
      setPropDomainId("");
      setPropSubgoalId("");
      showToast(
        directInsert
          ? "Competency added directly."
          : "Competency proposal submitted.",
      );
    } catch (e) {
      setErr(getErrorMessage(e));
    } finally {
      setSubmitting(false);
    }
  }

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div className="h-screen overflow-hidden px-8 py-8 max-w-6xl mx-auto flex flex-col">
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
            {loading ? "Loading…" : `${rows.length} active competencies`}
          </p>
        </div>

        <div className="flex gap-2 flex-shrink-0 mt-1">
          {isChair && (
            <button
              onClick={openReorderModal}
              className="flex items-center gap-2 px-4 py-2.5 rounded-full text-sm font-semibold border border-[var(--border)] bg-[var(--surface)] text-[var(--foreground)] transition-all hover:border-[color:var(--accent)] hover:text-[var(--accent)]"
            >
              Reorder competencies
            </button>
          )}
          <button
            onClick={() => setProposeOpen(true)}
            className="flex items-center gap-2 px-4 py-2.5 rounded-full text-sm font-semibold text-white transition-all hover:opacity-90 hover:shadow-[0_0_12px_color-mix(in_oklab,var(--accent)_40%,transparent)]"
            style={{ background: "var(--accent)" }}
          >
            <Plus size={15} />
            Propose Competency
          </button>
        </div>
      </div>

      {err && (
        <div className="mb-4 rounded-2xl border border-[color:var(--err)]/30 bg-[color:var(--err)]/10 px-4 py-3 text-sm text-[var(--err)]">
          {err}
        </div>
      )}

      {/* Filters */}
      <div className="mb-5 flex-shrink-0">
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
                      : [...prev, t],
                  )
                }
                className={cls(
                  "rounded-full px-2.5 py-0.5 text-[11px] border transition-all",
                  tagFilters.includes(t)
                    ? "border-[color:var(--accent)] bg-[color:var(--accent)]/15 text-[var(--accent)]"
                    : "border-[var(--border)] bg-[var(--field)] text-[var(--foreground)] hover:border-[color:var(--accent)] hover:text-[var(--accent)]",
                )}
              >
                #{t}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Domain cards */}
      <div className="min-h-0 flex-1 overflow-auto">
        {loading ? (
          <div className="text-sm text-[var(--muted)]">Loading…</div>
        ) : list.length === 0 ? (
          <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] px-4 py-8 text-center text-sm text-[var(--muted)]">
            No competencies match your filters.
          </div>
        ) : (
          <div className="flex flex-col gap-3 pb-4">
            {groupedList.domains.map(({ domain, subgoals: sgs }) => {
              const dExpanded = expandedDomains.has(domain.id);
              const compCount = sgs.reduce((n, sg) => n + sg.comps.length, 0);
              return (
                <section
                  key={domain.id}
                  className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] overflow-hidden"
                >
                  <button
                    onClick={() => toggleDomain(domain.id)}
                    aria-expanded={dExpanded}
                    className="w-full flex items-center justify-between gap-3 px-5 py-4 hover:bg-[color:var(--accent)]/4 transition-colors"
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <ChevronDown
                        size={18}
                        className={cls(
                          "flex-shrink-0 text-[var(--muted)] transition-transform",
                          !dExpanded && "-rotate-90",
                        )}
                      />
                      <h2
                        className="text-base font-bold tracking-tight text-[var(--foreground)] text-left truncate"
                        style={{ fontFamily: "var(--font-heading, sans-serif)" }}
                      >
                        <span className="text-[var(--accent)]">
                          {domain.code}.
                        </span>{" "}
                        {domain.name}
                      </h2>
                    </div>
                    <span className="flex-shrink-0 text-xs text-[var(--muted)]">
                      {compCount} competenc{compCount === 1 ? "y" : "ies"}
                    </span>
                  </button>

                  {dExpanded && (
                    <div className="border-t border-[var(--border)]">
                      {sgs.map(({ subgoal, comps }) => {
                        const sgExpanded = expandedSubgoals.has(subgoal.id);
                        return (
                          <div
                            key={subgoal.id}
                            className="border-t border-[var(--border)] first:border-t-0"
                          >
                            <button
                              onClick={() => toggleSubgoal(subgoal.id)}
                              aria-expanded={sgExpanded}
                              className="w-full flex items-center justify-between gap-3 px-5 py-2.5 bg-[color:var(--accent)]/6 border-l-2 border-[color:var(--accent)]/40 hover:bg-[color:var(--accent)]/12 transition-colors"
                            >
                              <div className="flex items-center gap-2.5 min-w-0">
                                <ChevronDown
                                  size={14}
                                  className={cls(
                                    "flex-shrink-0 text-[var(--accent)] transition-transform",
                                    !sgExpanded && "-rotate-90",
                                  )}
                                />
                                <h3 className="text-xs font-semibold uppercase tracking-[0.14em] text-[var(--muted)] text-left truncate">
                                  <span className="text-[var(--accent)]">
                                    {subgoal.code}
                                  </span>{" "}
                                  {subgoal.name}
                                </h3>
                              </div>
                              <span className="flex-shrink-0 text-[11px] text-[var(--muted)]">
                                {comps.length} competenc
                                {comps.length === 1 ? "y" : "ies"}
                              </span>
                            </button>

                            {sgExpanded && (
                              <div className="overflow-x-auto">
                                <table className="min-w-full text-sm">
                                  <tbody>
                                    {comps.length === 0 ? (
                                      <tr>
                                        <td
                                          colSpan={5}
                                          className="px-5 py-3 text-xs italic text-[var(--muted)]"
                                        >
                                          No competencies in this subgoal yet.
                                        </td>
                                      </tr>
                                    ) : (
                                      comps.map((c) => (
                                        <CompetencyRow
                                          key={c.id}
                                          c={c}
                                          questionCount={
                                            questionsByComp[c.id]?.length ?? 0
                                          }
                                          onPreview={() =>
                                            setQuestionPreviewComp(c)
                                          }
                                        />
                                      ))
                                    )}
                                  </tbody>
                                </table>
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </section>
              );
            })}

            {groupedList.unassigned.length > 0 && (() => {
              const dExpanded = expandedDomains.has(UNASSIGNED_KEY);
              return (
                <section className="rounded-2xl border-2 border-[color:var(--warn)]/40 bg-[var(--surface)] overflow-hidden">
                  <button
                    onClick={() => toggleDomain(UNASSIGNED_KEY)}
                    aria-expanded={dExpanded}
                    className="w-full flex items-center justify-between gap-3 px-5 py-4 bg-[color:var(--warn)]/8 hover:bg-[color:var(--warn)]/14 transition-colors"
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <ChevronDown
                        size={18}
                        className={cls(
                          "flex-shrink-0 text-[var(--muted)] transition-transform",
                          !dExpanded && "-rotate-90",
                        )}
                      />
                      <div className="min-w-0">
                        <h2
                          className="text-base font-bold tracking-tight text-[var(--foreground)] text-left"
                          style={{
                            fontFamily: "var(--font-heading, sans-serif)",
                          }}
                        >
                          Unassigned competencies
                        </h2>
                        <p className="mt-0.5 text-xs text-[var(--warn)] text-left">
                          Needs categorizing — not yet linked to a subgoal.
                        </p>
                      </div>
                    </div>
                    <span className="flex-shrink-0 text-xs text-[var(--muted)]">
                      {groupedList.unassigned.length} competenc
                      {groupedList.unassigned.length === 1 ? "y" : "ies"}
                    </span>
                  </button>

                  {dExpanded && (
                    <div className="border-t border-[var(--border)] overflow-x-auto">
                      <table className="min-w-full text-sm">
                        <tbody>
                          {groupedList.unassigned.map((c) => (
                            <CompetencyRow
                              key={c.id}
                              c={c}
                              questionCount={
                                questionsByComp[c.id]?.length ?? 0
                              }
                              onPreview={() => setQuestionPreviewComp(c)}
                            />
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </section>
              );
            })()}
          </div>
        )}
      </div>

      {questionPreviewComp && (
        <div
          role="dialog"
          aria-modal="true"
          onClick={() => setQuestionPreviewComp(null)}
          className="fixed inset-0 z-50 grid place-items-center bg-black/50 px-4"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-3xl max-h-[90vh] overflow-y-auto rounded-2xl border border-[var(--border)] bg-[var(--surface)] shadow-2xl p-6"
          >
            <div className="mb-4 flex items-center justify-between border-b border-[var(--border)] pb-4">
              <div>
                <h3 className="text-base font-semibold text-[var(--foreground)]">
                  Competency Questions
                </h3>
                <p className="mt-1 text-sm text-[var(--muted)]">
                  {questionPreviewComp.name}
                </p>
              </div>
              <button
                onClick={() => setQuestionPreviewComp(null)}
                className="h-8 w-8 grid place-items-center rounded-full border border-[var(--border)] bg-[var(--field)] text-[var(--foreground)] transition-all hover:border-[color:var(--accent)] hover:text-[var(--accent)]"
              >
                <X size={14} />
              </button>
            </div>

            <div className="space-y-4">
              {(questionsByComp[questionPreviewComp.id] ?? []).map((question, index) => (
                <div
                  key={question.id}
                  className="rounded-2xl border border-[var(--border)] bg-[var(--field)] p-4"
                >
                  <div className="flex items-start gap-3">
                    <span className="mt-0.5 inline-flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full border border-[var(--border)] bg-[var(--surface)] text-[10px] font-bold text-[var(--muted)]">
                      {index + 1}
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-semibold text-[var(--foreground)] leading-snug">
                        {question.body}
                      </p>
                      <p className="mt-1 text-[11px] text-[var(--muted)]">
                        Added {new Date(question.created_at).toLocaleDateString()}
                      </p>
                    </div>
                  </div>

                  <div className="mt-3 grid gap-2 sm:grid-cols-2">
                    {question.options.map((option) => (
                      <div
                        key={`${question.id}_${option.label}`}
                        className={cls(
                          "flex items-start gap-2.5 rounded-xl border px-3 py-2 text-xs",
                          option.is_correct
                            ? "border-[color:var(--ok)]/50 bg-[color:var(--ok)]/10 text-[var(--foreground)]"
                            : "border-[var(--border)] bg-[var(--surface)] text-[var(--muted)]",
                        )}
                      >
                        <span
                          className={cls(
                            "font-bold flex-shrink-0",
                            option.is_correct
                              ? "text-[var(--ok)]"
                              : "text-[var(--muted)]",
                          )}
                        >
                          {option.label}
                        </span>
                        <span className="leading-snug">{option.body}</span>
                        {option.is_correct && (
                          <span className="ml-auto flex-shrink-0 text-[var(--ok)] font-semibold">
                            Correct
                          </span>
                        )}
                      </div>
                    ))}
                  </div>

                  {question.media.length > 0 && (
                    <div className="mt-3 rounded-xl border border-[var(--border)] bg-[var(--surface)] p-3">
                      <p className="mb-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-[var(--muted)]">
                        Media
                      </p>
                      <div className="grid gap-3 sm:grid-cols-2">
                        {question.media.map((item) => {
                          const kind = (item.file_type ?? "").toLowerCase();
                          const isImage =
                            kind === "image" ||
                            (item.mime_type ?? "").startsWith("image/");
                          const isVideo =
                            kind === "video" ||
                            (item.mime_type ?? "").startsWith("video/");

                          if (isImage && item.signed_url) {
                            return (
                              <a
                                key={item.id}
                                href={item.signed_url}
                                target="_blank"
                                rel="noreferrer"
                                className="block overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--field)] transition-all hover:border-[color:var(--accent)]"
                              >
                                {/* eslint-disable-next-line @next/next/no-img-element */}
                                <img
                                  src={item.signed_url}
                                  alt={item.file_name}
                                  className="max-h-[28rem] w-full object-contain bg-black/5"
                                />
                                <div className="border-t border-[var(--border)] px-3 py-2 text-xs text-[var(--muted)]">
                                  {item.file_name}
                                </div>
                              </a>
                            );
                          }

                          if (isVideo && item.signed_url) {
                            return (
                              <div
                                key={item.id}
                                className="overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--field)]"
                              >
                                <video
                                  controls
                                  className="max-h-[28rem] w-full bg-black"
                                  src={item.signed_url}
                                />
                                <div className="border-t border-[var(--border)] px-3 py-2 text-xs text-[var(--muted)]">
                                  {item.file_name}
                                </div>
                              </div>
                            );
                          }

                          return (
                            <a
                              key={item.id}
                              href={item.signed_url ?? "#"}
                              target="_blank"
                              rel="noreferrer"
                              className="flex items-center justify-between gap-3 rounded-xl border border-[var(--border)] bg-[var(--field)] px-3 py-3 text-xs text-[var(--foreground)] transition-all hover:border-[color:var(--accent)]"
                            >
                              <div className="min-w-0">
                                <p className="truncate font-medium">
                                  {item.file_name}
                                </p>
                                <p className="mt-0.5 text-[var(--muted)]">
                                  Open attachment
                                </p>
                              </div>
                              <Paperclip
                                size={14}
                                className="flex-shrink-0 text-[var(--muted)]"
                              />
                            </a>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ── Chair: Reorder Competencies Modal ── */}
      {reorderOpen && isChair && (
        <div
          role="dialog"
          aria-modal="true"
          onClick={() => setReorderOpen(false)}
          className="fixed inset-0 z-50 grid place-items-center bg-black/50 px-4"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-3xl h-[min(90vh,860px)] rounded-2xl border border-[var(--border)] bg-[var(--surface)] shadow-2xl p-6 flex flex-col"
          >
            <div className="mb-4 flex items-center justify-between border-b border-[var(--border)] pb-4">
              <h3 className="text-base font-semibold text-[var(--foreground)]">
                Reorder competencies
              </h3>
              <button
                onClick={() => setReorderOpen(false)}
                className="h-8 w-8 grid place-items-center rounded-full border border-[var(--border)] bg-[var(--field)] text-[var(--foreground)] transition-all hover:border-[color:var(--accent)] hover:text-[var(--accent)]"
              >
                <X size={14} />
              </button>
            </div>

            <p className="text-sm text-[var(--muted)] mb-3">
              Drag to reorder within a subgoal or move between subgoals in the
              same domain. Cross-domain moves are blocked.
            </p>

            <div className="space-y-4 flex-1 overflow-y-auto pr-1">
              {groupedDraft.domains.map(({ domain, subgoals: sgs }) => {
                const dimmed =
                  dragSourceDomainId !== null &&
                  dragSourceDomainId !== domain.id;
                return (
                  <section
                    key={domain.id}
                    className={cls(
                      "rounded-xl border-2 transition-opacity",
                      dimmed
                        ? "opacity-40 pointer-events-none border-[var(--border)]"
                        : "border-[color:var(--accent)]/30",
                    )}
                  >
                    <header className="px-3 py-2 border-b-2 border-[color:var(--accent)]/20 bg-[color:var(--accent)]/8 rounded-t-xl">
                      <h2
                        className="text-sm font-bold tracking-tight text-[var(--foreground)]"
                        style={{ fontFamily: "var(--font-heading, sans-serif)" }}
                      >
                        <span className="text-[var(--accent)]">{domain.code}.</span>{" "}
                        {domain.name}
                      </h2>
                    </header>
                    <div className="p-2 space-y-3">
                      {sgs.map(({ subgoal, comps }) => (
                        <div
                          key={subgoal.id}
                          onDragOver={(e) => onSubgoalDragOver(e, subgoal)}
                          onDrop={(e) => onSubgoalDrop(e, subgoal)}
                          className="rounded-lg bg-[var(--field)]/30 p-2"
                        >
                          <h3 className="px-1 pb-1.5 text-[11px] font-semibold uppercase tracking-[0.14em] text-[var(--muted)]">
                            <span className="text-[var(--foreground)]">
                              {subgoal.code}
                            </span>{" "}
                            {subgoal.name}
                          </h3>
                          <div className="space-y-1.5">
                            {comps.length === 0 && (
                              <div className="rounded-lg border border-dashed border-[var(--border)] bg-[var(--surface)]/40 px-3 py-3 text-[11px] italic text-[var(--muted)]">
                                Empty — drop here to add competencies.
                              </div>
                            )}
                            {comps.map((c) => {
                              const idx = reorderDraft.findIndex(
                                (r) => r.id === c.id,
                              );
                              const isDragging = dragIndex === idx;
                              const isDropTarget =
                                dropIndex === idx &&
                                dragIndex !== null &&
                                dragIndex !== idx;
                              return (
                                <div
                                  key={c.id}
                                  draggable
                                  onDragStart={(e) => onRowDragStart(e, c)}
                                  onDragOver={(e) => onRowDragOver(e, c)}
                                  onDrop={(e) => onRowDrop(e, c)}
                                  onDragEnd={clearDragState}
                                  className={cls(
                                    "flex items-start gap-3 rounded-lg border px-3 py-2.5 min-h-[64px] transition-all duration-150 bg-[var(--surface)]",
                                    isDragging &&
                                      "border-[color:var(--accent)]/70 opacity-65 scale-[0.995]",
                                    isDropTarget &&
                                      "border-[color:var(--accent)]/70 bg-[var(--field)]/90",
                                    !isDragging &&
                                      !isDropTarget &&
                                      "border-[var(--border)]",
                                  )}
                                >
                                  <span className="w-8 text-xs text-[var(--muted)] text-right pt-0.5 select-none">
                                    {c.position ?? "—"}
                                  </span>
                                  <div className="flex-1 min-w-0">
                                    <p className="text-sm font-medium text-[var(--foreground)] leading-snug line-clamp-2">
                                      {c.name}
                                    </p>
                                    <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                                      <span
                                        className="inline-block rounded-full px-2 py-0.5 text-[10px] font-semibold"
                                        style={{
                                          background: diffColor(c.difficulty),
                                          color: "#000",
                                        }}
                                      >
                                        {c.difficulty}
                                      </span>
                                      {(c.tags ?? []).slice(0, 4).map((t) => (
                                        <span
                                          key={`${c.id}_${t}`}
                                          className="rounded-full border border-[var(--border)] bg-[var(--field)] px-2 py-0.5 text-[10px] text-[var(--muted)]"
                                        >
                                          #{t}
                                        </span>
                                      ))}
                                    </div>
                                  </div>
                                  <span
                                    className="pt-1 text-[var(--muted)] cursor-grab active:cursor-grabbing"
                                    title="Drag to reorder"
                                    aria-label={`Drag ${c.name} to reorder`}
                                  >
                                    <GripVertical size={16} />
                                  </span>
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      ))}
                    </div>
                  </section>
                );
              })}

              {groupedDraft.unassigned.length > 0 && (
                <section className="rounded-xl border-2 border-[color:var(--warn)]/30">
                  <header className="px-3 py-2 border-b-2 border-[color:var(--warn)]/20 bg-[color:var(--warn)]/8 rounded-t-xl">
                    <h2
                      className="text-sm font-bold tracking-tight text-[var(--foreground)]"
                      style={{ fontFamily: "var(--font-heading, sans-serif)" }}
                    >
                      Unassigned
                    </h2>
                    <p className="mt-0.5 text-[11px] text-[var(--muted)]">
                      Drag out to assign. Drops back here are blocked.
                    </p>
                  </header>
                  <div className="p-2 space-y-1.5">
                    {groupedDraft.unassigned.map((c) => {
                      const idx = reorderDraft.findIndex((r) => r.id === c.id);
                      const isDragging = dragIndex === idx;
                      return (
                        <div
                          key={c.id}
                          draggable
                          onDragStart={(e) => onRowDragStart(e, c)}
                          onDragEnd={clearDragState}
                          className={cls(
                            "flex items-start gap-3 rounded-lg border px-3 py-2.5 min-h-[64px] bg-[var(--surface)]",
                            isDragging
                              ? "border-[color:var(--accent)]/70 opacity-65"
                              : "border-[var(--border)]",
                          )}
                        >
                          <span className="w-8 text-xs text-[var(--muted)] text-right pt-0.5 select-none">
                            {c.position ?? "—"}
                          </span>
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium text-[var(--foreground)] leading-snug line-clamp-2">
                              {c.name}
                            </p>
                            <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                              <span
                                className="inline-block rounded-full px-2 py-0.5 text-[10px] font-semibold"
                                style={{
                                  background: diffColor(c.difficulty),
                                  color: "#000",
                                }}
                              >
                                {c.difficulty}
                              </span>
                            </div>
                          </div>
                          <span className="pt-1 text-[var(--muted)] cursor-grab active:cursor-grabbing">
                            <GripVertical size={16} />
                          </span>
                        </div>
                      );
                    })}
                  </div>
                </section>
              )}
            </div>

            <div className="mt-3 rounded-xl border border-[var(--border)] bg-[var(--field)] px-3 py-2 text-xs text-[var(--muted)] flex-shrink-0">
              {lastMove ? (() => {
                const newPos = new Map<string, number>();
                let i = 1;
                for (const d of groupedDraft.domains) {
                  for (const sg of d.subgoals) {
                    for (const c of sg.comps) newPos.set(c.id, i++);
                  }
                }
                for (const c of groupedDraft.unassigned) newPos.set(c.id, i++);
                const changedCount = reorderDraft.filter((c) =>
                  newPos.get(c.id) !== reorderInitialPos[c.id] ||
                  c.subgoal_id !== reorderInitialSubgoal[c.id],
                ).length;
                const recent = moveHistory.slice(-3).join(" · ");
                return (
                  <>
                    Recent:{" "}
                    <span className="font-semibold text-[var(--foreground)]">
                      {recent}
                    </span>{" "}
                    ·{" "}
                    <span className="font-semibold text-[var(--foreground)]">
                      {changedCount}
                    </span>{" "}
                    row{changedCount === 1 ? "" : "s"} changed
                  </>
                );
              })() : (
                "No changes yet."
              )}
            </div>

            <div className="flex justify-end gap-2 mt-4 flex-shrink-0">
              <button
                onClick={() => setReorderOpen(false)}
                className="rounded-full border border-[var(--border)] bg-[var(--surface)] px-4 py-2 text-sm text-[var(--foreground)] transition-all hover:border-[color:var(--accent)] hover:text-[var(--accent)]"
              >
                Cancel
              </button>
              <button
                onClick={saveReorder}
                disabled={reorderSaving}
                className="rounded-full px-4 py-2 text-sm font-semibold text-white disabled:opacity-60 transition-all hover:opacity-90 hover:shadow-[0_0_12px_color-mix(in_oklab,var(--accent)_40%,transparent)]"
                style={{ background: "var(--accent)" }}
              >
                {reorderSaving ? "Saving…" : "Save order"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Propose Competency Modal ── */}
      {proposeOpen && (
        <div
          role="dialog"
          aria-modal="true"
          onClick={closeProposeModal}
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
                onClick={closeProposeModal}
                className="h-8 w-8 grid place-items-center rounded-full border border-[var(--border)] bg-[var(--field)] text-[var(--foreground)] transition-all hover:border-[color:var(--accent)] hover:text-[var(--accent)]"
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
                      e.target.value as (typeof DIFF_ORDER)[number],
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

              <label className="grid gap-1 text-sm">
                <span className="text-[var(--muted)]">Domain *</span>
                <select
                  value={propDomainId}
                  onChange={(e) => {
                    setPropDomainId(e.target.value);
                    setPropSubgoalId("");
                  }}
                  className="rounded-2xl border border-[var(--border)] bg-[var(--field)] px-3 py-2 text-sm outline-none w-full"
                >
                  <option value="">Select a domain…</option>
                  {sortedDomains.map((d) => (
                    <option key={d.id} value={d.id}>
                      {d.code}. {d.name}
                    </option>
                  ))}
                </select>
              </label>

              <label className="grid gap-1 text-sm">
                <span className="text-[var(--muted)]">Subgoal *</span>
                <select
                  value={propSubgoalId}
                  onChange={(e) => setPropSubgoalId(e.target.value)}
                  disabled={!propDomainId}
                  className="rounded-2xl border border-[var(--border)] bg-[var(--field)] px-3 py-2 text-sm outline-none w-full disabled:opacity-60"
                >
                  <option value="">
                    {propDomainId ? "Select a subgoal…" : "Choose a domain first"}
                  </option>
                  {(subgoalsByDomain.get(propDomainId) ?? []).map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.code} {s.name}
                    </option>
                  ))}
                </select>
              </label>

              {tagsCatalog.length > 0 && (
                <div className="grid gap-2 text-sm">
                  <span className="text-[var(--muted)]">Tags *</span>
                  <div className="flex flex-wrap gap-1.5">
                    {tagsCatalog.map((t) => (
                      <button
                        key={t.id}
                        type="button"
                        onClick={() =>
                          setPropTagIds((prev) =>
                            prev.includes(t.id)
                              ? prev.filter((x) => x !== t.id)
                              : [...prev, t.id],
                          )
                        }
                        className={cls(
                          "rounded-full px-2.5 py-0.5 text-[11px] border transition-all",
                          propTagIds.includes(t.id)
                            ? "border-[color:var(--accent)] bg-[color:var(--accent)]/15 text-[var(--accent)]"
                            : "border-[var(--border)] bg-[var(--field)] text-[var(--foreground)] hover:border-[color:var(--accent)] hover:text-[var(--accent)]",
                        )}
                      >
                        #{t.name}
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

              {isChair && (
                <label className="flex items-center gap-2 text-sm text-gray-600 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={propBypass}
                    onChange={(e) => setPropBypass(e.target.checked)}
                    className="w-4 h-4 rounded border-gray-300 text-[#5170ff] focus:ring-[#5170ff]"
                  />
                  Skip review and publish directly
                </label>
              )}

              <div className="flex justify-end gap-2 mt-1">
                <button
                  onClick={closeProposeModal}
                  className="rounded-full border border-[var(--border)] bg-[var(--surface)] px-4 py-2 text-sm text-[var(--foreground)] transition-all hover:border-[color:var(--accent)] hover:text-[var(--accent)]"
                >
                  Cancel
                </button>
                <button
                  onClick={handlePropose}
                  disabled={submitting}
                  className="rounded-full px-4 py-2 text-sm font-semibold text-white disabled:opacity-60 transition-all hover:opacity-90 hover:shadow-[0_0_12px_color-mix(in_oklab,var(--accent)_40%,transparent)]"
                  style={{ background: "var(--accent)" }}
                >
                  {submitting ? "Submitting…" : "Submit proposal"}
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
