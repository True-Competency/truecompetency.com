// src/app/instructor/page.client.tsx
"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";
import { useTheme } from "next-themes";

/* ---------------- Types ---------------- */
type TraineeProfile = {
  id: string;
  email: string | null;
  first_name: string | null;
  last_name: string | null;
  role: string;
};

type MeProfile = {
  id: string;
  email: string | null;
  first_name: string | null;
  last_name: string | null;
  role: string;
  hospital: string | null;
  country_name: string | null;
  country_code: string | null;
  avatar_path: string | null;
};

type ProgressRow = { student_id: string; pct: number };
type AssignRow = { student_id: string; competency_id: string };

type StudentRow = {
  id: string;
  name: string;
  email: string;
  avgPct: number;
  assessments: number;
  lastAnsweredAt: string | null;
  assignedCount: number;
  completedCount: number;
};

type Competency = {
  id: string;
  name: string | null;
  difficulty: string | null; // beginner | intermediate | expert
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

/* ---------------- Page ---------------- */
export default function InstructorClient() {
  const router = useRouter();
  const { resolvedTheme } = useTheme();
  const tcipLogoSrc =
    resolvedTheme === "dark" ? "/TCIP_White_Logo.png" : "/TCIP_Black_Logo.png";

  /* --- State --- */
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  const [greeting, setGreeting] = useState<string>("");

  const [students, setStudents] = useState<StudentRow[]>([]);
  const [studentsQ, setStudentsQ] = useState("");

  // --- Me + assign modal state ---
  const [meProfile, setMeProfile] = useState<MeProfile | null>(null);

  // Assign modal
  const [assignOpen, setAssignOpen] = useState(false);
  const [assignErr, setAssignErr] = useState<string | null>(null);
  const [assignLoading, setAssignLoading] = useState(false);
  const [selectedTrainees, setSelectedTrainees] = useState<Set<string>>(
    new Set()
  );
  const [traineesQ, setTraineesQ] = useState("");
  const [assignDiff, setAssignDiff] = useState<
    "all" | "beginner" | "intermediate" | "expert"
  >("all");
  const [assignTags, setAssignTags] = useState<Set<string>>(new Set());
  const [assignQ, setAssignQ] = useState("");
  const [selectedCompetencies, setSelectedCompetencies] = useState<Set<string>>(
    new Set()
  );

  // ----------- displayDr and initials -----------
  const displayDr = useMemo(() => {
    if (!meProfile) return "Instructor";
    const ln = (meProfile.last_name ?? "").trim();
    const fn = (meProfile.first_name ?? "").trim();
    if (ln) return `Dr. ${ln}`;
    if (fn) return `Dr. ${fn}`;
    return "Instructor";
  }, [meProfile]);

  const initials = useMemo(() => {
    const ln = (meProfile?.last_name ?? "").trim();
    const fn = (meProfile?.first_name ?? "").trim();
    const parts = [fn, ln].filter(Boolean);
    if (parts.length) {
      return (
        parts
          .map((p) => p[0]?.toUpperCase() ?? "")
          .join("")
          .slice(0, 2) || "DR"
      );
    }
    const em = (meProfile?.email ?? "").trim();
    if (em) return em[0]?.toUpperCase() ?? "DR";
    return "DR";
  }, [meProfile]);

  const meAvatarUrl = useMemo(() => {
    if (!meProfile?.avatar_path) return "";
    return supabase.storage
      .from("profile-pictures")
      .getPublicUrl(meProfile.avatar_path).data.publicUrl;
  }, [meProfile?.avatar_path]);

  // Competencies (used for assign modal)
  const [competencies, setCompetencies] = useState<Competency[]>([]);
  const [tagOptions, setTagOptions] = useState<string[]>([]);

  // KPI widgets
  const [kpiActiveTrainees, setKpiActiveTrainees] = useState(0);
  const [kpiPendingAssessments, setKpiPendingAssessments] = useState(0);
  const [kpiAvgProgramScore, setKpiAvgProgramScore] = useState(0);
  const [kpiThisMonthAssessments, setKpiThisMonthAssessments] = useState(0);

  /* --- Load main data (greeting + trainees + KPIs) --- */
  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        setErr(null);
        setLoading(true);

        // Me (greeting)
        const { data: userRes, error: getUserErr } =
          await supabase.auth.getUser();
        if (getUserErr) throw getUserErr;
        const uid = userRes.user?.id ?? null;
        if (!uid) {
          router.replace("/signin?redirect=/instructor");
          return;
        }
        const { data: me, error: meErr } = await supabase
          .from("profiles")
          .select(
            "id, email, first_name, last_name, role, hospital, country_name, country_code, avatar_path"
          )
          .eq("id", uid)
          .single<MeProfile>();
        if (meErr) throw meErr;

        let finalMe = me;

        // If country_name is missing but code exists, fetch full name from countries table
        if (!me.country_name && me.country_code) {
          const { data: cRow } = await supabase
            .from("countries")
            .select("name")
            .eq("code", me.country_code)
            .maybeSingle<{ name: string }>();

          if (cRow?.name) {
            finalMe = { ...me, country_name: cRow.name };
          }
        }

        setMeProfile(finalMe);

        const drName =
          (me?.last_name
            ? `Dr. ${me.last_name}`
            : me?.first_name
            ? `Dr. ${me.first_name}`
            : "") || "";
        if (!cancelled) setGreeting(drName);

        // Trainees
        const { data: pRows, error: pErr } = await supabase
          .from("profiles")
          .select("id, email, first_name, last_name, role")
          .eq("role", "trainee")
          .returns<TraineeProfile[]>();
        if (pErr) throw pErr;

        const traineeIds = (pRows ?? []).map((p) => p.id);
        const nameFor = (t: TraineeProfile) =>
          [t.first_name ?? "", t.last_name ?? ""].join(" ").trim() ||
          "Unnamed trainee";

        const baseStudents: StudentRow[] = (pRows ?? []).map((t) => ({
          id: t.id,
          name: nameFor(t),
          email: t.email ?? "",
          avgPct: 0,
          assessments: 0,
          lastAnsweredAt: null,
          assignedCount: 0,
          completedCount: 0,
        }));

        // Progress aggregates
        const avgById = new Map<string, { sum: number; count: number }>();
        const completedById = new Map<string, number>();

        if (traineeIds.length > 0) {
          const { data: progress, error: prErr } = await supabase
            .from("student_competency_progress")
            .select("student_id, pct")
            .in("student_id", traineeIds)
            .returns<ProgressRow[]>();
          if (prErr) throw prErr;

          (progress ?? []).forEach((r) => {
            const cur = avgById.get(r.student_id) ?? { sum: 0, count: 0 };
            cur.sum += r.pct;
            cur.count += 1;
            avgById.set(r.student_id, cur);
            if (r.pct >= 100) {
              completedById.set(
                r.student_id,
                (completedById.get(r.student_id) ?? 0) + 1
              );
            }
          });
        }

        // Assignments (counts)
        const assignedById = new Map<string, number>();
        if (traineeIds.length > 0) {
          const { data: assigns, error: aErr } = await supabase
            .from("competency_assignments")
            .select("student_id, competency_id")
            .in("student_id", traineeIds)
            .returns<AssignRow[]>();
          if (aErr) throw aErr;

          (assigns ?? []).forEach((r) => {
            assignedById.set(
              r.student_id,
              (assignedById.get(r.student_id) ?? 0) + 1
            );
          });
        }

        // Answers (assessments + last date)
        const answersById = new Map<
          string,
          { count: number; last: string | null }
        >();
        if (traineeIds.length > 0) {
          const { data: answers, error: ansErr } = await supabase
            .from("student_answers")
            .select("student_id, answered_at")
            .in("student_id", traineeIds)
            .order("answered_at", { ascending: false });
          if (ansErr) throw ansErr;

          for (const row of answers ?? []) {
            const key = row.student_id as string;
            const cur = answersById.get(key) ?? { count: 0, last: null };
            cur.count += 1;
            if (!cur.last) cur.last = row.answered_at as string;
            answersById.set(key, cur);
          }
        }

        // Merge rows
        const merged: StudentRow[] = baseStudents.map((s) => {
          const agg = avgById.get(s.id);
          const avgPct =
            agg && agg.count > 0 ? Math.round(agg.sum / agg.count) : 0;

          const a = answersById.get(s.id);
          const assigned = assignedById.get(s.id) ?? 0;
          const completed = completedById.get(s.id) ?? 0;

          return {
            ...s,
            avgPct,
            assessments: a?.count ?? 0,
            lastAnsweredAt: a?.last ?? null,
            assignedCount: assigned,
            completedCount: completed,
          };
        });

        merged.sort((a, b) => a.name.localeCompare(b.name));
        if (!cancelled) setStudents(merged);

        // KPIs
        if (!cancelled) {
          setKpiActiveTrainees(merged.length);

          const monthStart = new Date();
          monthStart.setDate(1);

          const { count: pendingCount } = await supabase
            .from("student_answers")
            .select("question_id", { head: true, count: "exact" })
            .is("is_correct", null);
          setKpiPendingAssessments(pendingCount ?? 0);

          const avgProg =
            merged.length > 0
              ? Math.round(
                  merged.reduce((s, r) => s + (r.avgPct || 0), 0) /
                    merged.length
                )
              : 0;
          setKpiAvgProgramScore(avgProg);

          const { count: monthCount } = await supabase
            .from("student_answers")
            .select("question_id", { head: true, count: "exact" })
            .gte("answered_at", monthStart.toISOString());
          setKpiThisMonthAssessments(monthCount ?? 0);
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
  }, [router]);

  /* --- Fetch competencies whenever assign modal opens (always, not just first time) --- */
  useEffect(() => {
    // load when assign modal that needs competencies is open
    if (!assignOpen) return;
    let cancelled = false;

    (async () => {
      try {
        // No longer using compsErr/compsLoading for browse modal
        const [{ data: comps, error: cErr }, { data: tagsData, error: tagsErr }] =
          await Promise.all([
            supabase
              .from("competencies")
              .select("id, name, difficulty, tags, position")
              .order("position", { ascending: true, nullsFirst: false }),
            supabase.from("tags").select("id, name").order("name", { ascending: true }),
          ]);
        if (cErr) throw cErr;
        if (tagsErr) throw tagsErr;

        const tagNameById = new Map(
          ((tagsData ?? []) as TagRow[]).map((t) => [t.id, t.name]),
        );
        const compsResolved = ((comps ?? []) as CompetencyRaw[]).map((c) => ({
          ...c,
          tags: (c.tags ?? [])
            .map((id) => tagNameById.get(id))
            .filter((v): v is string => Boolean(v)),
        }));

        if (!cancelled) {
          setCompetencies(compsResolved);
          setTagOptions(((tagsData ?? []) as TagRow[]).map((t) => t.name));
        }
      } catch {
        // No longer using compsErr/compsLoading for browse modal
      } finally {
        // No longer using compsErr/compsLoading for browse modal
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [assignOpen]);

  /* --- Derived filters --- */
  const filteredStudents = useMemo(() => {
    const q = studentsQ.trim().toLowerCase();
    if (!q) return students;
    return students.filter(
      (s) =>
        s.name.toLowerCase().includes(q) || s.email.toLowerCase().includes(q)
    );
  }, [studentsQ, students]);

  const allCompTags = useMemo(() => tagOptions, [tagOptions]);

  // Derived list of trainees for Assign modal
  const filteredTraineesForAssign = useMemo(() => {
    const q = traineesQ.trim().toLowerCase();
    let list = students;
    if (q) {
      list = list.filter(
        (s) =>
          s.name.toLowerCase().includes(q) || s.email.toLowerCase().includes(q)
      );
    }
    return list;
  }, [traineesQ, students]);

  // Derived list of competencies for Assign modal
  const assignableComps = useMemo(() => {
    let list = competencies;

    if (assignDiff !== "all") {
      list = list.filter(
        (c) => (c.difficulty ?? "").toLowerCase() === assignDiff
      );
    }
    if (assignTags.size > 0) {
      list = list.filter((c) => {
        const set = new Set(c.tags ?? []);
        for (const t of assignTags) if (!set.has(t)) return false;
        return true;
      });
    }
    const q = assignQ.trim().toLowerCase();
    if (q) {
      list = list.filter((c) => {
        const hay =
          (c.name ?? "") +
          " " +
          (c.difficulty ?? "") +
          " " +
          (c.tags ?? []).join(" ");
        return hay.toLowerCase().includes(q);
      });
    }
    return list;
  }, [competencies, assignDiff, assignTags, assignQ]);

  /* --- UI helpers --- */

  const toggleAssignTag = (t: string) =>
    setAssignTags((prev) => {
      const next = new Set(prev);
      if (next.has(t)) next.delete(t);
      else next.add(t);
      return next;
    });

  const toggleTrainee = (id: string) =>
    setSelectedTrainees((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const toggleSelectedCompetency = (id: string) =>
    setSelectedCompetencies((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const selectAllFilteredTrainees = () => {
    setSelectedTrainees(new Set(filteredTraineesForAssign.map((t) => t.id)));
  };
  const clearSelectedTrainees = () => setSelectedTrainees(new Set());

  /* ---------------- Render ---------------- */
  async function assignToSelected() {
    try {
      setAssignErr(null);
      setAssignLoading(true);
      if (selectedTrainees.size === 0)
        throw new Error("Select at least one trainee.");
      const { data: userRes, error: getUserErr } =
        await supabase.auth.getUser();
      if (getUserErr) throw getUserErr;
      const caller = userRes.user?.id;
      if (!caller) throw new Error("Not authenticated.");

      const compsToAssign =
        selectedCompetencies.size > 0
          ? assignableComps.filter((c) => selectedCompetencies.has(c.id))
          : assignableComps;
      if (compsToAssign.length === 0)
        throw new Error("No competencies selected or matching filters.");
      const payload: Array<{
        student_id: string;
        competency_id: string;
        assigned_by: string;
      }> = [];

      for (const sid of selectedTrainees) {
        for (const c of compsToAssign) {
          payload.push({
            student_id: sid,
            competency_id: c.id,
            assigned_by: caller,
          });
        }
      }

      // Upsert with conflict on (student_id, competency_id)
      const { error: upErr } = await supabase
        .from("competency_assignments")
        .upsert(payload, {
          onConflict: "student_id,competency_id",
          ignoreDuplicates: true,
        });
      if (upErr) throw upErr;

      setAssignOpen(false);
      setSelectedTrainees(new Set());
      setAssignTags(new Set());
      setAssignDiff("all");
      setAssignQ("");
      setSelectedCompetencies(new Set());
    } catch (e) {
      setAssignErr(e instanceof Error ? e.message : String(e));
    } finally {
      setAssignLoading(false);
    }
  }

  return (
    <main className="bg-[var(--background)] text-[var(--foreground)]">
      {/* Header */}
      <section className="mx-auto max-w-6xl px-6 pt-8 pb-3">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl md:text-4xl font-semibold tracking-tight">
              {greeting ? `Welcome back, ${greeting}` : "Welcome back"}
            </h1>
            <div className="accent-underline mt-3" />
            <div className="mt-4 flex items-center gap-5">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src="/APSC_Logo.png"
                alt="Asian Pacific Society of Cardiology logo"
                className="h-20 w-auto object-contain"
              />
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={tcipLogoSrc}
                alt="TCIP logo"
                className="h-20 w-auto object-contain"
              />
            </div>
            <p className="mt-2 text-sm md:text-base text-[var(--muted)]">
              Asia Pacific Society of Cardiology TCIP IVUS Course
            </p>
          </div>

          {/* actions moved to profile card */}
          <div />
        </div>
      </section>

      {/* Profile Hero (match trainee look) */}
      <section className="mx-auto max-w-6xl px-6 pt-6 mb-5">
        <div
          className="rounded-2xl border bg-[var(--surface)] overflow-hidden transition will-change-transform"
          style={{
            borderColor:
              "color-mix(in oklab, var(--accent) 40%, var(--border))",
            boxShadow:
              "0 0 0 2px color-mix(in oklab, var(--accent) 22%, transparent), 0 8px 28px color-mix(in oklab, var(--accent) 18%, transparent)",
          }}
        >
          <div className="px-5 md:px-6 py-5 md:py-6">
            <div className="flex items-start justify-between gap-4">
              {/* left: avatar + text */}
              <div className="flex items-center gap-4">
                <div
                  className="h-16 w-16 md:h-20 md:w-20 rounded-full flex items-center justify-center text-white text-xl md:text-2xl font-semibold shadow-md ring-4 ring-[var(--surface)]"
                  style={{ background: "var(--accent)" }}
                >
                  {meAvatarUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={meAvatarUrl}
                      alt={displayDr}
                      className="h-full w-full object-cover rounded-full"
                    />
                  ) : (
                    initials
                  )}
                </div>
                <div className="min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <h2 className="text-xl md:text-2xl font-semibold tracking-tight break-words">
                      {displayDr}
                    </h2>
                    <span
                      className="text-[10px] md:text-xs font-medium rounded-full px-2 py-0.5 border bg-[var(--field)] text-[var(--foreground)]/90"
                      style={{
                        background:
                          "color-mix(in oklab, var(--accent) 15%, transparent)",
                        borderColor:
                          "color-mix(in oklab, var(--accent) 35%, transparent)",
                        color: "var(--accent)",
                      }}
                    >
                      Active Instructor
                    </span>
                  </div>
                  <p className="mt-1 text-xs md:text-sm text-[var(--muted)]">
                    Coach trainees, assign competencies, and review progress.
                  </p>
                  <div className="mt-1 flex items-center gap-4 text-xs md:text-sm text-[var(--muted)]">
                    <span className="inline-flex items-center gap-1.5">
                      {/* building icon */}
                      <svg
                        className="h-3.5 w-3.5"
                        viewBox="0 0 24 24"
                        fill="none"
                        aria-hidden
                      >
                        <path
                          d="M4 21h16M6 21V7a2 2 0 0 1 2-2h8v16M10 9h3M10 13h3M10 17h3"
                          stroke="currentColor"
                          strokeWidth="2"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        />
                      </svg>
                      {meProfile?.hospital ?? "—"}
                    </span>
                    <span className="inline-flex items-center gap-1.5">
                      {/* pin icon */}
                      <svg
                        className="h-3.5 w-3.5"
                        viewBox="0 0 24 24"
                        fill="none"
                        aria-hidden
                      >
                        <path
                          d="M12 21s6-5.686 6-10a6 6 0 1 0-12 0c0 4.314 6 10 6 10Z"
                          stroke="currentColor"
                          strokeWidth="2"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        />
                        <circle
                          cx="12"
                          cy="11"
                          r="2"
                          stroke="currentColor"
                          strokeWidth="2"
                        />
                      </svg>
                      {meProfile?.country_name ||
                        meProfile?.country_code ||
                        "—"}
                    </span>
                  </div>
                </div>
              </div>

              {/* right: Assign CTA */}
              <div className="shrink-0 flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setAssignOpen(true)}
                  className="inline-flex items-center gap-2 rounded-xl border-2 px-3.5 py-2 text-sm font-medium will-change-transform transition-transform duration-500 ease-out active:scale-[0.99] hover:scale-[1.03] hover:shadow-lg"
                  style={{
                    background: "var(--accent)",
                    color: "#fff",
                    borderColor: "var(--accent)",
                    transition:
                      "transform 300ms cubic-bezier(0.22,1,0.36,1), background-color 220ms ease, color 220ms ease, border-color 220ms ease",
                  }}
                  title="Assign or bulk-assign competencies"
                >
                  + Assign
                </button>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* KPI widgets */}
      <section className="mx-auto max-w-6xl px-6 pb-6">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <KPI
            title="Active Trainees"
            value={kpiActiveTrainees}
            sub="with accounts"
          />
          <KPI
            title="Pending Assessments"
            value={kpiPendingAssessments}
            sub="awaiting grading"
          />
          <KPI
            title="Avg Program Score"
            value={`${kpiAvgProgramScore}%`}
            sub="all trainees"
          />
          <KPI
            title="This Month"
            value={kpiThisMonthAssessments}
            sub="assessments submitted"
          />
        </div>
      </section>

      {/* Errors */}
      <section className="mx-auto max-w-6xl px-6">
        {err && (
          <div className="mb-4 rounded-xl border border-red-900/40 bg-red-950/40 px-4 py-3 text-sm text-red-200">
            {err}
          </div>
        )}
      </section>

      {/* Trainees list */}
      <section className="mx-auto max-w-6xl px-6 pb-10">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-lg md:text-xl font-semibold">Your Trainees</h2>
          <div className="rounded-xl border border-[var(--border)] bg-[var(--field)]">
            <input
              value={studentsQ}
              onChange={(e) => setStudentsQ(e.target.value)}
              placeholder="Search trainees by name or email…"
              className="w-72 bg-transparent px-3 py-2 text-sm outline-none placeholder:[color:var(--muted)]"
            />
          </div>
        </div>

        <div className="space-y-3">
          {loading &&
            Array.from({ length: 3 }).map((_, i) => (
              <div
                key={i}
                className="h-20 rounded-2xl border border-[var(--border)] bg-[var(--surface)] animate-pulse"
              />
            ))}

          {!loading && filteredStudents.length === 0 && (
            <div className="text-sm text-[var(--muted)]">
              No trainees found.
            </div>
          )}

          {!loading &&
            filteredStudents.map((s) => (
              <button
                key={s.id}
                onClick={() => router.push(`/instructor/trainee/${s.id}`)}
                className="w-full rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-4 text-left hover:shadow-md transition will-change-transform transition-transform hover:scale-[1.01]"
              >
                <div className="flex items-center justify-between gap-4">
                  <div className="min-w-0">
                    <div className="font-semibold truncate">{s.name}</div>
                    <div className="text-xs text-[var(--muted)] truncate">
                      {s.email}
                    </div>

                    <div className="mt-2 grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
                      <KPIInline label="Overall Progress">
                        <span className="font-semibold">{s.avgPct}%</span>
                        <div className="mt-1 h-1.5 w-36 overflow-hidden rounded-full bg-[var(--field)] border border-[var(--border)]">
                          <div
                            className="h-full"
                            style={{
                              width: `${s.avgPct}%`,
                              background: "var(--accent)",
                            }}
                          />
                        </div>
                      </KPIInline>

                      <KPIInline label="Competencies">
                        <span className="font-semibold">
                          {s.completedCount}/{s.assignedCount}
                        </span>
                      </KPIInline>

                      <KPIInline label="Total Assessments">
                        <span className="font-semibold">{s.assessments}</span>
                      </KPIInline>

                      <KPIInline label="Last Assessment">
                        <span className="font-semibold">
                          {s.lastAnsweredAt
                            ? new Date(s.lastAnsweredAt).toLocaleDateString()
                            : "—"}
                        </span>
                      </KPIInline>
                    </div>
                  </div>

                  {/* Chevron */}
                  <span
                    className="shrink-0 inline-flex h-9 w-9 items-center justify-center rounded-xl"
                    style={{ background: "var(--accent)", color: "white" }}
                    aria-hidden
                  >
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
                      <path
                        d="M9 18l6-6-6-6"
                        stroke="currentColor"
                        strokeWidth="2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                    </svg>
                  </span>
                </div>
              </button>
            ))}
        </div>
      </section>

      {/* Assign Modal */}
      {assignOpen && (
        <div className="fixed inset-0 z-50">
          <div
            className="absolute inset-0 bg-black/50 backdrop-blur-sm"
            onClick={() => setAssignOpen(false)}
          />
          <div className="absolute left-1/2 top-12 -translate-x-1/2 w-[min(100%,56rem)] mx-4 rounded-2xl border border-[var(--border)] bg-[var(--surface)] shadow-2xl">
            <div className="flex items-center justify-between px-5 py-4 border-b border-[var(--border)]">
              <h3 className="text-lg font-semibold">
                Assign competencies to trainee(s)
              </h3>
              <button
                type="button"
                onClick={() => setAssignOpen(false)}
                className="rounded-lg border border-[var(--border)] px-2 py-1 text-sm hover:bg-[var(--field)]"
              >
                ✕
              </button>
            </div>

            <div className="p-5 flex flex-col gap-4">
              {/* trainee picker */}
              <div className="rounded-xl border border-[var(--border)] bg-[var(--field)] p-2">
                <div className="flex items-center gap-2">
                  <input
                    value={traineesQ}
                    onChange={(e) => setTraineesQ(e.target.value)}
                    placeholder="Search trainees…"
                    className="flex-1 bg-transparent px-2 py-1 text-sm outline-none placeholder:[color:var(--muted)]"
                  />
                  <button
                    type="button"
                    onClick={selectAllFilteredTrainees}
                    className="rounded-lg border border-[var(--border)] bg-[var(--surface)] px-2 py-1 text-xs hover:bg-[var(--field)]"
                  >
                    Select all
                  </button>
                  <button
                    type="button"
                    onClick={clearSelectedTrainees}
                    className="rounded-lg border px-2 py-1 text-xs border-[color:var(--err)] text-[color:var(--err)] bg-[var(--surface)] hover:bg-[var(--field)]"
                  >
                    Clear
                  </button>
                </div>
                <div className="mt-2 max-h-36 overflow-auto rounded-lg bg-[var(--surface)] border border-[var(--border)]/60">
                  {filteredTraineesForAssign.map((t) => {
                    const checked = selectedTrainees.has(t.id);
                    return (
                      <label
                        key={t.id}
                        className="flex items-center gap-2 px-2 py-1 text-sm border-b border-[var(--border)] last:border-0"
                      >
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={() => toggleTrainee(t.id)}
                          className="h-4 w-4"
                        />
                        <span className="truncate">
                          {t.name}{" "}
                          <span className="text-[var(--muted)]">
                            • {t.email}
                          </span>
                        </span>
                      </label>
                    );
                  })}
                  {filteredTraineesForAssign.length === 0 && (
                    <div className="px-2 py-2 text-xs text-[var(--muted)]">
                      No trainees match.
                    </div>
                  )}
                </div>
              </div>

              {/* filters like trainee modal */}
              <div className="flex flex-col gap-3">
                <div className="flex items-center gap-2 text-xs">
                  <FilterChip
                    label="All"
                    active={assignDiff === "all"}
                    onClick={() => setAssignDiff("all")}
                  />
                  <FilterChip
                    label="Beginner"
                    color="var(--ok)"
                    active={assignDiff === "beginner"}
                    onClick={() => setAssignDiff("beginner")}
                  />
                  <FilterChip
                    label="Intermediate"
                    color="var(--warn)"
                    active={assignDiff === "intermediate"}
                    onClick={() => setAssignDiff("intermediate")}
                  />
                  <FilterChip
                    label="Expert"
                    color="var(--err)"
                    active={assignDiff === "expert"}
                    onClick={() => setAssignDiff("expert")}
                  />
                </div>
                <div className="flex items-center gap-2">
                  <div className="rounded-xl border border-[var(--border)] bg-[var(--field)] w-full">
                    <input
                      value={assignQ}
                      onChange={(e) => setAssignQ(e.target.value)}
                      placeholder="Search competencies…"
                      className="w-full bg-transparent px-3 py-2 text-sm outline-none placeholder:[color:var(--muted)]"
                    />
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      setAssignDiff("all");
                      setAssignTags(new Set());
                      setAssignQ("");
                    }}
                    className="rounded-xl border border-[var(--err)] text-[var(--err)] bg-[var(--surface)] px-3 py-2 text-sm hover:bg-[var(--field)] transition hover:scale-[1.02] active:scale-[0.99]"
                  >
                    Clear
                  </button>
                </div>
                <div className="flex flex-wrap gap-1">
                  {allCompTags.map((t) => (
                    <button
                      key={t}
                      type="button"
                      onClick={() => toggleAssignTag(t)}
                      className={[
                        "text-[10px] rounded-full border px-2 py-0.5 transition transform hover:scale-[1.03]",
                        assignTags.has(t)
                          ? "text-white border-transparent bg-[var(--accent)]"
                          : "text-[var(--foreground)]/80 bg-[var(--surface)] border-[var(--border)]",
                      ].join(" ")}
                    >
                      #{t}
                    </button>
                  ))}
                  {allCompTags.length === 0 && (
                    <span className="text-xs text-[var(--muted)]">
                      No tags available.
                    </span>
                  )}
                </div>
              </div>

              {/* competency list with checkboxes */}
              <div className="rounded-xl border border-[var(--border)] max-h-64 overflow-auto">
                <div className="flex items-center justify-between px-3 py-2 text-xs text-[var(--muted)] border-b border-[var(--border)] bg-[var(--surface)]/70">
                  <span>{assignableComps.length} competencies match</span>
                  <span>{selectedTrainees.size} trainee(s) selected</span>
                </div>
                <ul>
                  {assignableComps.slice(0, 80).map((c) => (
                    <li
                      key={c.id}
                      className="flex items-start gap-3 px-3 py-2 border-b border-[var(--border)] last:border-0"
                    >
                      <input
                        type="checkbox"
                        checked={selectedCompetencies.has(c.id)}
                        onChange={() => toggleSelectedCompetency(c.id)}
                        className="mt-1 h-4 w-4"
                      />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between gap-3">
                          <div className="font-medium truncate">
                            {c.name ?? "Untitled competency"}
                          </div>
                          {c.difficulty && (
                            <span
                              className={
                                "shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold " +
                                ((c.difficulty ?? "").toLowerCase() ===
                                "beginner"
                                  ? "bg-[color:var(--ok)] text-black"
                                  : (c.difficulty ?? "").toLowerCase() ===
                                    "intermediate"
                                  ? "bg-[color:var(--warn)] text-black"
                                  : (c.difficulty ?? "").toLowerCase() ===
                                    "expert"
                                  ? "bg-[color:var(--err)] text-black"
                                  : "bg-[var(--border)] text-[var(--foreground)]/70")
                              }
                            >
                              {c.difficulty}
                            </span>
                          )}
                        </div>
                        {c.tags && c.tags.length > 0 && (
                          <div className="mt-1 flex flex-wrap gap-1">
                            {c.tags.slice(0, 6).map((t) => (
                              <span
                                key={t}
                                className="text-[10px] rounded-full bg-[var(--surface)] border border-[var(--border)] px-2 py-0.5 text-[var(--foreground)]/85"
                              >
                                #{t}
                              </span>
                            ))}
                          </div>
                        )}
                      </div>
                    </li>
                  ))}
                  {assignableComps.length === 0 && (
                    <li className="px-3 py-4 text-xs text-[var(--muted)]">
                      No competencies match your filters.
                    </li>
                  )}
                  {assignableComps.length > 80 && (
                    <li className="px-3 py-1 text-[10px] text-[var(--muted)]">
                      Showing first 80…
                    </li>
                  )}
                </ul>
              </div>

              {assignErr && (
                <div className="rounded-xl border border-red-900/40 bg-red-950/40 px-3 py-2 text-sm text-red-200">
                  {assignErr}
                </div>
              )}

              <div className="flex items-center justify-end gap-2">
                <button
                  onClick={() => setAssignOpen(false)}
                  className="rounded-lg border px-3 py-2 text-sm border-[color:var(--err)] text-[color:var(--err)] bg-[var(--surface)] hover:bg-[var(--field)]"
                >
                  Cancel
                </button>
                <button
                  onClick={assignToSelected}
                  disabled={assignLoading}
                  className="rounded-xl px-3 py-2 text-sm text-white disabled:opacity-60"
                  style={{ background: "var(--accent)" }}
                >
                  {assignLoading ? "Assigning…" : "Assign to selected"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}

/* --------------- Small presentational bits --------------- */

function KPI({
  title,
  value,
  sub,
}: {
  title: string;
  value: number | string;
  sub?: string;
}) {
  return (
    <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-4">
      <div className="text-sm text-[var(--muted)]">{title}</div>
      <div className="mt-1 text-3xl font-semibold">{value}</div>
      {sub && <div className="text-xs text-[var(--muted)] mt-1">{sub}</div>}
    </div>
  );
}

function KPIInline({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <div className="text-[11px] text-[var(--muted)]">{label}</div>
      <div className="mt-0.5">{children}</div>
    </div>
  );
}

/* Reusable modal + list bits */
function FilterChip({
  label,
  onClick,
  active,
  color,
}: {
  label: string;
  onClick: () => void;
  active: boolean;
  color?: string;
}) {
  // Use provided difficulty color for hover when available, else fall back to accent
  const hoverBase = color ?? "var(--accent)";
  return (
    <button
      type="button"
      onClick={onClick}
      onMouseEnter={(e) => {
        if (!active) {
          (
            e.currentTarget as HTMLButtonElement
          ).style.background = `color-mix(in oklab, ${hoverBase} 12%, transparent)`;
          (
            e.currentTarget as HTMLButtonElement
          ).style.borderColor = `color-mix(in oklab, ${hoverBase} 28%, transparent)`;
        }
      }}
      onMouseLeave={(e) => {
        if (!active) {
          (e.currentTarget as HTMLButtonElement).style.background =
            "var(--surface)";
          (e.currentTarget as HTMLButtonElement).style.borderColor =
            "var(--border)";
        }
      }}
      className={[
        "px-3 py-1.5 rounded-full border text-xs font-medium transition transform",
        "hover:scale-[1.03]",
        active
          ? "shadow-[0_0_0_4px_color-mix(in_oklab,var(--accent)_18%,transparent)]"
          : "",
      ].join(" ")}
      style={{
        borderColor: "var(--border)",
        background: active ? color ?? "var(--field)" : "var(--surface)",
        color: active ? "var(--foreground)" : "var(--foreground)",
      }}
    >
      {label}
    </button>
  );
}
