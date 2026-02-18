"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";
import { ensureProfile } from "@/lib/ensureProfile";
import { useTheme } from "next-themes";

function Field({
  label,
  type,
  value,
  onChange,
  placeholder,
  autoComplete,
}: {
  label: string;
  type: "email" | "password";
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
  autoComplete?: string;
}) {
  return (
    <div className="group">
      <label className="mb-1.5 block text-sm font-medium text-[var(--foreground)]">
        {label}
      </label>
      <div className="relative rounded-xl border bg-[var(--field)] border-[var(--border)] focus-within:border-[color:var(--accent)] transition-colors">
        <input
          type={type}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          autoComplete={autoComplete}
          required
          className="w-full rounded-xl px-3 py-2.5 outline-none bg-transparent text-[var(--foreground)] placeholder:[color:var(--muted)]"
        />
      </div>
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
    <div className="group">
      <label className="mb-1.5 block text-sm font-medium text-[var(--foreground)]">
        {label}
      </label>
      <div className="relative rounded-xl border bg-[var(--field)] border-[var(--border)] focus-within:border-[color:var(--accent)] transition-colors">
        <input
          type={show ? "text" : "password"}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          autoComplete={autoComplete}
          required
          className="w-full rounded-xl pl-3 pr-10 py-2.5 outline-none bg-transparent text-[var(--foreground)] placeholder:[color:var(--muted)]"
        />
        <button
          type="button"
          aria-label={show ? "Hide password" : "Show password"}
          onClick={() => setShow((s) => !s)}
          className="absolute right-2 top-1/2 -translate-y-1/2 inline-flex h-7 w-7 items-center justify-center rounded-lg border border-[var(--border)] bg-[var(--surface)] text-[var(--foreground)]/80 hover:bg-[var(--field)] transition-transform hover:scale-[1.08] active:scale-[0.98]"
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

function SignInRightPanel({ theme }: { theme: string | undefined }) {
  const tcipLogoSrc =
    theme === "dark" ? "/TCIP_White_Logo.png" : "/TCIP_Black_Logo.png";

  return (
    <div className="relative h-full min-h-[500px] rounded-3xl overflow-hidden bg-gradient-to-br from-[#5170ff] via-[#6b85ff] to-[#8599ff] p-8 flex flex-col justify-between">
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
          <h2 className="text-4xl font-bold text-white leading-tight">
            Welcome to True Competency
          </h2>
          <p className="text-lg text-white/90 leading-relaxed">
            Structured competency assessment for interventional cardiology.
          </p>
        </div>
      </div>

      <div className="relative z-10 mt-8">
        <div className="flex items-center justify-center gap-8 opacity-80">
          <Image
            src="/APSC_Logo.png"
            alt="Asian Pacific Society of Cardiology"
            width={70}
            height={70}
            className="w-16 h-16 object-contain drop-shadow-md"
          />
          <Image
            src={tcipLogoSrc}
            alt="TCIP Program"
            width={70}
            height={70}
            className="w-16 h-16 object-contain drop-shadow-md"
          />
        </div>
      </div>
    </div>
  );
}

export default function SignInPage() {
  const router = useRouter();
  const { resolvedTheme } = useTheme();

  const [redirect, setRedirect] = useState<string>("/");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [msg, setMsg] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    try {
      const sp = new URLSearchParams(window.location.search);
      const r = sp.get("redirect");
      if (r && typeof r === "string") setRedirect(r);
    } catch {
      // no-op
    }
  }, []);

  function validate(): string | null {
    if (!/^\S+@\S+\.\S+$/.test(email)) return "Please enter a valid email.";
    if (!password.trim()) return "Please enter your password.";
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
          .join(" - ") || "Something went wrong";
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
      const { data, error } = await supabase.auth.signInWithPassword({
        email,
        password,
      });
      if (error) throw error;

      if (data.user) {
        await ensureProfile(supabase);
        await supabase.auth.getSession();
        await new Promise((r) => setTimeout(r, 0));
        router.replace(redirect || "/");
      }
    } catch (err: unknown) {
      showError(err);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-white dark:bg-gray-50 flex items-center justify-center p-4">
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
              <h1 className="text-3xl font-bold text-gray-900 mb-1">
                True Competency
              </h1>
              <p className="text-sm text-gray-600">
                TCIP APSC IVUS Competency Platform
              </p>
            </div>
          </div>
        </div>

        <div
          className="bg-white shadow-2xl overflow-hidden"
          style={{ borderRadius: "40px" }}
        >
          <div className="grid lg:grid-cols-2 gap-0">
            <div className="p-8 lg:p-12">
              <div className="mb-8">
                <h2 className="text-3xl font-bold text-gray-900">Sign In</h2>
                <p className="text-gray-600 mt-2">Continue to your dashboard</p>
              </div>

              <form onSubmit={handleSubmit} className="space-y-5">
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
                  placeholder="Enter password"
                  autoComplete="current-password"
                />

                {msg && (
                  <div
                    className="p-3 bg-red-50 border border-red-200"
                    style={{ borderRadius: "12px" }}
                  >
                    <p className="text-sm text-red-600">{msg}</p>
                  </div>
                )}

                <button
                  type="submit"
                  disabled={loading}
                  className="w-full py-3 px-4 bg-[#5170ff] hover:bg-[#4060ef] text-white font-semibold shadow-lg shadow-[#5170ff]/30 hover:shadow-xl hover:shadow-[#5170ff]/40 transition-all duration-300 disabled:opacity-50 disabled:cursor-not-allowed"
                  style={{ borderRadius: "16px" }}
                >
                  {loading ? "Please wait..." : "Sign In"}
                </button>
              </form>

              <p className="mt-6 text-center text-sm text-gray-600">
                Do not have an account?{" "}
                <Link
                  href={`/signup?redirect=${encodeURIComponent(redirect || "/")}`}
                  className="font-semibold text-[#5170ff] hover:text-[#4060ef] transition-colors"
                >
                  Create account
                </Link>
              </p>
            </div>

            <div className="hidden lg:block bg-gray-50 p-8">
              <SignInRightPanel theme={resolvedTheme} />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
