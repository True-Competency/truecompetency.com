"use client";

import { useEffect, useMemo, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import countryList from "react-select-country-list";
import CountrySelect from "@/components/CountrySelect";
import { supabase } from "@/lib/supabaseClient";
import * as Sentry from "@sentry/nextjs";

function Field({
  label,
  type,
  value,
  onChange,
  placeholder,
  autoComplete,
  required = true,
  disabled = false,
}: {
  label: string;
  type: "text" | "email" | "password";
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
  autoComplete?: string;
  required?: boolean;
  disabled?: boolean;
}) {
  return (
    <div className="space-y-2">
      <label className="text-sm font-medium text-[var(--foreground)]">
        {label}
      </label>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        autoComplete={autoComplete}
        required={required}
        disabled={disabled}
        className="w-full px-4 py-3 bg-[var(--field)] border border-[var(--border)] text-[var(--foreground)] placeholder:text-[var(--muted)] focus:outline-none focus:ring-2 focus:ring-[#5170ff]/50 focus:border-[#5170ff] transition-all disabled:opacity-60"
        style={{ borderRadius: "16px" }}
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
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
  autoComplete?: string;
}) {
  const [show, setShow] = useState(false);
  return (
    <div className="space-y-2">
      <label className="text-sm font-medium text-[var(--foreground)]">
        {label}
      </label>
      <div className="relative">
        <input
          type={show ? "text" : "password"}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          autoComplete={autoComplete}
          required
          className="w-full px-4 py-3 pr-12 bg-[var(--field)] border border-[var(--border)] text-[var(--foreground)] placeholder:text-[var(--muted)] focus:outline-none focus:ring-2 focus:ring-[#5170ff]/50 focus:border-[#5170ff] transition-all"
          style={{ borderRadius: "16px" }}
        />
        <button
          type="button"
          aria-label={show ? "Hide password" : "Show password"}
          onClick={() => setShow((s) => !s)}
          className="absolute right-3 top-1/2 -translate-y-1/2 p-2 text-[var(--muted)] hover:text-[var(--foreground)] transition-colors"
        >
          {show ? (
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
              <path
                d="M3 3l18 18M10.58 10.58A3 3 0 0012 15a3 3 0 001.42-.38M9.88 5.08A10.94 10.94 0 0112 5c5 0 9.27 3.11 11 7-.41.94-1 1.8-1.7 2.57M6.53 6.53C4.2 7.86 2.54 9.74 1 12c.64 1.17 1.5 2.24 2.53 3.17A11.22 11.22 0 0012 19c1.3 0 2.55-.2 3.72-.58"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          ) : (
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
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

function WelcomeRightPanel() {
  return (
    <div className="relative h-full min-h-[500px] rounded-3xl overflow-hidden bg-gradient-to-br from-[#5170ff] via-[#6b85ff] to-[#8599ff] p-8 flex flex-col justify-between">
      <div className="absolute inset-0 overflow-hidden">
        <div className="absolute top-0 right-0 w-96 h-96 bg-white/10 rounded-full blur-3xl animate-float" />
        <div className="absolute bottom-0 left-0 w-80 h-80 bg-white/10 rounded-full blur-3xl animate-float-delayed" />
      </div>
      <div className="absolute inset-0 opacity-10">
        <div
          className="absolute inset-0"
          style={{
            backgroundImage:
              "linear-gradient(rgba(255,255,255,0.1) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.1) 1px, transparent 1px)",
            backgroundSize: "50px 50px",
          }}
        />
      </div>

      <div className="relative z-10 flex flex-col justify-center flex-1 space-y-8">
        <div className="space-y-4">
          <div className="inline-block px-4 py-1.5 rounded-full bg-white/20 backdrop-blur-sm text-white text-sm font-medium">
            Committee Invitation
          </div>
          <h2 className="text-4xl font-bold text-white leading-tight">
            Join the True Competency committee
          </h2>
          <p className="text-lg text-white/90 leading-relaxed">
            Set up your account to start proposing competencies, reviewing
            questions, and shaping the program.
          </p>
        </div>
        <div className="space-y-4">
          {[
            "Create a secure password for your committee account",
            "Add your name and location for committee records",
            "Enter your hospital so members can recognize your profile",
          ].map((item) => (
            <div key={item} className="flex items-start gap-3 text-white/95">
              <div className="flex-shrink-0 w-6 h-6 rounded-full bg-white/20 backdrop-blur-sm flex items-center justify-center mt-0.5">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
                  <path
                    d="M20 6L9 17l-5-5"
                    stroke="white"
                    strokeWidth="3"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              </div>
              <p className="text-base leading-relaxed">{item}</p>
            </div>
          ))}
        </div>
      </div>

      <div className="relative z-10 mt-8">
        <div className="rounded-2xl border border-white/20 bg-white/10 backdrop-blur-sm p-4">
          <p className="text-sm font-semibold text-white">
            Invited role: Committee Member
          </p>
          <p className="mt-1 text-sm text-white/80">
            New invitees are added as committee members.
          </p>
        </div>
      </div>
    </div>
  );
}

export default function WelcomePage() {
  const router = useRouter();
  const countryOptions = useMemo(() => countryList().getData(), []);

  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [countryCode, setCountryCode] = useState("");
  const [hospital, setHospital] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [agreeToTerms, setAgreeToTerms] = useState(false);

  const [msg, setMsg] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    try {
      const sp = new URLSearchParams(window.location.search);
      const emailParam = sp.get("email");
      if (emailParam) setEmail(emailParam);
    } catch {
      // no-op
    }
  }, []);

  function validate(): string | null {
    if (!/^\S+@\S+\.\S+$/.test(email)) return "Please enter a valid email.";
    if (!firstName.trim() || !lastName.trim())
      return "Please enter your first and last name.";
    if (!countryCode) return "Please select your country.";
    if (!hospital.trim()) return "Please enter your hospital.";
    if (password.length < 8) return "Password must be at least 8 characters.";
    if (password !== confirm) return "Passwords do not match.";
    if (!agreeToTerms) return "You must agree to the terms and conditions.";
    return null;
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setMsg(null);

    const v = validate();
    if (v) {
      setMsg(v);
      return;
    }

    setSaving(true);
    const normalizedEmail = email.trim().toLowerCase();
    try {
      const countryName =
        countryOptions.find((o) => o.value === countryCode)?.label ?? null;

      const res = await fetch("/api/welcome-signup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: normalizedEmail,
          password,
          first_name: firstName.trim(),
          last_name: lastName.trim(),
          country_code: countryCode.toUpperCase(),
          country_name: countryName,
          hospital: hospital.trim(),
        }),
      });

      const json = (await res.json().catch(() => null)) as {
        ok?: boolean;
        error?: string;
      } | null;

      if (!res.ok || !json?.ok) {
        throw new Error(json?.error || "Account creation failed.");
      }

      // Account exists server-side now. Try to sign in directly; on failure
      // redirect to /signin with the email pre-filled rather than throwing,
      // so the user has a clean recovery path (the form would otherwise 409).
      const { error: signInError } = await supabase.auth.signInWithPassword({
        email: normalizedEmail,
        password,
      });
      if (signInError) {
        Sentry.captureException(signInError, {
          tags: { flow: "committee_welcome_signup" },
          extra: { stage: "post_create_signin" },
        });
        router.replace(
          `/signin?accountCreated=1&email=${encodeURIComponent(normalizedEmail)}`,
        );
        return;
      }

      router.replace("/committee");
    } catch (error) {
      Sentry.captureException(error, {
        tags: { flow: "committee_welcome_signup" },
      });
      setMsg(
        error instanceof Error ? error.message : "Failed to create your account.",
      );
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="min-h-screen bg-[var(--background)] flex items-center justify-center p-4">
      <style jsx global>{`
        @keyframes float {
          0%,
          100% {
            transform: translate(0, 0) scale(1);
          }
          50% {
            transform: translate(30px, -30px) scale(1.1);
          }
        }
        @keyframes float-delayed {
          0%,
          100% {
            transform: translate(0, 0) scale(1);
          }
          50% {
            transform: translate(-30px, 30px) scale(1.1);
          }
        }
        .animate-float {
          animation: float 20s ease-in-out infinite;
        }
        .animate-float-delayed {
          animation: float-delayed 25s ease-in-out infinite;
        }
      `}</style>

      <div className="w-full max-w-6xl">
        <div className="text-center mb-10">
          <div className="flex flex-col items-center gap-4">
            <Image
              src="/TC_Logo.png"
              alt="True Competency"
              width={80}
              height={80}
              priority
              className="drop-shadow-2xl"
            />
            <div>
              <h1 className="text-3xl font-bold text-[var(--foreground)] mb-1">
                True Competency
              </h1>
              <p className="text-sm text-[var(--muted)]">
                TCIP APSC IVUS Competency Platform
              </p>
            </div>
          </div>
        </div>

        <div
          className="bg-[var(--surface)] shadow-2xl overflow-hidden"
          style={{ borderRadius: "40px" }}
        >
          <div className="grid lg:grid-cols-2 gap-0">
            <div className="p-8 lg:p-12">
              <div className="mb-6">
                <h2 className="text-3xl font-bold text-[var(--foreground)]">
                  Join the committee
                </h2>
                <p className="text-[var(--muted)] mt-2">
                  Set up your account to enter the committee dashboard.
                </p>
              </div>

              <form onSubmit={handleSubmit} className="space-y-5">
                <div className="grid grid-cols-2 gap-4">
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

                <div className="space-y-2">
                  <label className="text-sm font-medium text-[var(--muted)]">
                    Country
                  </label>
                  <div
                    className="border border-[var(--border)] bg-[var(--field)] p-2"
                    style={{ borderRadius: "16px" }}
                  >
                    <CountrySelect
                      value={countryCode || null}
                      onChange={(c) => setCountryCode((c || "").toUpperCase())}
                      placeholder="Select your country..."
                    />
                  </div>
                </div>

                <Field
                  label="Hospital"
                  type="text"
                  value={hospital}
                  onChange={setHospital}
                  placeholder="e.g., Montreal General Hospital"
                  autoComplete="organization"
                />

                <Field
                  label="Email Address"
                  type="email"
                  value={email}
                  onChange={setEmail}
                  placeholder="user@example.com"
                  autoComplete="email"
                />

                <PasswordField
                  label="Password"
                  value={password}
                  onChange={setPassword}
                  placeholder="Create a password"
                  autoComplete="new-password"
                />

                <PasswordField
                  label="Confirm password"
                  value={confirm}
                  onChange={setConfirm}
                  placeholder="Re-enter password"
                  autoComplete="new-password"
                />

                <div className="flex items-start gap-3">
                  <input
                    type="checkbox"
                    id="terms"
                    checked={agreeToTerms}
                    onChange={(e) => setAgreeToTerms(e.target.checked)}
                    className="mt-1 w-4 h-4 rounded border-[var(--border)] text-[#5170ff] focus:ring-[#5170ff]"
                  />
                  <label htmlFor="terms" className="text-sm text-[var(--muted)]">
                    I agree to the{" "}
                    <a
                      href="/terms"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-[#5170ff] hover:text-[#4060ef] font-medium underline"
                    >
                      terms and conditions
                    </a>
                  </label>
                </div>

                {msg && (
                  <div
                    className="p-3 border border-[color:var(--err)]/30 bg-[color:var(--err)]/10"
                    style={{ borderRadius: "12px" }}
                  >
                    <p className="text-sm text-[var(--err)]">{msg}</p>
                  </div>
                )}

                <button
                  type="submit"
                  disabled={saving}
                  className="w-full py-3 px-4 bg-[#5170ff] hover:bg-[#4060ef] text-white font-semibold shadow-lg shadow-[#5170ff]/30 hover:shadow-xl hover:shadow-[#5170ff]/40 transition-all duration-300 disabled:opacity-50 disabled:cursor-not-allowed"
                  style={{ borderRadius: "16px" }}
                >
                  {saving ? "Creating account…" : "Create account"}
                </button>
              </form>

              <p className="mt-6 text-center text-sm text-[var(--muted)]">
                Already have an account?{" "}
                <Link
                  href="/signin"
                  className="font-semibold text-[#5170ff] hover:text-[#4060ef] transition-colors"
                >
                  Sign in here
                </Link>
              </p>
            </div>

            <div className="hidden lg:block bg-[var(--field)] p-8">
              <WelcomeRightPanel />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
