// src/app/account/page.client.tsx
"use client";

import {
  ChangeEvent,
  FormEvent,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { supabase } from "@/lib/supabaseClient";
import CountrySelect from "@/components/CountrySelect";
import { Camera, Loader2, Upload } from "lucide-react";

type Props = { email: string };

type ProfileRow = {
  id: string;
  email: string;
  role: string;
  first_name: string | null;
  last_name: string | null;
  full_name: string | null;
  country_code: string | null;
  country_name: string | null;
  university: string | null;
  hospital: string | null;
  avatar_path: string | null;
};

type CountryRow = {
  code: string;
  name: string;
};

export default function AccountClient({ email }: Props) {
  /* ---------------- profile state ---------------- */
  const [profileLoading, setProfileLoading] = useState(true);
  const [profileSaving, setProfileSaving] = useState(false);
  const [profile, setProfile] = useState<ProfileRow | null>(null);
  const [countries, setCountries] = useState<CountryRow[]>([]);

  // editable fields
  const [emailState, setEmailState] = useState("");
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [fullName, setFullName] = useState("");
  const [countryCode, setCountryCode] = useState<string>("");
  const [countryName, setCountryName] = useState<string>("");
  const [university, setUniversity] = useState("");
  const [hospital, setHospital] = useState("");

  const [profileMsg, setProfileMsg] = useState<string | null>(null);
  const [profileErr, setProfileErr] = useState<string | null>(null);
  const [avatarUrl, setAvatarUrl] = useState<string>("");
  const [avatarUploading, setAvatarUploading] = useState(false);
  const avatarInputRef = useRef<HTMLInputElement>(null);

  /* ---------------- password state ---------------- */
  const [currentPwd, setCurrentPwd] = useState("");
  const [newPwd, setNewPwd] = useState("");
  const [confirm, setConfirm] = useState("");

  const [showCur, setShowCur] = useState(false);
  const [showNew, setShowNew] = useState(false);
  const [showConf, setShowConf] = useState(false);
  const [pwdLoading, setPwdLoading] = useState(false);
  const [pwdMsg, setPwdMsg] = useState<string | null>(null);
  const [pwdKind, setPwdKind] = useState<"ok" | "err" | null>(null);

  const tooShort = newPwd.length > 0 && newPwd.length < 8;
  const mismatch = confirm.length > 0 && newPwd !== confirm;

  const canSubmitPwd = useMemo(() => {
    if (!newPwd || !confirm) return false;
    if (tooShort || mismatch) return false;
    return true;
  }, [newPwd, confirm, tooShort, mismatch]);

  /* ---------------- helpers ---------------- */

  const isValidEmail = (val: string): boolean =>
    /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(val.trim());
  const AVATAR_ALLOWED = ["image/jpeg", "image/png", "image/webp"];
  const AVATAR_MAX_BYTES = 5 * 1024 * 1024;

  const makeAvatarUrl = useCallback((path: string | null) => {
    if (!path) return "";
    const { data } = supabase.storage.from("profile-pictures").getPublicUrl(path);
    return data.publicUrl ? `${data.publicUrl}?v=${Date.now()}` : "";
  }, []);

  const resolveCountryName = useCallback(
    (code: string): string => {
      if (!code) return "";
      const found = countries.find(
        (c) => c.code.toUpperCase() === code.toUpperCase()
      );
      return found ? found.name : "";
    },
    [countries]
  );

  const handleCountryChange = (code: string) => {
    const upper = (code || "").toUpperCase();
    setCountryCode(upper);
    const resolved = resolveCountryName(upper);
    setCountryName(resolved || "");
  };

  /* ---------------- load profile + countries ---------------- */

  useEffect(() => {
    let active = true;

    async function load() {
      setProfileLoading(true);
      setProfileErr(null);
      setProfileMsg(null);

      try {
        const {
          data: { user },
          error: userErr,
        } = await supabase.auth.getUser();
        if (userErr) throw userErr;
        if (!user) throw new Error("Not signed in.");

        const { data: prof, error: profErr } = await supabase
          .from("profiles")
          .select(
            "id,email,role,first_name,last_name,full_name,country_code,country_name,university,hospital,avatar_path"
          )
          .eq("id", user.id)
          .maybeSingle<ProfileRow>();

        if (profErr) throw profErr;
        if (!prof) throw new Error("Profile not found.");

        const { data: cData, error: cErr } = await supabase
          .from("countries")
          .select("code,name")
          .order("name", { ascending: true });
        if (cErr) {
          console.warn("countries load error", cErr.message);
        }

        if (active) {
          setProfile(prof);
          setEmailState(prof.email);
          setFirstName(prof.first_name ?? "");
          setLastName(prof.last_name ?? "");
          setFullName(prof.full_name ?? "");
          setCountryCode(prof.country_code ?? "");
          setCountryName(prof.country_name ?? "");
          setUniversity(prof.university ?? "");
          setHospital(prof.hospital ?? "");
          setCountries(cData ?? []);
          setAvatarUrl(makeAvatarUrl(prof.avatar_path ?? null));
        }
      } catch (e) {
        if (active) {
          setProfileErr(
            e instanceof Error ? e.message : "Failed to load your profile."
          );
        }
      } finally {
        if (active) setProfileLoading(false);
      }
    }

    void load();

    return () => {
      active = false;
    };
  }, [makeAvatarUrl]);

  // auto compose full name if user fills first/last but leaves fullName empty
  useEffect(() => {
    const composed = [firstName.trim(), lastName.trim()]
      .filter(Boolean)
      .join(" ");
    if (composed && !fullName.trim()) {
      setFullName(composed);
    }
  }, [firstName, lastName, fullName]);

  /* ---------------- save profile ---------------- */

  async function onSaveProfile(e: FormEvent) {
    e.preventDefault();
    setProfileMsg(null);
    setProfileErr(null);

    if (!profile) return;

    if (!isValidEmail(emailState)) {
      setProfileErr(
        "Please enter a valid email address (like name@example.com)."
      );
      return;
    }

    setProfileSaving(true);

    try {
      const payload = {
        email: emailState.trim(),
        first_name: firstName.trim() || null,
        last_name: lastName.trim() || null,
        full_name: fullName.trim() || null,
        country_code: countryCode || null,
        country_name: countryName || null,
        university:
          profile.role === "trainee"
            ? university.trim() || null
            : profile.university,
        hospital:
          profile.role === "instructor"
            ? hospital.trim() || null
            : profile.hospital,
        avatar_path: profile.avatar_path ?? null,
      };

      // Update profiles table
      const { error: updErr } = await supabase
        .from("profiles")
        .update(payload)
        .eq("id", profile.id);
      if (updErr) throw updErr;

      // Update auth user (email + metadata)
      const { error: authErr } = await supabase.auth.updateUser({
        email: payload.email,
        data: {
          first_name: payload.first_name,
          last_name: payload.last_name,
          full_name: payload.full_name,
          country_code: payload.country_code,
          country_name: payload.country_name,
          university: payload.university,
          hospital: payload.hospital,
        },
      });

      if (authErr) {
        console.warn("auth update failed:", authErr.message);
        setProfileMsg(
          "Profile updated. Email change may require re-login/confirmation."
        );
      } else {
        setProfileMsg("Profile updated.");
      }

      setProfile((prev) =>
        prev
          ? {
              ...prev,
              email: payload.email,
              first_name: payload.first_name,
              last_name: payload.last_name,
              full_name: payload.full_name,
              country_code: payload.country_code,
              country_name: payload.country_name,
              university: payload.university,
              hospital: payload.hospital,
              avatar_path: payload.avatar_path,
            }
          : prev
      );
    } catch (e) {
      setProfileErr(e instanceof Error ? e.message : "Failed to save profile.");
    } finally {
      setProfileSaving(false);
    }
  }

  async function onAvatarPick(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.currentTarget.value = "";
    if (!file) return;

    setProfileMsg(null);
    setProfileErr(null);

    if (!AVATAR_ALLOWED.includes(file.type)) {
      setProfileErr("Unsupported file type. Use JPG, PNG, or WEBP.");
      return;
    }
    if (file.size > AVATAR_MAX_BYTES) {
      setProfileErr("Profile picture is too large. Max size is 5 MB.");
      return;
    }

    setAvatarUploading(true);
    try {
      const reqRes = await fetch("/api/avatar/request", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mimeType: file.type, fileSize: file.size }),
      });
      const reqJson = (await reqRes.json()) as {
        error?: string;
        signedUrl?: string;
        storagePath?: string;
      };
      if (!reqRes.ok || !reqJson.signedUrl || !reqJson.storagePath) {
        throw new Error(reqJson.error || "Failed to initialize avatar upload.");
      }

      const uploadRes = await fetch(reqJson.signedUrl, {
        method: "PUT",
        headers: { "Content-Type": file.type || "application/octet-stream" },
        body: file,
      });
      if (!uploadRes.ok) {
        throw new Error(`Avatar upload failed (${uploadRes.status}).`);
      }

      const confRes = await fetch("/api/avatar/confirm", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ storagePath: reqJson.storagePath }),
      });
      const confJson = (await confRes.json()) as { error?: string };
      if (!confRes.ok) {
        throw new Error(confJson.error || "Failed to save avatar.");
      }

      setProfile((prev) =>
        prev ? { ...prev, avatar_path: reqJson.storagePath ?? prev.avatar_path } : prev
      );
      setAvatarUrl(makeAvatarUrl(reqJson.storagePath ?? null));
      setProfileMsg("Profile picture updated.");
    } catch (err) {
      setProfileErr(
        err instanceof Error ? err.message : "Failed to upload profile picture."
      );
    } finally {
      setAvatarUploading(false);
    }
  }

  /* ---------------- password update ---------------- */

  useEffect(() => {
    setPwdMsg(null);
    setPwdKind(null);
  }, [newPwd, confirm, currentPwd]);

  async function tryUpdatePassword(): Promise<void> {
    // First attempt with current session
    const { error } = await supabase.auth.updateUser({ password: newPwd });
    if (!error) return;

    const needsRecentLogin =
      /recent/i.test(error.message) ||
      /reauth/i.test(error.message) ||
      /invalid/i.test(error.message) ||
      /session/i.test(error.message);

    if (!needsRecentLogin) {
      throw error;
    }

    // If we need fresh session, re-login using current password
    const loginEmail = emailState || email;
    if (!loginEmail || !currentPwd) {
      throw new Error(
        "This change requires your current password. Please enter it and try again."
      );
    }

    const { error: signErr } = await supabase.auth.signInWithPassword({
      email: loginEmail,
      password: currentPwd,
    });
    if (signErr) throw signErr;

    const { error: updErr2 } = await supabase.auth.updateUser({
      password: newPwd,
    });
    if (updErr2) throw updErr2;
  }

  async function onSubmitPassword(e: FormEvent) {
    e.preventDefault();
    setPwdMsg(null);
    setPwdKind(null);

    if (tooShort) {
      setPwdMsg("Password must be at least 8 characters.");
      setPwdKind("err");
      return;
    }
    if (mismatch) {
      setPwdMsg("Passwords do not match.");
      setPwdKind("err");
      return;
    }

    setPwdLoading(true);
    try {
      await tryUpdatePassword();
      setPwdMsg("Password updated successfully.");
      setPwdKind("ok");
      setCurrentPwd("");
      setNewPwd("");
      setConfirm("");
    } catch (err) {
      const text =
        (err as { message?: string })?.message ??
        "Failed to update password. Please try again.";
      setPwdMsg(text);
      setPwdKind("err");
    } finally {
      setPwdLoading(false);
    }
  }

  /* ---------------- render ---------------- */

  return (
    <main className="bg-[var(--background)] text-[var(--foreground)] transition-colors">
      {/* Header */}
      <section className="mx-auto max-w-5xl px-6 lg:px-10 pt-8 pb-4">
        <h1 className="text-3xl md:text-4xl font-semibold tracking-tight">
          Account
        </h1>
        <div className="accent-underline mt-3" />
        <p className="mt-3 text-sm md:text-base text-[var(--muted)] max-w-prose">
          Manage your profile information and update your password.
        </p>
      </section>

      <section className="mx-auto max-w-5xl px-6 lg:px-10 pb-10 space-y-7">
        {/* Profile card */}
        <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-6 md:p-7 space-y-5">
          <div className="flex items-center justify-between gap-3">
            <h2 className="text-lg font-semibold">Profile</h2>
            {profileMsg && !profileErr && (
              <div className="rounded-lg bg-emerald-500/90 text-white px-3 py-1.5 text-xs shadow">
                {profileMsg}
              </div>
            )}
          </div>

          {profileErr && (
            <p className="rounded-lg bg-red-950/30 border border-red-700/40 px-3 py-2 text-sm text-red-100">
              {profileErr}
            </p>
          )}

          {profileLoading ? (
            <p className="text-sm text-[var(--muted)]">Loading…</p>
          ) : !profile ? (
            <p className="text-sm text-[var(--muted)]">No profile found.</p>
          ) : (
            <form onSubmit={onSaveProfile} className="space-y-5">
              <div className="flex items-center gap-4 rounded-xl border border-[var(--border)] bg-[var(--field)] p-3">
                <div className="relative h-16 w-16 rounded-full overflow-hidden border border-[var(--border)] bg-[var(--surface)] grid place-items-center">
                  {avatarUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={avatarUrl}
                      alt="Profile picture"
                      className="h-full w-full object-cover"
                    />
                  ) : (
                    <span className="text-lg font-semibold text-[var(--muted)]">
                      {(fullName || emailState || "U").trim().charAt(0).toUpperCase()}
                    </span>
                  )}
                  {avatarUploading && (
                    <div className="absolute inset-0 bg-black/35 grid place-items-center">
                      <Loader2 size={16} className="animate-spin text-white" />
                    </div>
                  )}
                </div>

                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium">Profile picture</p>
                  <p className="text-xs text-[var(--muted)] mt-0.5">
                    JPG, PNG, WEBP • max 5 MB
                  </p>
                  <div className="mt-2 flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => avatarInputRef.current?.click()}
                      disabled={avatarUploading}
                      className="inline-flex items-center gap-1.5 rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 py-1.5 text-xs font-medium hover:border-[color:var(--accent)] hover:text-[var(--accent)] transition-colors disabled:opacity-60"
                    >
                      {avatarUploading ? <Loader2 size={12} className="animate-spin" /> : <Upload size={12} />}
                      {avatarUploading ? "Uploading…" : "Upload new"}
                    </button>
                    <button
                      type="button"
                      onClick={() => avatarInputRef.current?.click()}
                      disabled={avatarUploading}
                      className="inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs text-[var(--muted)] hover:text-[var(--foreground)] transition-colors disabled:opacity-60"
                    >
                      <Camera size={12} />
                      Change
                    </button>
                  </div>
                </div>

                <input
                  ref={avatarInputRef}
                  type="file"
                  accept=".jpg,.jpeg,.png,.webp,image/jpeg,image/png,image/webp"
                  className="hidden"
                  onChange={onAvatarPick}
                />
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <label className="flex flex-col gap-1 text-sm">
                  <span className="font-medium">First name</span>
                  <input
                    value={firstName}
                    onChange={(e) => setFirstName(e.target.value)}
                    className="w-full rounded-xl border border-[var(--border)] bg-[var(--field)] px-3 py-2 outline-none focus:border-[color:var(--accent)]"
                    placeholder="Jane"
                  />
                </label>
                <label className="flex flex-col gap-1 text-sm">
                  <span className="font-medium">Last name</span>
                  <input
                    value={lastName}
                    onChange={(e) => setLastName(e.target.value)}
                    className="w-full rounded-xl border border-[var(--border)] bg-[var(--field)] px-3 py-2 outline-none focus:border-[color:var(--accent)]"
                    placeholder="Doe"
                  />
                </label>
              </div>

              <label className="flex flex-col gap-1 text-sm">
                <span className="font-medium">Full name</span>
                <input
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  className="w-full rounded-xl border border-[var(--border)] bg-[var(--field)] px-3 py-2 outline-none focus:border-[color:var(--accent)]"
                  placeholder="Jane Doe"
                />
              </label>

              <label className="flex flex-col gap-1 text-sm">
                <span className="font-medium">Email</span>
                <input
                  value={emailState}
                  onChange={(e) => setEmailState(e.target.value)}
                  className="w-full rounded-xl border border-[var(--border)] bg-[var(--field)] px-3 py-2 outline-none focus:border-[color:var(--accent)]"
                  placeholder="you@example.com"
                />
              </label>

              <div className="flex flex-col gap-1 text-sm">
                <span className="font-medium">
                  Country <span className="text-red-500">*</span>
                </span>
                <div className="rounded-xl border border-[var(--border)] bg-[var(--field)] p-1.5">
                  <CountrySelect
                    value={countryCode || null}
                    onChange={handleCountryChange}
                    placeholder="Select your country…"
                  />
                </div>
                {countryName ? (
                  <p className="text-xs text-[var(--muted)]">{countryName}</p>
                ) : null}
              </div>

              {profile.role === "trainee" && (
                <label className="flex flex-col gap-1 text-sm">
                  <span className="font-medium">University (optional)</span>
                  <input
                    value={university}
                    onChange={(e) => setUniversity(e.target.value)}
                    className="w-full rounded-xl border border-[var(--border)] bg-[var(--field)] px-3 py-2 outline-none focus:border-[color:var(--accent)]"
                    placeholder="e.g. McGill University"
                  />
                </label>
              )}
              {profile.role === "instructor" && (
                <label className="flex flex-col gap-1 text-sm">
                  <span className="font-medium">Hospital (optional)</span>
                  <input
                    value={hospital}
                    onChange={(e) => setHospital(e.target.value)}
                    className="w-full rounded-xl border border-[var(--border)] bg-[var(--field)] px-3 py-2 outline-none focus:border-[color:var(--accent)]"
                    placeholder="e.g. Queen Elizabeth Hospital"
                  />
                </label>
              )}

              <div>
                <button
                  type="submit"
                  disabled={profileSaving}
                  className="inline-flex items-center gap-2 rounded-xl bg-[color:var(--accent)] px-4 py-2 text-sm font-medium text:white text-white shadow hover:scale-[1.01] active:scale-[0.995] transition-transform disabled:opacity-70"
                >
                  {profileSaving ? "Saving…" : "Save profile"}
                </button>
              </div>
            </form>
          )}
        </div>

        {/* Password card */}
        <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-6 md:p-7 space-y-4">
          <h2 className="text-lg font-semibold">Change password</h2>
          <p className="text-sm text-[var(--muted)]">
            For security, you may be asked to confirm your current password.
          </p>

          <form onSubmit={onSubmitPassword} className="mt-2 space-y-3">
            <FieldPassword
              label="Current password"
              value={currentPwd}
              onChange={setCurrentPwd}
              placeholder="Enter current password (if prompted)"
              show={showCur}
              setShow={setShowCur}
              autoComplete="current-password"
              required={false}
            />

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <FieldPassword
                label="New password"
                value={newPwd}
                onChange={setNewPwd}
                placeholder="Enter new password"
                show={showNew}
                setShow={setShowNew}
                autoComplete="new-password"
              />
              <FieldPassword
                label="Confirm new password"
                value={confirm}
                onChange={setConfirm}
                placeholder="Re-enter new password"
                show={showConf}
                setShow={setShowConf}
                autoComplete="new-password"
              />
            </div>

            <div className="text-xs text-[var(--muted)]">
              • Minimum 8 characters. Consider a mix of letters, numbers, and
              symbols.
            </div>

            {pwdMsg && (
              <div
                className="mt-2 rounded-lg px-3 py-2 text-sm"
                style={{
                  border:
                    pwdKind === "ok"
                      ? "1px solid color-mix(in oklab, var(--ok) 60%, transparent)"
                      : "1px solid color-mix(in oklab, var(--err) 60%, transparent)",
                  background:
                    pwdKind === "ok"
                      ? "color-mix(in oklab, var(--ok) 8%, transparent)"
                      : "color-mix(in oklab, var(--err) 8%, transparent)",
                }}
              >
                {pwdMsg}
              </div>
            )}

            <div className="pt-1">
              <button
                disabled={!canSubmitPwd || pwdLoading}
                className={[
                  "rounded-xl px-4 py-2 text-sm font-semibold btn-primary",
                  "bg-[var(--accent)] disabled:opacity-60",
                  "shadow-[0_8px_24px_color-mix(in_oklab,var(--accent)_22%,transparent)]",
                ].join(" ")}
              >
                {pwdLoading ? "Updating…" : "Update password"}
              </button>
            </div>
          </form>
        </div>
      </section>
    </main>
  );
}

/* ---------------- small field component ---------------- */

function FieldPassword({
  label,
  value,
  onChange,
  placeholder,
  show,
  setShow,
  autoComplete,
  required = true,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  show: boolean;
  setShow: (v: boolean) => void;
  autoComplete?: string;
  required?: boolean;
}) {
  return (
    <div className="group">
      <label className="mb-1.5 block text-sm font-medium text-[var(--foreground)]">
        {label}
      </label>
      <div
        className={[
          "relative rounded-xl border bg-[var(--field)] border-[var(--border)]",
          "focus-within:border-[color:var(--accent)] transition-colors",
        ].join(" ")}
      >
        <input
          type={show ? "text" : "password"}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          autoComplete={autoComplete}
          required={required}
          className="w-full rounded-xl px-3 py-2.5 pr-12 bg-transparent outline-none text-[var(--foreground)] placeholder:[color:var(--muted)]"
        />

        <button
          type="button"
          onClick={() => setShow(!show)}
          aria-label={show ? "Hide password" : "Show password"}
          className="absolute right-2 top-1/2 -translate-y-1/2 rounded-lg border border-[var(--border)] bg-[var(--surface)] px-2 py-1 text-xs text-[var(--foreground)]/85 hover:bg-[var(--background)]/60"
        >
          {show ? "Hide" : "Show"}
        </button>

        <span className="pointer-events-none absolute inset-x-0 -bottom-0.5 h-[2px] rounded-full opacity-0 group-focus-within:opacity-100 transition-opacity glow-accent" />
      </div>
    </div>
  );
}
