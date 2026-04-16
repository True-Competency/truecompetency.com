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
import { Camera, Loader2 } from "lucide-react";

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
    const { data } = supabase.storage
      .from("profile-pictures")
      .getPublicUrl(path);
    return data.publicUrl ? `${data.publicUrl}?v=${Date.now()}` : "";
  }, []);

  const resolveCountryName = useCallback(
    (code: string): string => {
      if (!code) return "";
      const found = countries.find(
        (c) => c.code.toUpperCase() === code.toUpperCase(),
      );
      return found ? found.name : "";
    },
    [countries],
  );

  const handleCountryChange = (code: string) => {
    const upper = (code || "").toUpperCase();
    setCountryCode(upper);
    const resolved = resolveCountryName(upper);
    setCountryName(resolved || "");
  };

  /* ---------------- load ---------------- */

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
            "id,email,role,first_name,last_name,full_name,country_code,country_name,university,hospital,avatar_path",
          )
          .eq("id", user.id)
          .maybeSingle<ProfileRow>();

        if (profErr) throw profErr;
        if (!prof) throw new Error("Profile not found.");

        const { data: cData, error: cErr } = await supabase
          .from("countries")
          .select("code,name")
          .order("name", { ascending: true });
        if (cErr) console.warn("countries load error", cErr.message);

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
        if (active)
          setProfileErr(
            e instanceof Error ? e.message : "Failed to load your profile.",
          );
      } finally {
        if (active) setProfileLoading(false);
      }
    }

    void load();
    return () => {
      active = false;
    };
  }, [makeAvatarUrl]);

  useEffect(() => {
    const composed = [firstName.trim(), lastName.trim()]
      .filter(Boolean)
      .join(" ");
    if (composed && !fullName.trim()) setFullName(composed);
  }, [firstName, lastName, fullName]);

  /* ---------------- save profile ---------------- */

  async function onSaveProfile(e: FormEvent) {
    e.preventDefault();
    setProfileMsg(null);
    setProfileErr(null);
    if (!profile) return;

    if (!isValidEmail(emailState)) {
      setProfileErr("Please enter a valid email address.");
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
          profile.role === "instructor" || profile.role === "committee"
            ? hospital.trim() || null
            : profile.hospital,
        avatar_path: profile.avatar_path ?? null,
      };

      const { error: updErr } = await supabase
        .from("profiles")
        .update(payload)
        .eq("id", profile.id);
      if (updErr) throw updErr;

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
        setProfileMsg("Profile updated. Email change may require re-login.");
      } else {
        setProfileMsg("Profile updated successfully.");
      }

      setProfile((prev) => (prev ? { ...prev, ...payload } : prev));
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
      if (!uploadRes.ok)
        throw new Error(`Avatar upload failed (${uploadRes.status}).`);

      const confRes = await fetch("/api/avatar/confirm", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ storagePath: reqJson.storagePath }),
      });
      const confJson = (await confRes.json()) as { error?: string };
      if (!confRes.ok)
        throw new Error(confJson.error || "Failed to save avatar.");

      setProfile((prev) =>
        prev
          ? { ...prev, avatar_path: reqJson.storagePath ?? prev.avatar_path }
          : prev,
      );
      setAvatarUrl(makeAvatarUrl(reqJson.storagePath ?? null));
      setProfileMsg("Profile picture updated.");
    } catch (err) {
      setProfileErr(
        err instanceof Error
          ? err.message
          : "Failed to upload profile picture.",
      );
    } finally {
      setAvatarUploading(false);
    }
  }

  /* ---------------- password ---------------- */

  useEffect(() => {
    setPwdMsg(null);
    setPwdKind(null);
  }, [newPwd, confirm, currentPwd]);

  async function tryUpdatePassword(): Promise<void> {
    const { error } = await supabase.auth.updateUser({ password: newPwd });
    if (!error) return;

    const needsRecentLogin =
      /recent/i.test(error.message) ||
      /reauth/i.test(error.message) ||
      /invalid/i.test(error.message) ||
      /session/i.test(error.message);

    if (!needsRecentLogin) throw error;

    const loginEmail = emailState || email;
    if (!loginEmail || !currentPwd) {
      throw new Error(
        "This change requires your current password. Please enter it and try again.",
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
      setPwdMsg(
        (err as { message?: string })?.message ?? "Failed to update password.",
      );
      setPwdKind("err");
    } finally {
      setPwdLoading(false);
    }
  }

  /* ---------------- render ---------------- */

  const initials = (fullName || `${firstName} ${lastName}` || emailState || "U")
    .trim()
    .charAt(0)
    .toUpperCase();

  const roleLabel = profile?.role
    ? profile.role.charAt(0).toUpperCase() + profile.role.slice(1)
    : null;

  return (
    <main className="bg-[var(--background)] text-[var(--foreground)] min-h-screen">
      <div className="mx-auto max-w-2xl px-6 py-8 space-y-6">
        {/* ── Page header ── */}
        <div>
          <h1
            className="text-3xl font-bold tracking-tight"
            style={{ fontFamily: "var(--font-heading, sans-serif)" }}
          >
            Account
          </h1>
          <div className="accent-underline mt-3" />
          <p className="mt-3 text-sm text-[var(--muted)]">
            Manage your profile information and update your password.
          </p>
        </div>

        {/* ── Global error ── */}
        {profileErr && (
          <div className="rounded-2xl border border-[color:var(--err)]/30 bg-[color:var(--err)]/10 px-4 py-3 text-sm text-[var(--err)]">
            {profileErr}
          </div>
        )}

        {/* ── Success toast ── */}
        {profileMsg && !profileErr && (
          <div className="rounded-2xl border border-[color:var(--ok)]/30 bg-[color:var(--ok)]/10 px-4 py-3 text-sm text-[var(--ok)]">
            {profileMsg}
          </div>
        )}

        {profileLoading ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 size={24} className="animate-spin text-[var(--muted)]" />
          </div>
        ) : !profile ? (
          <p className="text-sm text-[var(--muted)]">No profile found.</p>
        ) : (
          <form onSubmit={onSaveProfile} className="space-y-5">
            {/* ── Avatar hero ── */}
            <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-6">
              <div className="flex items-center gap-5">
                {/* Avatar with camera overlay */}
                <div className="relative flex-shrink-0">
                  <div
                    className="h-20 w-20 rounded-full overflow-hidden grid place-items-center text-white text-2xl font-bold ring-4 ring-[var(--surface)]"
                    style={{ background: "var(--accent)" }}
                  >
                    {avatarUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={avatarUrl}
                        alt="Profile picture"
                        className="h-full w-full object-cover object-center"
                      />
                    ) : (
                      initials
                    )}
                    {avatarUploading && (
                      <div className="absolute inset-0 bg-black/40 rounded-full grid place-items-center">
                        <Loader2
                          size={18}
                          className="animate-spin text-white"
                        />
                      </div>
                    )}
                  </div>
                  {/* Camera button overlay */}
                  <button
                    type="button"
                    onClick={() => avatarInputRef.current?.click()}
                    disabled={avatarUploading}
                    className="absolute -bottom-1 -right-1 h-7 w-7 rounded-full border-2 border-[var(--surface)] grid place-items-center transition-all hover:scale-110 disabled:opacity-60"
                    style={{ background: "var(--accent)", color: "#fff" }}
                    title="Change profile picture"
                  >
                    <Camera size={13} />
                  </button>
                  <input
                    ref={avatarInputRef}
                    type="file"
                    accept=".jpg,.jpeg,.png,.webp,image/jpeg,image/png,image/webp"
                    className="hidden"
                    onChange={onAvatarPick}
                  />
                </div>

                {/* Name + role */}
                <div className="min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-lg font-semibold text-[var(--foreground)]">
                      {fullName || `${firstName} ${lastName}`.trim() || "—"}
                    </span>
                    {roleLabel && (
                      <span
                        className="text-[10px] font-semibold rounded-full px-2.5 py-0.5 border"
                        style={{
                          background:
                            "color-mix(in oklab, var(--accent) 12%, transparent)",
                          borderColor:
                            "color-mix(in oklab, var(--accent) 25%, transparent)",
                          color: "var(--accent)",
                        }}
                      >
                        {roleLabel}
                      </span>
                    )}
                  </div>
                  <p className="text-sm text-[var(--muted)] mt-0.5">
                    {emailState}
                  </p>
                  {countryName && (
                    <p className="text-xs text-[var(--muted)] mt-0.5">
                      {countryName}
                    </p>
                  )}
                  <p className="text-xs text-[var(--muted)] mt-1.5">
                    JPG, PNG, WEBP · max 5 MB
                  </p>
                </div>
              </div>
            </div>

            {/* ── Personal info section ── */}
            <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-6 space-y-4">
              <h2 className="text-sm font-semibold text-[var(--muted)] uppercase tracking-widest">
                Personal info
              </h2>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <label className="flex flex-col gap-1.5 text-sm">
                  <span className="font-medium text-[var(--foreground)]">
                    First name
                  </span>
                  <input
                    value={firstName}
                    onChange={(e) => setFirstName(e.target.value)}
                    className="w-full rounded-xl border border-[var(--border)] bg-[var(--field)] px-3 py-2.5 text-sm outline-none focus:border-[color:var(--accent)] transition-colors"
                    placeholder="Jane"
                  />
                </label>
                <label className="flex flex-col gap-1.5 text-sm">
                  <span className="font-medium text-[var(--foreground)]">
                    Last name
                  </span>
                  <input
                    value={lastName}
                    onChange={(e) => setLastName(e.target.value)}
                    className="w-full rounded-xl border border-[var(--border)] bg-[var(--field)] px-3 py-2.5 text-sm outline-none focus:border-[color:var(--accent)] transition-colors"
                    placeholder="Doe"
                  />
                </label>
              </div>

              <label className="flex flex-col gap-1.5 text-sm">
                <span className="font-medium text-[var(--foreground)]">
                  Full name
                </span>
                <input
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  className="w-full rounded-xl border border-[var(--border)] bg-[var(--field)] px-3 py-2.5 text-sm outline-none focus:border-[color:var(--accent)] transition-colors"
                  placeholder="Jane Doe"
                />
              </label>

              <label className="flex flex-col gap-1.5 text-sm">
                <span className="font-medium text-[var(--foreground)]">
                  Email
                </span>
                <input
                  value={emailState}
                  onChange={(e) => setEmailState(e.target.value)}
                  className="w-full rounded-xl border border-[var(--border)] bg-[var(--field)] px-3 py-2.5 text-sm outline-none focus:border-[color:var(--accent)] transition-colors"
                  placeholder="you@example.com"
                />
              </label>
            </div>

            {/* ── Location & institution section ── */}
            <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-6 space-y-4">
              <h2 className="text-sm font-semibold text-[var(--muted)] uppercase tracking-widest">
                Location & institution
              </h2>

              <div className="flex flex-col gap-1.5 text-sm">
                <span className="font-medium text-[var(--foreground)]">
                  Country <span className="text-[var(--err)]">*</span>
                </span>
                <div className="rounded-xl border border-[var(--border)] bg-[var(--field)] p-1.5">
                  <CountrySelect
                    value={countryCode || null}
                    onChange={handleCountryChange}
                    placeholder="Select your country…"
                  />
                </div>
              </div>

              {profile.role === "trainee" && (
                <label className="flex flex-col gap-1.5 text-sm">
                  <span className="font-medium text-[var(--foreground)]">
                    University{" "}
                    <span className="text-[var(--muted)] font-normal">
                      (optional)
                    </span>
                  </span>
                  <input
                    value={university}
                    onChange={(e) => setUniversity(e.target.value)}
                    className="w-full rounded-xl border border-[var(--border)] bg-[var(--field)] px-3 py-2.5 text-sm outline-none focus:border-[color:var(--accent)] transition-colors"
                    placeholder="e.g. McGill University"
                  />
                </label>
              )}

              {(profile.role === "instructor" ||
                profile.role === "committee") && (
                <label className="flex flex-col gap-1.5 text-sm">
                  <span className="font-medium text-[var(--foreground)]">
                    Hospital{" "}
                    <span className="text-[var(--muted)] font-normal">
                      (optional)
                    </span>
                  </span>
                  <input
                    value={hospital}
                    onChange={(e) => setHospital(e.target.value)}
                    className="w-full rounded-xl border border-[var(--border)] bg-[var(--field)] px-3 py-2.5 text-sm outline-none focus:border-[color:var(--accent)] transition-colors"
                    placeholder="e.g. Montreal General Hospital"
                  />
                </label>
              )}
            </div>

            {/* ── Save button ── */}
            <button
              type="submit"
              disabled={profileSaving}
              className="w-36 rounded-xl py-3 text-sm font-semibold text-white transition-all hover:opacity-90 disabled:opacity-60 ml-auto block"
              style={{ background: "var(--accent)" }}
            >
              {profileSaving ? "Saving…" : "Save profile"}
            </button>
          </form>
        )}

        {/* ── Password section ── */}
        <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-6 space-y-4">
          <div>
            <h2 className="text-sm font-semibold text-[var(--muted)] uppercase tracking-widest">
              Security
            </h2>
            <p className="mt-2 text-sm text-[var(--muted)]">
              For security, you may be asked to confirm your current password.
            </p>
          </div>

          <form onSubmit={onSubmitPassword} className="space-y-4">
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

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <FieldPassword
                label="New password"
                value={newPwd}
                onChange={setNewPwd}
                placeholder="Min. 8 characters"
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

            {pwdMsg && (
              <div
                className="rounded-xl px-3 py-2 text-sm"
                style={{
                  border:
                    pwdKind === "ok"
                      ? "1px solid color-mix(in oklab, var(--ok) 40%, transparent)"
                      : "1px solid color-mix(in oklab, var(--err) 40%, transparent)",
                  background:
                    pwdKind === "ok"
                      ? "color-mix(in oklab, var(--ok) 10%, transparent)"
                      : "color-mix(in oklab, var(--err) 10%, transparent)",
                  color: pwdKind === "ok" ? "var(--ok)" : "var(--err)",
                }}
              >
                {pwdMsg}
              </div>
            )}

            <button
              type="submit"
              disabled={!canSubmitPwd || pwdLoading}
              className="w-36 rounded-xl py-3 text-sm font-semibold text-white transition-all hover:opacity-90 disabled:opacity-60 ml-auto block"
              style={{ background: "var(--accent)" }}
            >
              {pwdLoading ? "Updating…" : "Update password"}
            </button>
          </form>
        </div>
      </div>
    </main>
  );
}

/* ---------------- FieldPassword component ---------------- */

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
    <div>
      <label className="mb-1.5 block text-sm font-medium text-[var(--foreground)]">
        {label}
      </label>
      <div className="relative rounded-xl border border-[var(--border)] bg-[var(--field)] focus-within:border-[color:var(--accent)] transition-colors">
        <input
          type={show ? "text" : "password"}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          autoComplete={autoComplete}
          required={required}
          className="w-full rounded-xl px-3 py-2.5 pr-16 bg-transparent outline-none text-sm text-[var(--foreground)] placeholder:text-[var(--muted)]"
        />
        <button
          type="button"
          onClick={() => setShow(!show)}
          aria-label={show ? "Hide password" : "Show password"}
          className="absolute right-2 top-1/2 -translate-y-1/2 rounded-lg border border-[var(--border)] bg-[var(--surface)] px-2 py-1 text-xs text-[var(--muted)] hover:text-[var(--foreground)] transition-colors"
        >
          {show ? "Hide" : "Show"}
        </button>
      </div>
    </div>
  );
}
