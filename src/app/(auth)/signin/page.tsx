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
    <div className="space-y-2">
      <label className="text-sm font-medium text-gray-700">{label}</label>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        autoComplete={autoComplete}
        required
        className="w-full px-4 py-3 bg-white border border-gray-200 text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-[#5170ff]/50 focus:border-[#5170ff] transition-all"
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
      <label className="text-sm font-medium text-gray-700">{label}</label>
      <div className="relative">
        <input
          type={show ? "text" : "password"}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          autoComplete={autoComplete}
          required
          className="w-full px-4 py-3 pr-12 bg-white border border-gray-200 text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-[#5170ff]/50 focus:border-[#5170ff] transition-all"
          style={{ borderRadius: "16px" }}
        />
        <button
          type="button"
          aria-label={show ? "Hide password" : "Show password"}
          onClick={() => setShow((s) => !s)}
          className="absolute right-3 top-1/2 -translate-y-1/2 p-2 text-gray-400 hover:text-gray-600 transition-colors"
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

function SignInRightPanel({
  theme,
}: {
  theme: string | undefined;
}) {
  const tcipLogoSrc =
    theme === "dark" ? "/TCIP_White_Logo.png" : "/TCIP_Black_Logo.png";

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
          <h2 className="text-4xl font-bold text-white leading-tight">
            Welcome to True Competency
          </h2>
          <p className="text-lg text-white/90 leading-relaxed">
            Structured competency assessment for interventional cardiology
            training.
          </p>
        </div>

        <div className="space-y-4">
          <div className="flex items-center gap-3 text-white/95">
            <div className="w-10 h-10 rounded-full bg-white/20 backdrop-blur-sm flex items-center justify-center flex-shrink-0">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
                <path
                  d="M9 11L12 14L22 4"
                  stroke="white"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
                <path
                  d="M21 12V19C21 20.1046 20.1046 21 19 21H5C3.89543 21 3 20.1046 3 19V5C3 3.89543 3.89543 3 5 3H16"
                  stroke="white"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </div>
            <span className="text-base">Evidence-based assessment</span>
          </div>

          <div className="flex items-center gap-3 text-white/95">
            <div className="w-10 h-10 rounded-full bg-white/20 backdrop-blur-sm flex items-center justify-center flex-shrink-0">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
                <circle cx="12" cy="12" r="10" stroke="white" strokeWidth="2" />
                <path
                  d="M12 6V12L16 14"
                  stroke="white"
                  strokeWidth="2"
                  strokeLinecap="round"
                />
              </svg>
            </div>
            <span className="text-base">Real-time progress tracking</span>
          </div>
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
        <p className="text-center text-white/70 text-xs mt-3">
          In partnership with APSC and TCIP
        </p>
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
  const [toast, setToast] = useState<{ open: boolean; text: string }>({
    open: false,
    text: "",
  });

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
        setToast({ open: true, text: "Signed in successfully" });
        setTimeout(() => setToast({ open: false, text: "" }), 2500);
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
      <style jsx global>{`
        @keyframes float {
          0%, 100% { transform: translate(0, 0) scale(1); }
          50% { transform: translate(30px, -30px) scale(1.1); }
        }
        @keyframes float-delayed {
          0%, 100% { transform: translate(0, 0) scale(1); }
          50% { transform: translate(-30px, 30px) scale(1.1); }
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
              <h1 className="text-3xl font-bold text-gray-900 mb-1">
                True Competency
              </h1>
              <p className="text-sm text-gray-600">
                TCIP APSC IVUS Competency Platform
              </p>
            </div>
          </div>
        </div>

        <div className="bg-white shadow-2xl overflow-hidden" style={{ borderRadius: "40px" }}>
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
                  <div className="p-3 bg-red-50 border border-red-200" style={{ borderRadius: "12px" }}>
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

      {toast.open && (
        <div className="fixed bottom-8 left-1/2 -translate-x-1/2 z-50">
          <div className="bg-green-500 text-white px-6 py-3 rounded-lg shadow-lg flex items-center gap-3">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
              <path
                d="M20 6L9 17l-5-5"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
            <span className="font-medium">{toast.text}</span>
          </div>
        </div>
      )}
    </div>
  );
}
