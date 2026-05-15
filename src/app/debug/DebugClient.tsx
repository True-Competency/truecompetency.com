// src/app/debug/DebugClient.tsx
"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import type { AssignmentRow } from "@/lib/types";

/* ---------------- Types ---------------- */
type DiagRow = {
  name: string;
  status: "ok" | "warn" | "error";
  detail?: string;
  extra?: unknown;
};

type Profile = {
  id: string;
  email: string | null;
  role: "trainee" | "instructor" | "committee";
};

type ProgressSample = {
  student_id: string;
  competency_id: string;
  total_questions?: number | null;
  answered_questions?: number | null;
  pct?: number | null;
};

type CompetencyRow = {
  id: string;
  name: string | null;
  difficulty: string | null;
  tags: string[] | null;
};

/* Common Supabase response shapes (keeps generics tidy) */
type SupaSingle<T> = { data: T | null; error: { message: string } | null };
type SupaList<T> = { data: T[] | null; error: { message: string } | null };
type SupaCount = { count: number | null; error: { message: string } | null };
type SupaInvoke = { data: unknown; error: { message: string } | null };

/* ---------------- Theme tokens ---------------- */
const ACCENT = "var(--accent)";
const SURFACE = "var(--surface)";
const BORDER = "var(--border)";
const FG = "var(--foreground)";
const MUTED = "var(--muted)";

const COLORS = {
  OK: "#10b981",
  WARN: "#f59e0b",
  ERR: "#ef4444",
};

/* ---------------- Small helpers ---------------- */
function ms(n: number) {
  return `${n.toFixed(0)}ms`;
}

async function timeit<T>(
  name: string,
  fn: () => Promise<T>,
  add: (r: DiagRow) => void
): Promise<{ out: T; dt: number }> {
  const t0 = performance.now();
  try {
    const out = await fn();
    const dt = performance.now() - t0;
    return { out, dt };
  } catch (e) {
    const dt = performance.now() - t0;
    add({
      name,
      status: "error",
      detail: `${e instanceof Error ? e.message : String(e)} (${ms(dt)})`,
    });
    throw e;
  }
}

/* ---------------- Component ---------------- */
export default function DebugClient() {
  const [rows, setRows] = useState<DiagRow[]>([]);
  const [running, setRunning] = useState(false);

  const add = useCallback((r: DiagRow) => setRows((prev) => [...prev, r]), []);
  const reset = useCallback(() => setRows([]), []);

  const run = useCallback(async () => {
    reset();
    setRunning(true);

    try {
      // Env presence
      const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
      const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

      add({
        name: "env:NEXT_PUBLIC_SUPABASE_URL",
        status: url ? "ok" : "error",
        detail: url || "Missing",
      });
      add({
        name: "env:NEXT_PUBLIC_SUPABASE_ANON_KEY",
        status: anon ? "ok" : "error",
        detail: anon ? "Present" : "Missing",
      });

      if (!url || !anon) {
        add({
          name: "client",
          status: "error",
          detail: "Supabase client cannot initialize without env vars.",
        });
        setRunning(false);
        return;
      }

      // Session / User
      const { out: userOut, dt: userDt } = await timeit(
        "auth.getUser",
        async () => await supabase.auth.getUser(),
        add
      );
      const user = userOut.data.user;
      add({
        name: "auth.getUser",
        status: user ? "ok" : "warn",
        detail: user
          ? `Signed in as ${user.email} (${ms(userDt)})`
          : `No session (${ms(userDt)})`,
        extra: user ?? undefined,
      });

      const { out: sessOut, dt: sessDt } = await timeit(
        "auth.getSession",
        async () => await supabase.auth.getSession(),
        add
      );
      const session = sessOut.data.session;
      add({
        name: "auth.getSession",
        status: session ? "ok" : "warn",
        detail: session
          ? `Expires ${new Date(
              (session.expires_at ?? 0) * 1000
            ).toLocaleString()} (${ms(sessDt)})`
          : `No active session (${ms(sessDt)})`,
        extra: session
          ? { expires_at: session.expires_at, user_id: session.user.id }
          : undefined,
      });

      // Profile (me) & RLS negative (not me)
      if (user?.id) {
        const { out: meOut, dt: meDt } = await timeit<SupaSingle<Profile>>(
          "profiles (current user)",
          async () =>
            await supabase
              .from("profiles")
              .select("id, email, role")
              .eq("id", user.id)
              .maybeSingle<Profile>(),
          add
        );

        if (meOut.error) {
          add({
            name: "profiles (current user)",
            status: "error",
            detail: `${meOut.error.message} (${ms(meDt)})`,
          });
        } else if (meOut.data) {
          add({
            name: "profiles (current user)",
            status: "ok",
            detail: `${meOut.data.email ?? "(no email)"} • ${
              meOut.data.role
            } (${ms(meDt)})`,
            extra: meOut.data,
          });
        } else {
          // maybeSingle returned no row and no error — almost always means the
          // auth session expired or token refresh failed mid-load, causing RLS
          // to evaluate auth.uid() = null. Reported here as a "warn" rather
          // than recovered (signOut/redirect) because this page exists to
          // diagnose exactly this kind of issue.
          add({
            name: "profiles (current user)",
            status: "warn",
            detail: `no row visible to this session — likely RLS denied (auth.uid() = null). check session above. (${ms(meDt)})`,
          });
        }

        const { out: notMeOut, dt: notMeDt } = await timeit<
          SupaList<{ id: string }>
        >(
          "profiles RLS (not me)",
          async () =>
            await supabase
              .from("profiles")
              .select("id")
              .neq("id", user.id)
              .limit(1),
          add
        );
        if (notMeOut.error) {
          add({
            name: "profiles RLS (not me)",
            status: "error",
            detail: `${notMeOut.error.message} (${ms(notMeDt)})`,
          });
        } else {
          const notMeData = notMeOut.data ?? [];
          add({
            name: "profiles RLS (not me)",
            status: notMeData.length > 0 ? "warn" : "ok",
            detail:
              (notMeData.length > 0
                ? "Unexpectedly could read another profile"
                : "Blocked as expected") + ` (${ms(notMeDt)})`,
          });
        }
      }

      // Competencies count
      {
        const { out, dt } = await timeit<SupaCount>(
          "competencies count",
          async () =>
            await supabase
              .from("competencies")
              .select("*", { count: "exact", head: true }),
          add
        );
        if (out.error) {
          add({
            name: "competencies count",
            status: "error",
            detail: `${out.error.message} (${ms(dt)})`,
          });
        } else if (!out.count) {
          add({
            name: "competencies count",
            status: "warn",
            detail: `0 rows (empty or RLS) (${ms(dt)})`,
          });
        } else {
          add({
            name: "competencies count",
            status: "ok",
            detail: `${out.count} (${ms(dt)})`,
          });
        }
      }

      // Progress: any rows (global)
      {
        const { out, dt } = await timeit<
          SupaList<{ student_id: string; competency_id: string }>
        >(
          "student_competency_progress (any rows)",
          async () =>
            await supabase
              .from("student_competency_progress")
              .select("student_id, competency_id")
              .limit(3),
          add
        );
        if (out.error) {
          add({
            name: "student_competency_progress (any rows)",
            status: "error",
            detail: `${out.error.message} (${ms(dt)})`,
          });
        } else if (!out.data || out.data.length === 0) {
          add({
            name: "student_competency_progress (any rows)",
            status: "warn",
            detail: `0 rows (${ms(dt)})`,
          });
        } else {
          add({
            name: "student_competency_progress (any rows)",
            status: "ok",
            detail: `${out.data.length} sample row(s) (${ms(dt)})`,
            extra: out.data,
          });
        }
      }

      // Progress for current user (if signed in)
      if (user?.id) {
        const { out, dt } = await timeit<SupaList<ProgressSample>>(
          "student_competency_progress (for current user)",
          async () =>
            await supabase
              .from("student_competency_progress")
              .select(
                "student_id, competency_id, total_questions, answered_questions, pct"
              )
              .eq("student_id", user.id)
              .order("pct", { ascending: true })
              .limit(5),
          add
        );
        if (out.error) {
          add({
            name: "student_competency_progress (for current user)",
            status: "error",
            detail: `${out.error.message} (${ms(dt)})`,
          });
        } else if (!out.data || out.data.length === 0) {
          add({
            name: "student_competency_progress (for current user)",
            status: "warn",
            detail: `0 rows (no assignments or RLS) (${ms(dt)})`,
          });
        } else {
          add({
            name: "student_competency_progress (for current user)",
            status: "ok",
            detail: `${out.data.length} row(s) (${ms(dt)})`,
            extra: out.data,
          });
        }
      }

      // Competencies by ids from progress (join sanity)
      {
        const { data: p } = await supabase
          .from("student_competency_progress")
          .select("competency_id")
          .limit(3);
        const ids = (p ?? []).map((r) => r.competency_id);
        if (ids.length) {
          const { out, dt } = await timeit<SupaList<CompetencyRow>>(
            "competencies (by ids from progress)",
            async () =>
              await supabase
                .from("competencies")
                .select("id, name, difficulty, tags")
                .in("id", ids),
            add
          );
          if (out.error) {
            add({
              name: "competencies (by ids from progress)",
              status: "error",
              detail: `${out.error.message} (${ms(dt)})`,
            });
          } else {
            add({
              name: "competencies (by ids from progress)",
              status: "ok",
              detail: `${out.data?.length ?? 0} row(s) (${ms(dt)})`,
              extra: out.data ?? undefined,
            });
          }
        } else {
          add({
            name: "competencies (by ids from progress)",
            status: "warn",
            detail: "Skipped: no progress rows.",
          });
        }
      }

      // Assignments coverage: count + sample competency exists
      {
        const { out, dt } = await timeit<SupaCount>(
          "competency_assignments count",
          async () =>
            await supabase
              .from("competency_assignments")
              .select("*", { count: "exact", head: true }),
          add
        );
        if (out.error) {
          add({
            name: "competency_assignments count",
            status: "error",
            detail: `${out.error.message} (${ms(dt)})`,
          });
        } else {
          add({
            name: "competency_assignments count",
            status: out.count && out.count > 0 ? "ok" : "warn",
            detail: `${out.count ?? 0} (${ms(dt)})`,
          });
        }

        const { data: one } = await supabase
          .from("competency_assignments")
          .select("competency_id")
          .limit(1)
          .returns<AssignmentRow[]>();
        if (one && one.length) {
          const cid = one[0].competency_id;
          const { data: comp, error: cErr } = await supabase
            .from("competencies")
            .select("id, name")
            .eq("id", cid)
            .maybeSingle();
          add({
            name: "assignment → competency join",
            status: cErr ? "warn" : comp ? "ok" : "warn",
            detail: cErr
              ? cErr.message
              : comp
              ? `Found ${comp.name ?? comp.id}`
              : "Dangling assignment (no competency found)",
          });
        }
      }

      // Storage: attempt common public buckets (read-only)
      {
        const candidates = ["public", "assets", "images", "files"];
        let okBucket: string | null = null;
        let bucketDetail = "No public bucket accessible";
        for (const b of candidates) {
          const { data, error } = await supabase.storage.from(b).list("", {
            limit: 1,
          });
          if (!error) {
            okBucket = b;
            bucketDetail =
              data && data.length > 0
                ? `Listed 1+ object in '${b}'`
                : `Bucket '${b}' exists (0 objects listed)`;
            break;
          }
        }
        add({
          name: "storage (public list)",
          status: okBucket ? "ok" : "warn",
          detail: okBucket ? bucketDetail : "Tried: " + candidates.join(", "),
        });
      }

      // Realtime handshake (subscribe then immediately unsubscribe)
      try {
        const ch = supabase.channel("debug-handshake");
        let gotSubscribed = false;
        await new Promise<void>((resolve) => {
          // Typing-safe: callback gives a string union ("SUBSCRIBED" | "CLOSED" | ...)
          ch.subscribe((status) => {
            if (status === "SUBSCRIBED") {
              gotSubscribed = true;
              resolve();
            }
          });
          // Fallback resolve
          setTimeout(() => resolve(), 1200);
        });
        await ch.unsubscribe();
        add({
          name: "realtime subscribe",
          status: gotSubscribed ? "ok" : "warn",
          detail: gotSubscribed
            ? "SUBSCRIBED → UNSUBSCRIBED"
            : "No SUBSCRIBED callback",
        });
      } catch (e) {
        add({
          name: "realtime subscribe",
          status: "warn",
          detail: `Failed: ${e instanceof Error ? e.message : String(e)}`,
        });
      }

      // Edge function (optional)
      try {
        const { out, dt } = await timeit<SupaInvoke>(
          "functions.invoke('health')",
          async () => await supabase.functions.invoke("health"),
          add
        );
        add({
          name: "functions.invoke('health')",
          status: out.error ? "warn" : "ok",
          detail: out.error ? `Unavailable (${ms(dt)})` : `OK (${ms(dt)})`,
          extra: out.error ? out.error : out.data,
        });
      } catch {
        // timeit already logged as error
      }

      // RPC (optional): debug_now returning server time
      try {
        const { out, dt } = await timeit<SupaSingle<string>>(
          "rpc('debug_now')",
          async () => await supabase.rpc("debug_now"),
          add
        );
        if (out.error) {
          add({
            name: "rpc('debug_now')",
            status: "warn",
            detail: `No RPC or blocked (${ms(dt)})`,
          });
        } else {
          const serverIso = out.data ?? "";
          let skew = "";
          if (serverIso) {
            const server = new Date(serverIso).getTime();
            const local = Date.now();
            const diffMs = Math.abs(server - local);
            skew = ` • clock skew ~${ms(diffMs)}`;
          }
          add({
            name: "rpc('debug_now')",
            status: "ok",
            detail: `OK (${ms(dt)})${skew}`,
            extra: out.data ?? undefined,
          });
        }
      } catch {
        // timeit already logged as error
      }
    } catch (e) {
      add({
        name: "unexpected",
        status: "error",
        detail: e instanceof Error ? e.message : String(e),
      });
    } finally {
      setRunning(false);
    }
  }, [reset, add]); // ✅ no `supabase` here (avoids ESLint warning)

  useEffect(() => {
    run();
  }, [run]);

  // Derived state
  const anyError = useMemo(
    () => rows.some((r) => r.status === "error"),
    [rows]
  );
  const anyWarn = useMemo(() => rows.some((r) => r.status === "warn"), [rows]);

  return (
    <main className="bg-[var(--background)] text-[var(--foreground)]">
      {/* Page title */}
      <section className="mx-auto max-w-5xl px-6 pt-8 pb-6">
        <h1 className="text-2xl md:text-3xl font-semibold tracking-tight">
          Debug — Supabase connectivity
        </h1>
        <div className="accent-underline mt-3" />
        <p className="mt-2 text-sm md:text-base" style={{ color: MUTED }}>
          Quick end-to-end checks for auth, RLS, storage, realtime, and
          functions.
        </p>

        <div className="mt-4">
          <button
            onClick={run}
            disabled={running}
            className="rounded-2xl px-4 py-2 text-sm font-semibold btn-primary transition-colors disabled:opacity-60"
            style={{
              background: ACCENT,
              color: "#fff",
              boxShadow:
                "0 8px 30px color-mix(in oklab, var(--accent) 25%, transparent)",
            }}
          >
            {running ? "Running…" : "Re-run checks"}
          </button>
        </div>
      </section>

      <hr
        className="border-0 h-[1px] mx-auto max-w-5xl"
        style={{
          background: `color-mix(in oklab, ${ACCENT} 20%, transparent)`,
        }}
      />

      {/* Summary + Cards */}
      <section className="mx-auto max-w-5xl px-6 py-6">
        <SummaryRow anyError={anyError} anyWarn={anyWarn} />
        <div className="grid gap-3">
          {rows.map((r, i) => (
            <Card
              key={i}
              title={r.name}
              status={r.status}
              detail={r.detail}
              extra={r.extra}
            />
          ))}
        </div>
      </section>
    </main>
  );
}

/* ---------------- Presentational bits ---------------- */

function SummaryRow({
  anyError,
  anyWarn,
}: {
  anyError: boolean;
  anyWarn: boolean;
}) {
  const text = anyError
    ? "Errors detected — see below"
    : anyWarn
    ? "Warnings detected — see below"
    : "All checks passed";
  const border = anyError ? COLORS.ERR : anyWarn ? COLORS.WARN : COLORS.OK;

  return (
    <div
      className="rounded-xl p-3"
      style={{
        background: SURFACE,
        border: `1px solid ${BORDER}`,
        borderLeft: `4px solid ${border}`,
      }}
    >
      <strong className="block" style={{ color: border }}>
        {text}
      </strong>
      <div className="mt-1 text-sm" style={{ color: MUTED }}>
        This page performs read-only checks and lightweight handshakes.
      </div>
    </div>
  );
}

function Card({
  title,
  status,
  detail,
  extra,
}: {
  title: string;
  status: "ok" | "warn" | "error";
  detail?: string;
  extra?: unknown;
}) {
  const pillBg =
    status === "ok" ? COLORS.OK : status === "warn" ? COLORS.WARN : COLORS.ERR;

  const json = useMemo(() => {
    try {
      return extra === undefined ? undefined : JSON.stringify(extra, null, 2);
    } catch {
      return String(extra);
    }
  }, [extra]);

  return (
    <div
      className="rounded-xl p-4"
      style={{ background: SURFACE, border: `1px solid ${BORDER}` }}
    >
      <div className="flex items-center justify-between gap-2">
        <div className="font-semibold" style={{ color: FG }}>
          {title}
        </div>
        <span
          className="rounded-full px-2.5 py-0.5 text-xs font-bold text-white"
          style={{ background: pillBg }}
        >
          {status.toUpperCase()}
        </span>
      </div>

      {detail && (
        <div className="mt-2 text-sm" style={{ color: MUTED }}>
          {detail}
        </div>
      )}

      {json !== undefined && (
        <pre
          className="mt-3 text-xs leading-relaxed rounded-lg p-3 overflow-x-auto"
          style={{
            color: FG,
            background:
              "color-mix(in oklab, var(--background) 92%, transparent)",
            border: `1px solid ${BORDER}`,
          }}
        >
          {json}
        </pre>
      )}
    </div>
  );
}
