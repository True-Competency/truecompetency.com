// src/components/SidebarSupportModal.tsx
"use client";

import { useState } from "react";
import { LifeBuoy, X } from "lucide-react";

export default function SidebarSupportModal({
  collapsed,
}: {
  collapsed: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [subject, setSubject] = useState("Question");
  const [message, setMessage] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  function closeModal() {
    if (sending) return;
    setOpen(false);
    setError(null);
    setSuccess(null);
    setSubject("Question");
    setMessage("");
  }

  async function handleSubmit() {
    try {
      setSending(true);
      setError(null);
      setSuccess(null);

      const trimmed = message.trim();
      if (!trimmed) throw new Error("Please describe your issue or question.");
      if (trimmed.length > 2000)
        throw new Error("Message must be 2000 characters or fewer.");

      const res = await fetch("/api/support", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ subject, message: trimmed }),
      });
      const json = (await res.json()) as { error?: string };
      if (!res.ok)
        throw new Error(json.error || "Could not send your message.");

      setSuccess("Message sent! We'll be in touch soon.");
      window.setTimeout(() => closeModal(), 2000);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not send your message.");
    } finally {
      setSending(false);
    }
  }

  return (
    <>
      {/* ── Trigger button ── */}
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={`w-full flex items-center rounded-full border border-[var(--border)] bg-[var(--surface)] px-3 py-2.5 text-sm font-semibold text-[var(--foreground)] shadow-sm transition-all duration-150 hover:border-[color:var(--accent)] hover:bg-[color:var(--accent)] hover:text-white ${
          collapsed ? "h-10 justify-center px-0 rounded-xl" : "gap-3"
        }`}
        title="Get Help & Support"
      >
        <LifeBuoy size={16} />
        {!collapsed && <span>Get Help & Support</span>}
      </button>

      {/* ── Modal ── */}
      {open && (
        <div
          className="fixed inset-0 z-50 grid place-items-center bg-black/45 px-4"
          onClick={closeModal}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="support-title"
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-lg rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-6 shadow-2xl"
          >
            {/* Header */}
            <div className="flex items-start justify-between gap-4 border-b border-[var(--border)] pb-4">
              <div>
                <h2
                  id="support-title"
                  className="text-lg font-semibold text-[var(--foreground)]"
                >
                  Help & Support
                </h2>
                <p className="mt-1 text-sm text-[var(--muted)]">
                  Have any questions, feedback, or suggestions? Ask us here —
                  we&apos;ll get back to you at your email address.
                </p>
                <p className="mt-1 text-sm text-[var(--muted)]">
                  You can also contact us directly at{" "}
                  <a
                    href={`mailto:${process.env.NEXT_PUBLIC_SUPPORT_EMAIL}`}
                    className="text-[#5170ff] hover:underline"
                  >
                    {process.env.NEXT_PUBLIC_SUPPORT_EMAIL}
                  </a>
                </p>
              </div>
              <button
                type="button"
                onClick={closeModal}
                className="grid h-8 w-8 flex-shrink-0 place-items-center rounded-full border border-[var(--border)] bg-[var(--field)] text-[var(--foreground)] transition-all hover:border-[color:var(--accent)] hover:text-[var(--accent)]"
                aria-label="Close support dialog"
              >
                <X size={14} />
              </button>
            </div>

            {/* Form */}
            <div className="mt-5 grid gap-4">
              {/* Subject */}
              <label className="grid gap-1.5 text-sm">
                <span className="text-[var(--muted)]">Subject</span>
                <div className="relative">
                  <select
                    value={subject}
                    onChange={(e) => setSubject(e.target.value)}
                    disabled={sending}
                    className="w-full appearance-none rounded-2xl border border-[var(--border)] bg-[var(--field)] px-3 py-2 pr-10 text-sm outline-none"
                  >
                    <option value="Question">Question</option>
                    <option value="Bug Report">Bug Report</option>
                    <option value="Feature Request">Feature Request</option>
                    <option value="Other">Other</option>
                  </select>
                  <div className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 text-[var(--muted)]">
                    <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                      <path
                        d="M2 4l4 4 4-4"
                        stroke="currentColor"
                        strokeWidth="1.5"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                    </svg>
                  </div>
                </div>
              </label>

              {/* Message */}
              <label className="grid gap-1.5 text-sm">
                <div className="flex items-center justify-between gap-3">
                  <span className="text-[var(--muted)]">Message</span>
                  <span className="text-xs text-[var(--muted)]">
                    {message.length}/2000
                  </span>
                </div>
                <textarea
                  value={message}
                  onChange={(e) => setMessage(e.target.value.slice(0, 2000))}
                  placeholder="Describe your issue or question..."
                  maxLength={2000}
                  rows={7}
                  disabled={sending}
                  className="min-h-[160px] resize-y rounded-2xl border border-[var(--border)] bg-[var(--field)] px-3 py-2 text-sm outline-none"
                />
              </label>

              {/* Error / success */}
              {error && (
                <div className="rounded-xl border border-[color:var(--err)]/30 bg-[color:var(--err)]/10 px-3 py-2 text-sm text-[var(--err)]">
                  {error}
                </div>
              )}
              {success && (
                <div className="rounded-xl border border-[color:var(--ok)]/30 bg-[color:var(--ok)]/10 px-3 py-2 text-sm text-[var(--ok)]">
                  {success}
                </div>
              )}

              {/* Actions */}
              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  onClick={closeModal}
                  disabled={sending}
                  className="rounded-full border border-[var(--border)] bg-[var(--surface)] px-4 py-2 text-sm text-[var(--foreground)] transition-all hover:border-[color:var(--accent)] hover:text-[var(--accent)] disabled:opacity-60"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleSubmit}
                  disabled={sending}
                  className="rounded-full px-4 py-2 text-sm font-semibold text-white transition-all hover:opacity-90 disabled:opacity-60"
                  style={{ background: "var(--accent)" }}
                >
                  {sending ? "Sending..." : "Send Message"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
