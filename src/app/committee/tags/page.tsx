"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { Check, Pencil, Plus, Trash2, X } from "lucide-react";

type TagRow = {
  id: string;
  name: string;
  created_at: string;
  created_by: string | null;
};

type ProfileRole = {
  id: string;
  committee_role: string | null;
};

export default function CommitteeTagsPage() {
  const [me, setMe] = useState<ProfileRole | null>(null);
  const [tags, setTags] = useState<TagRow[]>([]);
  const [name, setName] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState("");
  const [rowBusyId, setRowBusyId] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);

  const isChair = me?.committee_role === "chief_editor";

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        setLoading(true);
        setErr(null);
        const { data: u, error: userErr } = await supabase.auth.getUser();
        if (userErr) throw userErr;
        const uid = u.user?.id;
        if (!uid) throw new Error("Please sign in again.");

        const [{ data: meRow, error: meErr }, { data: tagRows, error: tErr }] =
          await Promise.all([
            supabase
              .from("profiles")
              .select("id, committee_role")
              .eq("id", uid)
              .maybeSingle<ProfileRole>(),
            supabase.from("tags").select("id, name, created_at, created_by").order("name", { ascending: true }),
          ]);
        if (meErr) throw meErr;
        if (tErr) throw tErr;
        if (!cancelled) {
          setMe(meRow ?? null);
          setTags((tagRows ?? []) as TagRow[]);
        }
      } catch (e) {
        if (!cancelled) {
          setErr(e instanceof Error ? e.message : String(e));
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const sortedTags = useMemo(
    () => [...tags].sort((a, b) => a.name.localeCompare(b.name)),
    [tags]
  );

  async function addTag(e: FormEvent) {
    e.preventDefault();
    setErr(null);
    setMsg(null);
    if (!isChair) {
      setErr("Only Committee Chair can add tags.");
      return;
    }

    const raw = name.trim();
    const clean = raw.replace(/^#+/, "").trim();
    if (!clean) {
      setErr("Please enter a tag name.");
      return;
    }

    try {
      setSaving(true);
      const { data: u } = await supabase.auth.getUser();
      const uid = u.user?.id;
      if (!uid) throw new Error("Please sign in again.");

      const { data, error } = await supabase
        .from("tags")
        .insert({ name: clean, created_by: uid })
        .select("id, name, created_at, created_by")
        .single<TagRow>();
      if (error) throw error;
      setTags((prev) => [...prev, data]);
      setName("");
      setMsg("Tag added.");
    } catch (e) {
      const text = e instanceof Error ? e.message : String(e);
      if (text.toLowerCase().includes("duplicate")) {
        setErr("This tag already exists.");
      } else {
        setErr(text);
      }
    } finally {
      setSaving(false);
    }
  }

  async function renameTag(tagId: string) {
    setErr(null);
    setMsg(null);
    const clean = editingName.replace(/^#+/, "").trim();
    if (!clean) {
      setErr("Tag name cannot be empty.");
      return;
    }
    try {
      setRowBusyId(tagId);
      const { error } = await supabase.rpc("chair_rename_tag", {
        p_tag_id: tagId,
        p_new_name: clean,
      });
      if (error) throw error;
      setTags((prev) =>
        prev.map((t) => (t.id === tagId ? { ...t, name: clean } : t))
      );
      setEditingId(null);
      setEditingName("");
      setMsg("Tag renamed.");
    } catch (e) {
      const text = e instanceof Error ? e.message : String(e);
      if (text.toLowerCase().includes("duplicate")) {
        setErr("Another tag with this name already exists.");
      } else {
        setErr(text);
      }
    } finally {
      setRowBusyId(null);
    }
  }

  async function deleteTag(tagId: string, tagName: string) {
    if (!confirm(`Delete #${tagName}? This removes it from existing competencies too.`)) {
      return;
    }
    setErr(null);
    setMsg(null);
    try {
      setRowBusyId(tagId);
      const { error } = await supabase.rpc("chair_delete_tag", {
        p_tag_id: tagId,
      });
      if (error) throw error;
      setTags((prev) => prev.filter((t) => t.id !== tagId));
      if (editingId === tagId) {
        setEditingId(null);
        setEditingName("");
      }
      setMsg("Tag deleted.");
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setRowBusyId(null);
    }
  }

  if (loading) {
    return (
      <div className="px-8 py-8 max-w-4xl mx-auto text-sm text-[var(--muted)]">
        Loading tags…
      </div>
    );
  }

  if (!isChair) {
    return (
      <div className="px-8 py-8 max-w-4xl mx-auto">
        <h1 className="text-2xl font-semibold text-[var(--foreground)]">Tags</h1>
        <p className="mt-3 text-sm text-[var(--muted)]">
          You do not have access to tag management.
        </p>
      </div>
    );
  }

  return (
    <div className="px-8 py-8 max-w-4xl mx-auto">
      <div className="mb-6">
        <h1
          className="text-3xl font-bold tracking-tight text-[var(--foreground)]"
          style={{ fontFamily: "var(--font-heading, sans-serif)" }}
        >
          Tags
        </h1>
        <div className="accent-underline mt-3" />
        <p className="mt-3 text-sm text-[var(--muted)]">
          Add new tags for competency proposals. Changes are available immediately.
        </p>
      </div>

      {err && (
        <div className="mb-4 rounded-2xl border border-[color:var(--err)]/30 bg-[color:var(--err)]/10 px-4 py-3 text-sm text-[var(--err)]">
          {err}
        </div>
      )}
      {msg && (
        <div className="mb-4 rounded-2xl border border-[color:var(--ok)]/30 bg-[color:var(--ok)]/10 px-4 py-3 text-sm text-[var(--foreground)]">
          {msg}
        </div>
      )}

      <form
        onSubmit={addTag}
        className="mb-5 rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-4 flex flex-col sm:flex-row gap-3"
      >
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="e.g. IVUS (without #)"
          className="flex-1 rounded-xl border border-[var(--border)] bg-[var(--field)] px-3 py-2 text-sm outline-none focus:border-[color:var(--accent)]"
        />
        <button
          type="submit"
          disabled={saving}
          className="inline-flex items-center justify-center gap-2 rounded-xl px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
          style={{ background: "var(--accent)" }}
        >
          <Plus size={14} />
          {saving ? "Adding…" : "Add tag"}
        </button>
      </form>

      <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] overflow-hidden">
        <table className="min-w-full text-sm">
          <thead>
            <tr className="border-b border-[var(--border)] bg-[var(--field)]/40">
              <th className="px-4 py-3 text-left text-xs font-semibold text-[var(--muted)] w-12">
                #
              </th>
              <th className="px-4 py-3 text-left text-xs font-semibold text-[var(--muted)]">
                Tag
              </th>
              <th className="px-4 py-3 text-left text-xs font-semibold text-[var(--muted)] w-44">
                Created
              </th>
              <th className="px-4 py-3 text-left text-xs font-semibold text-[var(--muted)] w-44">
                Actions
              </th>
            </tr>
          </thead>
          <tbody>
            {sortedTags.length === 0 && (
              <tr>
                <td
                  colSpan={4}
                  className="px-4 py-8 text-center text-sm text-[var(--muted)]"
                >
                  No tags yet.
                </td>
              </tr>
            )}
            {sortedTags.map((t, idx) => (
              <tr key={t.id} className="border-t border-[var(--border)]">
                <td className="px-4 py-3 text-xs text-[var(--muted)]">{idx + 1}</td>
                <td className="px-4 py-3 font-medium text-[var(--foreground)]">
                  {editingId === t.id ? (
                    <input
                      value={editingName}
                      onChange={(e) => setEditingName(e.target.value)}
                      className="w-full max-w-xs rounded-lg border border-[var(--border)] bg-[var(--field)] px-2 py-1 text-sm outline-none focus:border-[color:var(--accent)]"
                    />
                  ) : (
                    `#${t.name}`
                  )}
                </td>
                <td className="px-4 py-3 text-xs text-[var(--muted)]">
                  {new Date(t.created_at).toLocaleDateString()}
                </td>
                <td className="px-4 py-3 text-xs">
                  <div className="flex items-center gap-1.5">
                    {editingId === t.id ? (
                      <>
                        <button
                          type="button"
                          disabled={rowBusyId === t.id}
                          onClick={() => void renameTag(t.id)}
                          className="h-8 w-8 grid place-items-center rounded-lg border border-[var(--border)] bg-[var(--surface)] text-[var(--muted)] hover:text-[var(--ok)] disabled:opacity-50"
                          title="Save name"
                        >
                          <Check size={14} />
                        </button>
                        <button
                          type="button"
                          disabled={rowBusyId === t.id}
                          onClick={() => {
                            setEditingId(null);
                            setEditingName("");
                          }}
                          className="h-8 w-8 grid place-items-center rounded-lg border border-[var(--border)] bg-[var(--surface)] text-[var(--muted)] hover:text-[var(--foreground)] disabled:opacity-50"
                          title="Cancel"
                        >
                          <X size={14} />
                        </button>
                      </>
                    ) : (
                      <button
                        type="button"
                        disabled={rowBusyId === t.id}
                        onClick={() => {
                          setEditingId(t.id);
                          setEditingName(t.name);
                        }}
                        className="h-8 w-8 grid place-items-center rounded-lg border border-[var(--border)] bg-[var(--surface)] text-[var(--muted)] hover:text-[var(--accent)] disabled:opacity-50"
                        title="Rename tag"
                      >
                        <Pencil size={14} />
                      </button>
                    )}
                    <button
                      type="button"
                      disabled={rowBusyId === t.id}
                      onClick={() => void deleteTag(t.id, t.name)}
                      className="h-8 w-8 grid place-items-center rounded-lg border border-[var(--border)] bg-[var(--surface)] text-[var(--muted)] hover:text-[var(--err)] disabled:opacity-50"
                      title="Delete tag"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
