// src/app/(auth)/signin/page.tsx
"use client";

import { useEffect, useMemo, useState } from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";
import { ensureProfile } from "@/lib/ensureProfile";
import CountrySelect from "@/components/CountrySelect"; // value: string | null; onChange: (code: string) => void
import { useTheme } from "next-themes";

type Role = "trainee" | "instructor" | "committee";

/* ---------------- UI bits ---------------- */
function RoleChip({
  label,
  active,
  onClick,
}: {
  label: Role;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={[
        "px-3.5 py-1.5 rounded-full text-xs font-medium border transition-all",
        "hover:scale-[1.04] active:scale-[0.98]",
        active
          ? "bg-[var(--accent)] text-white border-transparent shadow-[0_0_0_3px_color-mix(in_oklab,var(--accent)_20%,transparent)]"
          : "bg-[var(--surface)] text-[var(--foreground)]/80 border-[var(--border)] hover:border-[color:var(--accent)]/40",
      ].join(" ")}
    >
      {label.charAt(0).toUpperCase() + label.slice(1)}
    </button>
  );
}

function Field({
  label,
  type,
  value,
  onChange,
  placeholder,
  autoComplete,
  required = true,
}: {
  label: string;
  type: "text" | "email" | "password";
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
  autoComplete?: string;
  required?: boolean;
}) {
  return (
    <div className="group">
      <label className="mb-1.5 block text-sm font-medium text-[var(--foreground)]/90">
        {label} {required ? <span className="text-red-500">*</span> : null}
      </label>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        autoComplete={autoComplete}
        required={required}
        className={[
          "w-full rounded-xl border px-3.5 py-2.5 outline-none",
          "bg-[var(--field)] text-[var(--foreground)] border-[var(--border)]",
          "placeholder:[color:var(--muted)]",
          "focus:border-[color:var(--accent)] focus:shadow-[0_0_0_3px_color-mix(in_oklab,var(--accent)_12%,transparent)]",
          "transition-all",
        ].join(" ")}
      />
    </div>
  );
}

function PasswordField({
  label,
  value,
  onChange,
  placeholder,
  autoComplete,
  required = true,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
  autoComplete?: string;
  required?: boolean;
}) {
  const [show, setShow] = useState(false);
  return (
    <div className="group">
      <label className="mb-1.5 block text-sm font-medium text-[var(--foreground)]/90">
        {label}
      </label>
      <div className="relative">
        <input
          type={show ? "text" : "password"}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          autoComplete={autoComplete}
          required={required}
          className={[
            "w-full rounded-xl border pl-3.5 pr-10 py-2.5 outline-none",
            "bg-[var(--field)] text-[var(--foreground)] border-[var(--border)]",
            "placeholder:[color:var(--muted)]",
            "focus:border-[color:var(--accent)] focus:shadow-[0_0_0_3px_color-mix(in_oklab,var(--accent)_12%,transparent)]",
            "transition-all",
          ].join(" ")}
        />
        <button
          type="button"
          aria-label={show ? "Hide password" : "Show password"}
          onClick={() => setShow((s) => !s)}
          className="absolute right-2.5 top-1/2 -translate-y-1/2 inline-flex h-7 w-7 items-center justify-center rounded-lg text-[var(--muted)] hover:text-[var(--foreground)] transition-colors"
        >
          {show ? (
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
              <path
                d="M3 3l18 18M10.58 10.58A3 3 0 0012 15a3 3 0 001.42-.38M9.88 5.08A10.94 10.94 0 0112 5c5 0 9.27 3.11 11 7-.41.94-1 1.8-1.7 2.57M6.53 6.53C4.2 7.86 2.54 9.74 1 12c.64 1.17 1.5 2.24 2.53 3.17A11.22 11.22 0 0012 19c1.3 0 2.55-.2 3.72-.58"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          ) : (
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
              <path
                d="M1 12s4-7 11-7 11 7 11 7-4 7-11 7S1 12 1 12z"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
              <circle
                cx="12"
                cy="12"
                r="3"
                stroke="currentColor"
                strokeWidth="2"
              />
            </svg>
          )}
        </button>
      </div>
    </div>
  );
}

function CheckIcon() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      className="mt-0.5 shrink-0 text-[var(--accent)]"
    >
      <path
        d="M20 6L9 17l-5-5"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

const ROLE_INFO: Record<Role, { title: string; points: string[] }> = {
  trainee: {
    title: "Trainee — Build your competency portfolio",
    points: [
      "Track progress across enrolled competencies",
      "Answer case-based questions with instant feedback",
      "Build a performance record for instructors & committee",
    ],
  },
  instructor: {
    title: "Instructor — Coach and review trainees",
    points: [
      "Monitor trainee progress in real time",
      "Review answers and provide targeted feedback",
      "Approve completed competencies",
    ],
  },
  committee: {
    title: "Committee — Govern standards and oversight",
    points: [
      "Manage frameworks and assessment standards",
      "See program-wide analytics and trends",
      "Approve new competencies & maintain compliance",
    ],
  },
};

const FEATURES = [
  "Structured competency evaluations",
  "Evidence collection & case tracking",
  "Transparent progress for all stakeholders",
];

/* ---------------- page ---------------- */
export default function SignInPage() {
  const router = useRouter();
  const [redirect, setRedirect] = useState<string>("/");
  const { resolvedTheme } = useTheme();
  const tcipLogoSrc =
    resolvedTheme === "dark" ? "/TCIP_White_Logo.png" : "/TCIP_Black_Logo.png";

  useEffect(() => {
    try {
      const sp = new URLSearchParams(window.location.search);
      const r = sp.get("redirect");
      if (r && typeof r === "string") setRedirect(r);
    } catch {
      /* no-op */
    }
  }, []);

  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [role, setRole] = useState<Role>("trainee");

  // Signup fields
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [confirm, setConfirm] = useState("");
  const [countryCode, setCountryCode] = useState<string>(""); // ISO-2, required
  const [university, setUniversity] = useState(""); // optional (trainee)
  const [hospital, setHospital] = useState(""); // optional (instructor)

  // Shared
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  const [msg, setMsg] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [toast, setToast] = useState<{ open: boolean; text: string }>({
    open: false,
    text: "",
  });

  const roleInfo = useMemo(() => ROLE_INFO[role], [role]);

  function validate(): string | null {
    if (!/^\S+@\S+\.\S+$/.test(email)) return "Please enter a valid email.";
    if (mode === "signup") {
      if (!firstName.trim() || !lastName.trim())
        return "Please enter your first and last name.";
      if (!countryCode) return "Please select your country.";
      if (password.length < 8) return "Password must be at least 8 characters.";
      if (password !== confirm) return "Passwords do not match.";
    }
    return null;
  }

  function showError(e: unknown) {
    if (typeof e === "object" && e !== null) {
      const maybe = e as {
        message?: string;
        error_description?: string;
        details?: string;
      };
      const text =
        [maybe.message, maybe.error_description, maybe.details]
          .filter((t): t is string => !!t)
          .join(" — ") || "Something went wrong";
      setMsg(text);
      return;
    }
    setMsg("Something went wrong");
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setMsg(null);

    const v = validate();
    if (v) {
      setMsg(v);
      return;
    }

    setLoading(true);
    try {
      if (mode === "signup") {
        // Send minimal metadata; role will be set in profiles (source of truth)
        const { data, error } = await supabase.auth.signUp({
          email,
          password,
          options: {
            data: {
              first_name: firstName.trim(),
              last_name: lastName.trim(),
              country_code: countryCode.toUpperCase(),
            },
          },
        });
        if (error) throw error;

        if (data.user) {
          const id = data.user.id;

          // Build the desired profile row for first insert
          const fullName =
            `${firstName.trim()} ${lastName.trim()}`.trim() || null;
          const insertPayload = {
            id,
            email,
            role, // set on initial insert to avoid later role-change restrictions
            first_name: firstName.trim() || null,
            last_name: lastName.trim() || null,
            full_name: fullName,
            country_code: countryCode.toUpperCase(),
            university: role === "trainee" ? university.trim() || null : null,
            hospital: role === "instructor" ? hospital.trim() || null : null,
          };

          // Try to INSERT the profile row immediately
          const { error: insertErr } = await supabase
            .from("profiles")
            .insert(insertPayload);

          if (insertErr) {
            // If a row already exists (e.g., a trigger or a parallel process inserted it),
            // update non-role fields; set role only if it's currently NULL.

            // A profile row may not exist yet on first signup (timing/triggers/RLS). Do NOT use .single().
            // Ensure it exists, then fetch with maybeSingle().
            await ensureProfile(supabase);

            const { data: profRow, error: selErr } = await supabase
              .from("profiles")
              .select("role")
              .eq("id", id)
              .maybeSingle();
            if (selErr) throw selErr;

            const updatePayload: Record<string, string | null | Role> = {
              email,
              first_name: firstName.trim() || null,
              last_name: lastName.trim() || null,
              full_name: fullName,
              country_code: countryCode.toUpperCase(),
              university: role === "trainee" ? university.trim() || null : null,
              hospital: role === "instructor" ? hospital.trim() || null : null,
            };
            // Only include role if it's currently null/empty to satisfy policies like
            // "Only admins can change role".
            if (!profRow || !profRow.role) {
              (updatePayload as Record<string, unknown>).role = role;
            }

            const { error: updErr } = await supabase
              .from("profiles")
              .update(updatePayload)
              .eq("id", id);

            if (updErr) throw updErr;
          }

          // Success toast (non-error look)
          setToast({
            open: true,
            text: "Account created. You can now sign in.",
          });
          // Auto-hide toast after 4s
          setTimeout(() => setToast({ open: false, text: "" }), 4000);
          setMode("signin");
        }
      } else {
        const { data, error } = await supabase.auth.signInWithPassword({
          email,
          password,
        });
        if (error) throw error;

        if (data.user) {
          setToast({ open: true, text: "Signed in successfully" });
          setTimeout(() => setToast({ open: false, text: "" }), 2500);
          await ensureProfile(supabase);
          await supabase.auth.getSession();
          await new Promise((r) => setTimeout(r, 0));
          router.replace(redirect || "/");
          return;
        }
      }
    } catch (err: unknown) {
      showError(err);
    } finally {
      setLoading(false);
    }
  }

  // CountrySelect returns alpha-2 string
  function onCountryChange(code: string) {
    setCountryCode((code || "").toUpperCase());
  }

  return (
    <div className="relative flex min-h-[100dvh] text-[var(--foreground)]">
      {/* ===== LEFT PANEL — Branding ===== */}
      <div
        className={[
          "hidden lg:flex lg:w-[44%] flex-col justify-between",
          "relative overflow-hidden",
          "bg-gradient-to-br from-[color:var(--accent)]/[0.06] via-[color:var(--accent)]/[0.03] to-transparent",
          "dark:from-[color:var(--accent)]/[0.08] dark:via-[color:var(--accent)]/[0.03] dark:to-transparent",
          "border-r border-[var(--border)]",
        ].join(" ")}
      >
        {/* Subtle radial glow */}
        <div
          aria-hidden
          className="pointer-events-none absolute -top-32 -left-32 h-96 w-96 rounded-full bg-[color:var(--accent)]/[0.08] blur-3xl"
        />
        <div
          aria-hidden
          className="pointer-events-none absolute -bottom-24 -right-24 h-72 w-72 rounded-full bg-[color:var(--accent)]/[0.06] blur-3xl"
        />

        {/* Content */}
        <div className="relative z-10 flex flex-1 flex-col justify-center px-10 xl:px-14">
          {/* Logo + title */}
          <div className="mb-10">
            <Image
              src="/TC_Logo.png"
              alt="True Competency"
              width={72}
              height={72}
              priority
              className="mb-4"
            />
            <h1 className="font-heading text-2xl font-bold tracking-tight text-[var(--foreground)]">
              True Competency
            </h1>
            <p className="mt-1 text-sm text-[var(--muted)]">
              TCIP APSC IVUS Competency Platform
            </p>
          </div>

          {/* Accent divider */}
          <div className="mb-8 h-px w-16 bg-[color:var(--accent)]/50" />

          {/* Context-dependent content */}
          {mode === "signup" ? (
            <div className="space-y-4">
              <h2 className="font-heading text-base font-semibold text-[var(--foreground)]">
                {roleInfo.title}
              </h2>
              <ul className="space-y-3">
                {roleInfo.points.map((p) => (
                  <li key={p} className="flex items-start gap-2.5 text-sm text-[var(--foreground)]/80">
                    <CheckIcon />
                    <span>{p}</span>
                  </li>
                ))}
              </ul>
            </div>
          ) : (
            <div className="space-y-4">
              <p className="text-sm leading-relaxed text-[var(--foreground)]/70">
                A modern training platform for interventional cardiology —
                structured evaluations, evidence collection, and transparent
                progress tracking for trainees, instructors, and committees.
              </p>
              <ul className="space-y-3">
                {FEATURES.map((f) => (
                  <li key={f} className="flex items-start gap-2.5 text-sm text-[var(--foreground)]/80">
                    <CheckIcon />
                    <span>{f}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>

        {/* Partner logos at bottom */}
        <div className="relative z-10 border-t border-[var(--border)] px-10 py-6 xl:px-14">
          <p className="mb-3 text-xs font-medium uppercase tracking-wider text-[var(--muted)]">
            In partnership with
          </p>
          <div className="flex items-center gap-8">
            <Image
              src="/APSC_Logo.png"
              alt="Asian Pacific Society of Cardiology"
              width={160}
              height={160}
              className="h-14 w-auto object-contain opacity-80"
            />
            <Image
              src={tcipLogoSrc}
              alt="TCIP Program"
              width={160}
              height={160}
              className="h-14 w-auto object-contain opacity-80"
            />
          </div>
        </div>
      </div>

      {/* ===== RIGHT PANEL — Form ===== */}
      <div className="flex flex-1 flex-col bg-[var(--background)]">
        {/* Mobile header (shown only on < lg) */}
        <div className="flex items-center gap-3 border-b border-[var(--border)] px-6 py-4 lg:hidden">
          <Image
            src="/TC_Logo.png"
            alt="True Competency"
            width={36}
            height={36}
            priority
          />
          <div>
            <p className="font-heading text-sm font-bold text-[var(--foreground)]">
              True Competency
            </p>
            <p className="text-xs text-[var(--muted)]">
              TCIP APSC IVUS Platform
            </p>
          </div>
        </div>

        {/* Centered form area */}
        <div className="flex flex-1 items-center justify-center px-6 py-10 sm:px-10">
          <div className="w-full max-w-md">
            {/* Heading */}
            <div className="mb-8">
              <h2 className="font-heading text-2xl font-bold tracking-tight text-[var(--foreground)]">
                {mode === "signin" ? "Welcome back" : "Create your account"}
              </h2>
              <p className="mt-1.5 text-sm text-[var(--muted)]">
                {mode === "signin"
                  ? "Sign in to continue to your dashboard"
                  : "Get started with True Competency"}
              </p>
            </div>

            {/* Mode toggle — segmented control */}
            <div className="mb-6 flex rounded-xl border border-[var(--border)] bg-[var(--field)] p-1">
              <button
                type="button"
                onClick={() => setMode("signin")}
                className={[
                  "flex-1 rounded-lg py-2 text-sm font-medium transition-all",
                  mode === "signin"
                    ? "bg-[var(--surface)] text-[var(--foreground)] shadow-sm border border-[var(--border)]"
                    : "text-[var(--muted)] hover:text-[var(--foreground)] border border-transparent",
                ].join(" ")}
              >
                Sign In
              </button>
              <button
                type="button"
                onClick={() => setMode("signup")}
                className={[
                  "flex-1 rounded-lg py-2 text-sm font-medium transition-all",
                  mode === "signup"
                    ? "bg-[var(--surface)] text-[var(--foreground)] shadow-sm border border-[var(--border)]"
                    : "text-[var(--muted)] hover:text-[var(--foreground)] border border-transparent",
                ].join(" ")}
              >
                Sign Up
              </button>
            </div>

            {/* Role selector (signup only) */}
            {mode === "signup" && (
              <div className="mb-6 flex flex-wrap items-center gap-2">
                <span className="text-xs font-medium text-[var(--muted)]">I am a:</span>
                <RoleChip
                  label="trainee"
                  active={role === "trainee"}
                  onClick={() => setRole("trainee")}
                />
                <RoleChip
                  label="instructor"
                  active={role === "instructor"}
                  onClick={() => setRole("instructor")}
                />
                <RoleChip
                  label="committee"
                  active={role === "committee"}
                  onClick={() => setRole("committee")}
                />
              </div>
            )}

            {/* Form */}
            <form onSubmit={handleSubmit} className="space-y-4">
              {mode === "signup" && (
                <>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <Field
                      label="First name"
                      type="text"
                      value={firstName}
                      onChange={setFirstName}
                      placeholder="Jane"
                      autoComplete="given-name"
                    />
                    <Field
                      label="Last name"
                      type="text"
                      value={lastName}
                      onChange={setLastName}
                      placeholder="Doe"
                      autoComplete="family-name"
                    />
                  </div>

                  {/* Country */}
                  <div>
                    <label className="mb-1.5 block text-sm font-medium text-[var(--foreground)]/90">
                      Country <span className="text-red-500">*</span>
                    </label>
                    <div
                      className={[
                        "rounded-xl border border-[var(--border)] bg-[var(--field)] p-1",
                        "focus-within:border-[color:var(--accent)] focus-within:shadow-[0_0_0_3px_color-mix(in_oklab,var(--accent)_12%,transparent)]",
                        "transition-all",
                      ].join(" ")}
                    >
                      <CountrySelect
                        value={countryCode || null}
                        onChange={onCountryChange}
                        placeholder="Select your country…"
                      />
                    </div>
                  </div>

                  {/* Optional org by role */}
                  {role === "trainee" && (
                    <Field
                      label="University (optional)"
                      type="text"
                      value={university}
                      onChange={setUniversity}
                      placeholder="e.g., McGill University"
                      autoComplete="organization"
                      required={false}
                    />
                  )}
                  {role === "instructor" && (
                    <Field
                      label="Hospital (optional)"
                      type="text"
                      value={hospital}
                      onChange={setHospital}
                      placeholder="e.g., Montreal General Hospital"
                      autoComplete="organization"
                      required={false}
                    />
                  )}
                </>
              )}

              {/* Email */}
              <Field
                label="Email Address"
                type="email"
                value={email}
                onChange={setEmail}
                placeholder="user@example.com"
                autoComplete="email"
              />

              {/* Passwords */}
              <PasswordField
                label="Password"
                value={password}
                onChange={setPassword}
                placeholder={
                  mode === "signup" ? "Create a password" : "Enter password"
                }
                autoComplete={
                  mode === "signup" ? "new-password" : "current-password"
                }
              />
              {mode === "signup" && (
                <PasswordField
                  label="Confirm password"
                  value={confirm}
                  onChange={setConfirm}
                  placeholder="Re-enter password"
                  autoComplete="new-password"
                />
              )}

              <button
                type="submit"
                disabled={loading}
                className={[
                  "relative mt-3 w-full rounded-xl py-3 text-sm font-semibold",
                  "bg-[var(--accent)] text-white disabled:opacity-60",
                  "shadow-[0_1px_2px_rgba(0,0,0,0.06),0_6px_16px_color-mix(in_oklab,var(--accent)_22%,transparent)]",
                  "transition-all hover:brightness-110 active:scale-[0.99]",
                ].join(" ")}
              >
                {loading
                  ? "Please wait…"
                  : mode === "signup"
                    ? "Create Account"
                    : "Sign In"}
              </button>
            </form>

            {/* Divider */}
            <div className="my-6 flex items-center gap-3">
              <div className="h-px flex-1 bg-[var(--border)]" />
              <span className="text-xs text-[var(--muted)]">or</span>
              <div className="h-px flex-1 bg-[var(--border)]" />
            </div>

            {/* Toggle */}
            <p className="text-center text-sm text-[var(--muted)]">
              {mode === "signin" ? (
                <>
                  Don&apos;t have an account?{" "}
                  <button
                    type="button"
                    onClick={() => setMode("signup")}
                    className="font-medium text-[var(--accent)] hover:underline underline-offset-2"
                  >
                    Create account
                  </button>
                </>
              ) : (
                <>
                  Already have an account?{" "}
                  <button
                    type="button"
                    onClick={() => setMode("signin")}
                    className="font-medium text-[var(--accent)] hover:underline underline-offset-2"
                  >
                    Sign in here
                  </button>
                </>
              )}
            </p>

            {msg && (
              <p className="mt-4 text-center text-sm text-red-500">{msg}</p>
            )}
          </div>
        </div>
      </div>

      {/* Success toast */}
      {toast.open && (
        <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-50">
          <div
            className="rounded-lg border px-4 py-2 text-sm shadow-lg"
            style={{
              background: "var(--ok)",
              color: "#0b2d17",
              borderColor: "#1c6b3d",
            }}
          >
            {toast.text}
          </div>
        </div>
      )}
    </div>
  );
}
