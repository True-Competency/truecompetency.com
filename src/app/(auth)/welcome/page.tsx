"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import countryList from "react-select-country-list";
import CountrySelect from "@/components/CountrySelect";
import { ensureProfile } from "@/lib/ensureProfile";
import { supabase } from "@/lib/supabaseClient";

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
      <label className="text-sm font-medium text-gray-700">{label}</label>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        autoComplete={autoComplete}
        required={required}
        disabled={disabled}
        className="w-full px-4 py-3 bg-white border border-gray-200 text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-[#5170ff]/50 focus:border-[#5170ff] transition-all disabled:bg-gray-50 disabled:text-gray-500"
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
            Finish your committee profile
          </h2>
          <p className="text-lg text-white/90 leading-relaxed">
            Your invitation is ready. Set your password and complete a few
            profile details to enter the committee dashboard.
          </p>
        </div>

        <div className="space-y-4">
          {[
            "Create a secure password for your invited account",
            "Add your full name and location for committee records",
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
            New invitees are added as committee editors.
          </p>
        </div>
      </div>
    </div>
  );
}

function splitName(fullName: string) {
  const clean = fullName.trim().replace(/\s+/g, " ");
  if (!clean) return { firstName: null, lastName: null };
  const parts = clean.split(" ");
  return {
    firstName: parts[0] ?? null,
    lastName: parts.slice(1).join(" ") || null,
  };
}

export default function WelcomePage() {
  const router = useRouter();
  const countryOptions = useMemo(() => countryList().getData(), []);

  const [email, setEmail] = useState("");
  const [fullName, setFullName] = useState("");
  const [countryCode, setCountryCode] = useState("");
  const [hospital, setHospital] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const invitedUserRef = useRef<import("@supabase/supabase-js").User | null>(
    null,
  );

  useEffect(() => {
    const sp = new URLSearchParams(window.location.search);
    const invitedEmail = sp.get("email");
    if (invitedEmail) setEmail(invitedEmail);

    let subscription: { unsubscribe: () => void } | null = null;

    async function init() {
      // ── Step 1: Extract invite tokens from URL hash BEFORE doing anything else ──
      const hash = window.location.hash;
      const hashParams = new URLSearchParams(hash.substring(1));
      const accessToken = hashParams.get("access_token");
      const refreshToken = hashParams.get("refresh_token");
      const type = hashParams.get("type"); // will be "invite"

      // ── Step 2: Only sign out if there is NO invite token in the URL ──
      // If we sign out while an invite token is present, we kill the session
      if (!accessToken) {
        await supabase.auth.signOut();
      }

      // ── Step 3: Set session from invite token ──
      if (accessToken && refreshToken) {
        const { error: sessionError } = await supabase.auth.setSession({
          access_token: accessToken,
          refresh_token: refreshToken,
        });
        if (sessionError) {
          // Token is expired or invalid — show clear message, stop spinner
          setMsg(
            "This invitation link has expired. Please contact the committee chair to send a new invitation to your email.",
          );
          setLoading(false);
          return;
        }
      } else if (!accessToken) {
        // No token in URL and no existing session — direct navigation to /welcome
        setMsg(
          "This page is only accessible via an invitation link. Please check your email.",
        );
        setLoading(false);
        return;
      }

      // ── Step 4: Listen for auth state ──
      const { data } = supabase.auth.onAuthStateChange(
        async (event, session) => {
          if (event === "SIGNED_IN" && session?.user) {
            invitedUserRef.current = session.user;
            const user = session.user;
            const metadata = (user.user_metadata ?? {}) as Record<
              string,
              unknown
            >;
            const profileRole =
              typeof metadata.role === "string" ? metadata.role : null;

            // Non-committee user landed here — send them away
            if (profileRole && profileRole !== "committee") {
              router.replace("/signin");
              return;
            }

            setEmail(user.email ?? invitedEmail ?? "");
            setInfo("Complete your invited committee account to continue.");
            setLoading(false);
          } else if (event === "INITIAL_SESSION" && !session) {
            // Should not happen if setSession succeeded, but just in case
            setMsg(
              "Failed to establish your invitation session. Please try clicking the link again.",
            );
            setLoading(false);
          }
        },
      );

      subscription = data.subscription;
    }

    void init();
    return () => subscription?.unsubscribe();
  }, [router]);

  function validate() {
    if (!email.trim()) return "Missing invited email address.";
    if (!fullName.trim()) return "Please enter your full name.";
    if (!countryCode) return "Please select your country.";
    if (!hospital.trim()) return "Please enter your hospital.";
    if (password.length < 8) return "Password must be at least 8 characters.";
    if (password !== confirm) return "Passwords do not match.";
    return null;
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setMsg(null);
    setInfo(null);

    const validationError = validate();
    if (validationError) {
      setMsg(validationError);
      return;
    }

    setSaving(true);
    try {
      const user = invitedUserRef.current;
      if (!user) {
        throw new Error(
          "Your invitation session has expired. Please reopen the invite link from your email.",
        );
      }

      console.log("WELCOME handleSubmit user:", user?.id, user?.email); // ADD THIS LINE

      const { firstName, lastName } = splitName(fullName);
      const countryName =
        countryOptions.find((option) => option.value === countryCode)?.label ??
        null;

      const { error: authError } = await supabase.auth.updateUser({
        password,
        data: {
          role: "committee",
          committee_role: "editor",
          first_name: firstName,
          last_name: lastName,
          full_name: fullName.trim(),
          country_code: countryCode,
          country_name: countryName,
          hospital: hospital.trim(),
        },
      });
      if (authError) throw authError;

      const { error: profileError } = await supabase.from("profiles").upsert(
        {
          id: user.id,
          email: user.email ?? email.trim(),
          role: "committee",
          committee_role: "editor",
          first_name: firstName,
          last_name: lastName,
          full_name: fullName.trim(),
          country_code: countryCode,
          country_name: countryName,
          hospital: hospital.trim(),
        },
        { onConflict: "id" },
      );
      if (profileError) throw profileError;

      setInfo("Welcome aboard. Redirecting to the committee dashboard…");
      setTimeout(() => {
        router.replace("/committee");
      }, 900);
    } catch (error) {
      setMsg(
        error instanceof Error
          ? error.message
          : "Failed to complete your account setup.",
      );
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="min-h-screen bg-white dark:bg-gray-50 flex items-center justify-center p-4">
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
              <div className="mb-6">
                <h2 className="text-3xl font-bold text-gray-900">
                  Complete your invitation
                </h2>
                <p className="text-gray-600 mt-2">
                  Finish setting up your committee account before entering the
                  platform.
                </p>
              </div>

              {info && (
                <div
                  className="mb-5 border border-blue-200 bg-blue-50 px-4 py-3"
                  style={{ borderRadius: "14px" }}
                >
                  <p className="text-sm text-blue-700">{info}</p>
                </div>
              )}

              {msg && (
                <div
                  className="mb-5 border border-red-200 bg-red-50 px-4 py-3"
                  style={{ borderRadius: "14px" }}
                >
                  <p className="text-sm text-red-600">{msg}</p>
                </div>
              )}

              {loading ? (
                <div className="flex flex-col items-center justify-center py-12 gap-4">
                  <div className="w-8 h-8 border-2 border-[#5170ff] border-t-transparent rounded-full animate-spin" />
                  <p className="text-sm text-gray-500">
                    Setting up your account… This may take a moment.
                  </p>
                </div>
              ) : (
                <form onSubmit={handleSubmit} className="space-y-5">
                  <Field
                    label="Invited email"
                    type="email"
                    value={email}
                    onChange={setEmail}
                    placeholder="name@hospital.org"
                    autoComplete="email"
                    disabled
                  />

                  <Field
                    label="Full name"
                    type="text"
                    value={fullName}
                    onChange={setFullName}
                    placeholder="Dr. Jane Doe"
                    autoComplete="name"
                  />

                  <div className="space-y-2">
                    <label className="text-sm font-medium text-gray-700">
                      Country
                    </label>
                    <div
                      className="border border-gray-200 bg-white p-2"
                      style={{ borderRadius: "16px" }}
                    >
                      <CountrySelect
                        value={countryCode || null}
                        onChange={(code) => setCountryCode(code.toUpperCase())}
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

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <PasswordField
                      label="Create password"
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
                  </div>

                  <button
                    type="submit"
                    disabled={saving}
                    className="w-full py-3.5 text-white font-semibold transition-all duration-300 hover:shadow-xl hover:shadow-[#5170ff]/25 disabled:opacity-70 disabled:cursor-not-allowed"
                    style={{
                      background:
                        "linear-gradient(135deg, #5170ff 0%, #6b85ff 100%)",
                      borderRadius: "16px",
                    }}
                  >
                    {saving ? "Finishing setup…" : "Enter committee dashboard"}
                  </button>
                </form>
              )}
            </div>

            <div className="hidden lg:block p-4">
              <WelcomeRightPanel />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
