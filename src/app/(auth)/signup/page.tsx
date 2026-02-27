"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";
import { ensureProfile } from "@/lib/ensureProfile";
import CountrySelect from "@/components/CountrySelect";

type Role = "trainee" | "instructor" | "committee";

const ROLE_INFO: Record<Role, { title: string; points: string[] }> = {
  trainee: {
    title: "Trainee",
    points: [
      "Track progress across enrolled competencies",
      "Answer case-based questions with instant feedback",
      "Build a performance record for instructors and committee",
    ],
  },
  instructor: {
    title: "Instructor",
    points: [
      "Monitor trainee progress in real time",
      "Review answers and provide targeted feedback",
      "Approve completed competencies",
    ],
  },
  committee: {
    title: "Committee",
    points: [
      "Manage frameworks and assessment standards",
      "See program-wide analytics and trends",
      "Approve new competencies and maintain compliance",
    ],
  },
};

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
        "px-4 py-2 text-sm font-medium transition-all duration-300 relative overflow-hidden",
        active
          ? "bg-[#5170ff] text-white shadow-lg shadow-[#5170ff]/25"
          : "bg-white text-gray-700 hover:bg-gray-50 border border-gray-200",
      ].join(" ")}
      style={{ borderRadius: "20px" }}
    >
      <span className="relative z-10">
        {label.charAt(0).toUpperCase() + label.slice(1)}
      </span>
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
    <div className="space-y-2">
      <label className="text-sm font-medium text-gray-700">{label}</label>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        autoComplete={autoComplete}
        required={required}
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

function SignUpRightPanel({ role }: { role: Role }) {
  const roleInfo = ROLE_INFO[role];

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
            Your Role
          </div>
          <h2 className="text-4xl font-bold text-white leading-tight">
            {roleInfo.title}
          </h2>
          <p className="text-lg text-white/90">
            Join as {roleInfo.title.toLowerCase()}
          </p>
        </div>

        <div className="space-y-4">
          {roleInfo.points.map((point) => (
            <div key={point} className="flex items-start gap-3 text-white/95">
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
              <p className="text-base leading-relaxed">{point}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

export default function SignUpPage() {
  const router = useRouter();

  const [redirect, setRedirect] = useState<string>("/");
  const [role, setRole] = useState<Role>("trainee");

  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [confirm, setConfirm] = useState("");
  const [countryCode, setCountryCode] = useState<string>("");
  const [university, setUniversity] = useState("");
  const [hospital, setHospital] = useState("");
  const [agreeToTerms, setAgreeToTerms] = useState(false);

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
      const roleParam = sp.get("role");
      const emailParam = sp.get("email");
      if (r && typeof r === "string") setRedirect(r);
      if (
        (roleParam === "trainee" ||
          roleParam === "instructor" ||
          roleParam === "committee") &&
        typeof roleParam === "string"
      ) {
        setRole(roleParam);
      }
      if (emailParam && typeof emailParam === "string") {
        setEmail(emailParam);
      }
    } catch {
      // no-op
    }
  }, []);

  function validate(): string | null {
    if (!/^\S+@\S+\.\S+$/.test(email)) return "Please enter a valid email.";
    if (!firstName.trim() || !lastName.trim())
      return "Please enter your first and last name.";
    if (!countryCode) return "Please select your country.";
    if (password.length < 8) return "Password must be at least 8 characters.";
    if (password !== confirm) return "Passwords do not match.";
    if (!agreeToTerms) return "You must agree to the terms and conditions.";
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
      const emailRedirectTo =
        typeof window !== "undefined"
          ? `${window.location.origin}/signin?verified=1`
          : undefined;

      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          emailRedirectTo,
          data: {
            first_name: firstName.trim(),
            last_name: lastName.trim(),
            country_code: countryCode.toUpperCase(),
            role,
            committee_role: role === "committee" ? "editor" : null,
            university: role === "trainee" ? university.trim() || null : null,
            hospital:
              role === "instructor" || role === "committee"
                ? hospital.trim() || null
                : null,
          },
        },
      });
      if (error) throw error;

      if (data.user) {
        // In environments without email verification, session may exist immediately.
        if (data.session) {
          await ensureProfile(supabase, role);
          setToast({
            open: true,
            text: "Account created successfully. Redirecting to sign in...",
          });
          setTimeout(() => {
            setToast({ open: false, text: "" });
            router.replace(
              `/signin?redirect=${encodeURIComponent(redirect || "/")}`,
            );
          }, 1200);
          return;
        }

        // Email verification path: no session yet, so show clear guidance.
        setToast({
          open: true,
          text: "Account created. Please confirm your email before signing in.",
        });
        setTimeout(() => {
          setToast({ open: false, text: "" });
          router.replace(
            `/signin?redirect=${encodeURIComponent(
              redirect || "/",
            )}&checkEmail=1&email=${encodeURIComponent(email)}`,
          );
        }, 1200);
      }
    } catch (err: unknown) {
      showError(err);
    } finally {
      setLoading(false);
    }
  }

  function onCountryChange(code: string) {
    setCountryCode((code || "").toUpperCase());
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
              <div className="mb-6">
                <h2 className="text-3xl font-bold text-gray-900">Create Account</h2>
                <p className="text-gray-600 mt-2">Set up your profile</p>
              </div>

              <div className="mb-6">
                <label className="block text-sm font-medium text-gray-700 mb-3">
                  I am a:
                </label>
                <div className="flex flex-wrap gap-2">
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
                  <label className="text-sm font-medium text-gray-700">Country</label>
                  <div className="border border-gray-200 bg-white p-2" style={{ borderRadius: "16px" }}>
                    <CountrySelect
                      value={countryCode || null}
                      onChange={onCountryChange}
                      placeholder="Select your country..."
                    />
                  </div>
                </div>

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

                {(role === "instructor" || role === "committee") && (
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
                    className="mt-1 w-4 h-4 rounded border-gray-300 text-[#5170ff] focus:ring-[#5170ff]"
                  />
                  <label htmlFor="terms" className="text-sm text-gray-600">
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
                  {loading ? "Please wait..." : "Create Account"}
                </button>
              </form>

              <p className="mt-6 text-center text-sm text-gray-600">
                Already have an account?{" "}
                <Link
                  href={`/signin?redirect=${encodeURIComponent(redirect || "/")}`}
                  className="font-semibold text-[#5170ff] hover:text-[#4060ef] transition-colors"
                >
                  Sign in here
                </Link>
              </p>
            </div>

            <div className="hidden lg:block bg-gray-50 p-8">
              <SignUpRightPanel role={role} />
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
