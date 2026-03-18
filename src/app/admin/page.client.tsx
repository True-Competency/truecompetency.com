// src/app/admin/page.client.tsx
"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import Link from "next/link";
import {
  Users,
  LayoutDashboard,
  BookOpen,
  GraduationCap,
  ShieldCheck,
  TrendingUp,
  Globe,
  FileQuestion,
  ChevronRight,
  Search,
  ExternalLink,
  ArrowUpRight,
} from "lucide-react";

type Profile = {
  id: string;
  email: string;
  full_name: string | null;
  first_name: string | null;
  last_name: string | null;
  role: string;
  committee_role: string | null;
  country_name: string | null;
  hospital: string | null;
  university: string | null;
  created_at: string;
};

type PlatformStats = {
  totalUsers: number;
  committeeMembers: number;
  instructors: number;
  trainees: number;
  competencies: number;
  questions: number;
  countries: number;
  answers: number;
};

const ROLE_COLOR: Record<string, string> = {
  admin: "var(--accent)",
  committee: "#f59e0b",
  instructor: "#10b981",
  trainee: "#6b7280",
};

const ROLE_BG: Record<string, string> = {
  admin: "rgba(81,112,255,0.08)",
  committee: "rgba(245,158,11,0.08)",
  instructor: "rgba(16,185,129,0.08)",
  trainee: "rgba(107,114,128,0.08)",
};

function timeAgo(dateStr: string) {
  const diff = Date.now() - new Date(dateStr).getTime();
  const d = Math.floor(diff / 86400000);
  const h = Math.floor(diff / 3600000);
  const m = Math.floor(diff / 60000);
  if (d > 0) return `${d}d ago`;
  if (h > 0) return `${h}h ago`;
  return `${m}m ago`;
}

export default function AdminClient() {
  const [adminName, setAdminName] = useState<string>("Admin");
  const [stats, setStats] = useState<PlatformStats | null>(null);
  const [users, setUsers] = useState<Profile[]>([]);
  const [filtered, setFiltered] = useState<Profile[]>([]);
  const [search, setSearch] = useState("");
  const [roleFilter, setRoleFilter] = useState<string>("all");
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        setLoading(true);

        // Current admin profile
        const { data: u } = await supabase.auth.getUser();
        if (u.user?.id) {
          const { data: prof } = await supabase
            .from("profiles")
            .select("first_name, full_name")
            .eq("id", u.user.id)
            .maybeSingle<{
              first_name: string | null;
              full_name: string | null;
            }>();
          if (prof && !cancelled) {
            setAdminName(prof.first_name ?? prof.full_name ?? "Admin");
          }
        }

        // Fetch all users
        const { data: allUsers, error: usersErr } = await supabase
          .from("profiles")
          .select(
            "id, email, full_name, first_name, last_name, role, committee_role, country_name, hospital, university, created_at",
          )
          .order("created_at", { ascending: false });

        if (usersErr) throw usersErr;

        // Platform stats
        const [
          { count: competencies },
          { count: questions },
          { count: answers },
        ] = await Promise.all([
          supabase
            .from("competencies")
            .select("*", { count: "exact", head: true }),
          supabase
            .from("competency_questions")
            .select("*", { count: "exact", head: true }),
          supabase
            .from("student_answers")
            .select("*", { count: "exact", head: true }),
        ]);

        if (!cancelled && allUsers) {
          setUsers(allUsers as Profile[]);
          setFiltered(allUsers as Profile[]);

          const roles = allUsers as Profile[];
          const countries = new Set(
            roles.map((u) => u.country_name).filter(Boolean),
          ).size;

          setStats({
            totalUsers: roles.length,
            committeeMembers: roles.filter((u) => u.role === "committee")
              .length,
            instructors: roles.filter((u) => u.role === "instructor").length,
            trainees: roles.filter((u) => u.role === "trainee").length,
            competencies: competencies ?? 0,
            questions: questions ?? 0,
            countries,
            answers: answers ?? 0,
          });
        }
      } catch (e) {
        if (!cancelled)
          setErr(e instanceof Error ? e.message : "Failed to load");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // Filter users
  useEffect(() => {
    let result = users;
    if (roleFilter !== "all")
      result = result.filter((u) => u.role === roleFilter);
    if (search.trim()) {
      const q = search.toLowerCase();
      result = result.filter(
        (u) =>
          u.email?.toLowerCase().includes(q) ||
          u.full_name?.toLowerCase().includes(q) ||
          u.first_name?.toLowerCase().includes(q) ||
          u.country_name?.toLowerCase().includes(q),
      );
    }
    setFiltered(result);
  }, [search, roleFilter, users]);

  const displayName = (u: Profile) =>
    (u.full_name ?? [u.first_name, u.last_name].filter(Boolean).join(" ")) ||
    u.email;

  const initials = (u: Profile) => {
    const name =
      u.full_name ?? [u.first_name, u.last_name].filter(Boolean).join(" ");
    if (name)
      return name
        .split(" ")
        .map((w) => w[0])
        .join("")
        .toUpperCase()
        .slice(0, 2);
    return u.email[0].toUpperCase();
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="w-8 h-8 border-2 border-[var(--accent)] border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[var(--background)]">
      <div className="max-w-7xl mx-auto px-6 py-10 space-y-8">
        {/* ── Header ── */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <ShieldCheck size={18} className="text-[var(--accent)]" />
              <span className="text-xs font-semibold uppercase tracking-widest text-[var(--accent)]">
                Admin Portal
              </span>
            </div>
            <h1 className="text-3xl font-bold text-[var(--foreground)]">
              Welcome back, {adminName}
            </h1>
            <p className="text-[var(--muted)] mt-1">
              Full platform access — all dashboards and data.
            </p>
          </div>

          {/* Quick dashboard links */}
          <div className="flex flex-wrap gap-2">
            {[
              {
                label: "Committee",
                href: "/committee",
                icon: ShieldCheck,
                color: "#f59e0b",
              },
              {
                label: "Instructor",
                href: "/instructor",
                icon: GraduationCap,
                color: "#10b981",
              },
              {
                label: "Trainee",
                href: "/trainee",
                icon: BookOpen,
                color: "var(--accent)",
              },
            ].map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className="inline-flex items-center gap-2 px-4 py-2 rounded-xl border border-[var(--border)] bg-[var(--surface)] hover:border-[var(--accent)]/40 hover:shadow-md transition-all text-sm font-medium text-[var(--foreground)]"
              >
                <item.icon size={14} style={{ color: item.color }} />
                {item.label}
                <ArrowUpRight size={12} className="text-[var(--muted)]" />
              </Link>
            ))}
          </div>
        </div>

        {err && (
          <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-600">
            {err}
          </div>
        )}

        {/* ── Stats grid ── */}
        {stats && (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {[
              {
                label: "Total Users",
                value: stats.totalUsers,
                icon: Users,
                color: "var(--accent)",
              },
              {
                label: "Competencies",
                value: stats.competencies,
                icon: BookOpen,
                color: "#f59e0b",
              },
              {
                label: "Questions",
                value: stats.questions,
                icon: FileQuestion,
                color: "#10b981",
              },
              {
                label: "Answers",
                value: stats.answers,
                icon: TrendingUp,
                color: "#8b5cf6",
              },
              {
                label: "Committee",
                value: stats.committeeMembers,
                icon: ShieldCheck,
                color: "#f59e0b",
              },
              {
                label: "Instructors",
                value: stats.instructors,
                icon: GraduationCap,
                color: "#10b981",
              },
              {
                label: "Trainees",
                value: stats.trainees,
                icon: LayoutDashboard,
                color: "var(--accent)",
              },
              {
                label: "Countries",
                value: stats.countries,
                icon: Globe,
                color: "#ec4899",
              },
            ].map((stat) => (
              <div
                key={stat.label}
                className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-5"
              >
                <div className="flex items-center justify-between mb-3">
                  <span className="text-xs font-medium text-[var(--muted)] uppercase tracking-wider">
                    {stat.label}
                  </span>
                  <div
                    className="h-8 w-8 rounded-xl flex items-center justify-center"
                    style={{ background: `${stat.color}15` }}
                  >
                    <stat.icon size={15} style={{ color: stat.color }} />
                  </div>
                </div>
                <p className="text-3xl font-bold text-[var(--foreground)]">
                  {stat.value}
                </p>
              </div>
            ))}
          </div>
        )}

        {/* ── Role breakdown ── */}
        {stats && (
          <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-6">
            <h2 className="text-sm font-semibold text-[var(--foreground)] mb-4">
              User Distribution
            </h2>
            <div className="flex gap-2 flex-wrap mb-4">
              {[
                { role: "trainee", count: stats.trainees },
                { role: "instructor", count: stats.instructors },
                { role: "committee", count: stats.committeeMembers },
              ].map(({ role, count }) => (
                <div
                  key={role}
                  className="flex items-center gap-2 px-3 py-1.5 rounded-full border border-[var(--border)]"
                >
                  <div
                    className="h-2 w-2 rounded-full"
                    style={{ background: ROLE_COLOR[role] }}
                  />
                  <span className="text-xs font-medium capitalize text-[var(--foreground)]">
                    {role}
                  </span>
                  <span className="text-xs text-[var(--muted)]">{count}</span>
                </div>
              ))}
            </div>
            {/* Bar */}
            <div className="h-3 rounded-full overflow-hidden flex gap-0.5">
              {[
                { role: "trainee", count: stats.trainees },
                { role: "instructor", count: stats.instructors },
                { role: "committee", count: stats.committeeMembers },
              ].map(({ role, count }) => (
                <div
                  key={role}
                  className="h-full rounded-full transition-all"
                  style={{
                    width: `${(count / stats.totalUsers) * 100}%`,
                    background: ROLE_COLOR[role],
                  }}
                />
              ))}
            </div>
          </div>
        )}

        {/* ── Users table ── */}
        <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] overflow-hidden">
          {/* Table header */}
          <div className="px-6 py-4 border-b border-[var(--border)] flex flex-col md:flex-row gap-3 md:items-center justify-between">
            <div className="flex items-center gap-2">
              <Users size={16} className="text-[var(--muted)]" />
              <h2 className="font-semibold text-[var(--foreground)]">
                All Users
              </h2>
              <span className="text-xs text-[var(--muted)] bg-[var(--field)] px-2 py-0.5 rounded-full">
                {filtered.length}
              </span>
            </div>
            <div className="flex gap-2 flex-wrap">
              {/* Search */}
              <div className="relative">
                <Search
                  size={13}
                  className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--muted)]"
                />
                <input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search users..."
                  className="pl-8 pr-4 py-2 text-sm rounded-xl border border-[var(--border)] bg-[var(--field)] text-[var(--foreground)] placeholder:text-[var(--muted)] focus:outline-none focus:border-[var(--accent)]/50 w-48"
                />
              </div>
              {/* Role filter */}
              {["all", "trainee", "instructor", "committee"].map((r) => (
                <button
                  key={r}
                  onClick={() => setRoleFilter(r)}
                  className="px-3 py-2 text-xs font-medium rounded-xl border transition-all capitalize"
                  style={{
                    borderColor:
                      roleFilter === r ? "var(--accent)" : "var(--border)",
                    background:
                      roleFilter === r
                        ? "rgba(81,112,255,0.08)"
                        : "transparent",
                    color: roleFilter === r ? "var(--accent)" : "var(--muted)",
                  }}
                >
                  {r}
                </button>
              ))}
            </div>
          </div>

          {/* Table */}
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-[var(--border)]">
                  {["User", "Role", "Location", "Joined", "Actions"].map(
                    (h) => (
                      <th
                        key={h}
                        className="px-6 py-3 text-left text-xs font-semibold uppercase tracking-wider text-[var(--muted)]"
                      >
                        {h}
                      </th>
                    ),
                  )}
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--border)]">
                {filtered.length === 0 ? (
                  <tr>
                    <td
                      colSpan={5}
                      className="px-6 py-12 text-center text-sm text-[var(--muted)]"
                    >
                      No users found
                    </td>
                  </tr>
                ) : (
                  filtered.map((user) => (
                    <tr
                      key={user.id}
                      className="hover:bg-[var(--field)]/50 transition-colors"
                    >
                      {/* User */}
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-3">
                          <div
                            className="h-8 w-8 rounded-full flex items-center justify-center text-xs font-bold text-white flex-shrink-0"
                            style={{
                              background:
                                ROLE_COLOR[user.role] ?? "var(--accent)",
                            }}
                          >
                            {initials(user)}
                          </div>
                          <div>
                            <p className="text-sm font-medium text-[var(--foreground)]">
                              {displayName(user)}
                            </p>
                            <p className="text-xs text-[var(--muted)]">
                              {user.email}
                            </p>
                          </div>
                        </div>
                      </td>
                      {/* Role */}
                      <td className="px-6 py-4">
                        <span
                          className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold capitalize"
                          style={{
                            background: ROLE_BG[user.role] ?? "var(--field)",
                            color: ROLE_COLOR[user.role] ?? "var(--muted)",
                          }}
                        >
                          {user.role}
                          {user.committee_role === "chief_editor" && (
                            <ShieldCheck size={10} />
                          )}
                        </span>
                      </td>
                      {/* Location */}
                      <td className="px-6 py-4">
                        <p className="text-sm text-[var(--foreground)]">
                          {user.country_name ?? "—"}
                        </p>
                        <p className="text-xs text-[var(--muted)]">
                          {user.hospital ?? user.university ?? ""}
                        </p>
                      </td>
                      {/* Joined */}
                      <td className="px-6 py-4">
                        <span className="text-sm text-[var(--muted)]">
                          {timeAgo(user.created_at)}
                        </span>
                      </td>
                      {/* Actions */}
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-2">
                          {user.role === "committee" && (
                            <Link
                              href="/committee"
                              className="inline-flex items-center gap-1 text-xs font-medium text-[var(--accent)] hover:underline"
                            >
                              Committee <ExternalLink size={10} />
                            </Link>
                          )}
                          {user.role === "instructor" && (
                            <Link
                              href="/instructor"
                              className="inline-flex items-center gap-1 text-xs font-medium text-[var(--accent)] hover:underline"
                            >
                              Instructor <ExternalLink size={10} />
                            </Link>
                          )}
                          {user.role === "trainee" && (
                            <Link
                              href="/trainee"
                              className="inline-flex items-center gap-1 text-xs font-medium text-[var(--accent)] hover:underline"
                            >
                              Trainee <ExternalLink size={10} />
                            </Link>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}
