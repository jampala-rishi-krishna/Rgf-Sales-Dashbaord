import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { AlertCircle, Eye, EyeOff, Info, Loader2 } from "lucide-react";
import { Logo } from "@/lib/brand";
import { useMe } from "@/hooks/use-me";

type LoginSearch = { reason?: "idle"; error?: string };

export const Route = createFileRoute("/login")({
  validateSearch: (s: Record<string, unknown>): LoginSearch => ({
    reason: s.reason === "idle" ? "idle" : undefined,
    error: typeof s.error === "string" ? s.error.slice(0, 40) : undefined,
  }),
  head: () => ({
    meta: [
      { title: "Sign in — RGF Sales Operations" },
      {
        name: "description",
        content: "Internal sales operations for Rare Global Food Trading Corp.",
      },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
  component: LoginPage,
});

const SUPPORT_EMAIL = import.meta.env.VITE_SUPPORT_EMAIL?.trim() || "";
const INK = "#1B2419";
const MUTED = "#5F635C"; // 5.9:1 on white, 5.6:1 on the cream background

const SSO_ERRORS: Record<string, string> = {
  sso_domain: "Use your @rareglobalfood.com Google account.",
  sso_unverified: "Use your @rareglobalfood.com Google account.",
  sso_not_provisioned:
    "Your Google account doesn't have dashboard access yet. Ask your administrator to add you.",
  sso_cancelled: "Google sign-in was cancelled.",
  sso_disabled: "Google sign-in isn't available. Sign in with your email and password.",
  sso_unavailable: "Sign-in is temporarily unavailable. Please contact your administrator.",
};
const ssoError = (code?: string) =>
  code ? (SSO_ERRORS[code] ?? "Google sign-in failed. Please try again.") : "";

/* ── Left panel: abstract, blurred Mission Control silhouette (no real data) ── */
function DashboardSilhouette() {
  const bar = "rounded bg-white";
  return (
    <div
      aria-hidden
      className="pointer-events-none absolute inset-0 flex items-center justify-center"
    >
      <div className="flex h-[78%] w-[118%] -rotate-[4deg] gap-4 rounded-2xl bg-white/[0.06] p-5 opacity-[0.22] ring-1 ring-white/30 blur-[2px]">
        {/* sidebar */}
        <div className="flex w-[14%] flex-col gap-3">
          <div className={`${bar} h-6 w-3/4`} />
          {Array.from({ length: 7 }, (_, i) => (
            <div
              key={i}
              className={`${bar} h-3 opacity-60`}
              style={{ width: `${60 + ((i * 17) % 35)}%` }}
            />
          ))}
        </div>
        <div className="flex flex-1 flex-col gap-4">
          {/* top bar */}
          <div className="flex items-center justify-between">
            <div className={`${bar} h-4 w-1/4`} />
            <div className={`${bar} h-6 w-6 rounded-full`} />
          </div>
          {/* KPI tiles */}
          <div className="grid grid-cols-4 gap-3">
            {Array.from({ length: 4 }, (_, i) => (
              <div
                key={i}
                className="flex h-20 flex-col justify-between rounded-xl bg-white/25 p-3"
              >
                <div className={`${bar} h-2.5 w-1/2 opacity-70`} />
                <div className={`${bar} h-5 w-2/3`} />
              </div>
            ))}
          </div>
          {/* chart + list */}
          <div className="grid flex-1 grid-cols-3 gap-3">
            <div className="col-span-2 flex items-end gap-2 rounded-xl bg-white/20 p-4">
              {[40, 62, 48, 75, 58, 82, 66, 90, 72, 86, 64, 78].map((h, i) => (
                <div key={i} className="flex-1 rounded-t bg-white" style={{ height: `${h}%` }} />
              ))}
            </div>
            <div className="flex flex-col gap-2.5 rounded-xl bg-white/20 p-4">
              {Array.from({ length: 6 }, (_, i) => (
                <div key={i} className="flex items-center gap-2">
                  <div className={`${bar} h-5 w-5 rounded-full`} />
                  <div className={`${bar} h-2.5 flex-1 opacity-70`} />
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function BrandPanel() {
  return (
    <aside
      className="relative hidden overflow-hidden lg:flex lg:items-end lg:p-14 xl:p-16"
      style={{
        background: "linear-gradient(150deg, #7F1820 0%, #66111A 50%, #430B10 100%)",
      }}
    >
      <DashboardSilhouette />
      {/* dark-red overlay keeps the silhouette as texture, not content */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            "linear-gradient(180deg, rgba(67,11,16,.35) 0%, rgba(67,11,16,.55) 55%, rgba(48,7,11,.92) 100%)",
        }}
      />
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 opacity-[0.06]"
        style={{
          backgroundImage: "radial-gradient(#fff 1px, transparent 1px)",
          backgroundSize: "18px 18px",
        }}
      />
      <div className="relative max-w-md text-white">
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-white/75">
          RGF Sales Operations
        </p>
        <h1 className="mt-3 text-[36px] font-semibold leading-[1.15] tracking-tight">
          Sales operations, in one place.
        </h1>
        <p className="mt-3 text-base leading-relaxed text-white/80">
          Leads, conversations and campaigns for the Rare Global Food sales team.
        </p>
      </div>
    </aside>
  );
}

function GoogleIcon() {
  return (
    <svg aria-hidden width="18" height="18" viewBox="0 0 48 48">
      <path
        fill="#FFC107"
        d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5z"
      />
      <path
        fill="#FF3D00"
        d="M6.3 14.7l6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z"
      />
      <path
        fill="#4CAF50"
        d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-8l-6.5 5C9.5 39.6 16.2 44 24 44z"
      />
      <path
        fill="#1976D2"
        d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.4-.4-3.5z"
      />
    </svg>
  );
}

const focusRing =
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#86000B] focus-visible:ring-offset-2";
const inputCls =
  "w-full rounded-md border border-[#D6D3CE] bg-white px-3 py-2.5 text-base text-[#1B2419] placeholder:text-[#8A8D86] focus:border-[#86000B] focus:outline-none focus:ring-2 focus:ring-[#86000B]/30 sm:text-sm";

function LoginPage() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const me = useMe();
  const search = Route.useSearch();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPw, setShowPw] = useState(false);
  const [capsLock, setCapsLock] = useState(false);
  const [error, setError] = useState(() => ssoError(search.error));
  const [busy, setBusy] = useState(false);
  const [googleBusy, setGoogleBusy] = useState(false);
  const googleSso = !!me.data?.flags.googleSso;

  useEffect(() => {
    if (me.data?.user) void navigate({ to: "/" });
  }, [me.data?.user, navigate]);

  // Back/forward cache can restore the page with the Google spinner still showing.
  useEffect(() => {
    const onShow = () => setGoogleBusy(false);
    window.addEventListener("pageshow", onShow);
    return () => window.removeEventListener("pageshow", onShow);
  }, []);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (busy || !email.trim() || !password) return;
    setError("");
    setBusy(true);
    try {
      const r = await fetch("/api/auth/login", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim(), password }),
      });
      const j = (await r.json().catch(() => ({}))) as { ok?: boolean; error?: string };
      if (!r.ok || !j.ok) {
        setError(j.error ?? "Email or password is incorrect.");
        setPassword("");
        return;
      }
      await qc.invalidateQueries({ queryKey: ["me"] });
      await navigate({ to: "/" });
    } catch {
      setError("Network error. Check your connection and try again.");
    } finally {
      setBusy(false);
    }
  }

  const trackCaps = (e: React.KeyboardEvent<HTMLInputElement>) =>
    setCapsLock(e.getModifierState?.("CapsLock") ?? false);

  const canSubmit = !!email.trim() && !!password && !busy;

  return (
    <div className="grid min-h-screen lg:grid-cols-2" style={{ backgroundColor: "#FFF8F0" }}>
      <BrandPanel />

      <main className="flex min-h-screen flex-col px-4 sm:px-6">
        <div className="flex flex-1 items-center justify-center py-10">
          <div
            className="w-full max-w-[420px] rounded-[14px] border bg-white p-6 sm:p-8"
            style={{
              borderColor: "#EDE6DC",
              boxShadow: "0 1px 2px rgba(27,36,25,.06),0 8px 24px rgba(27,36,25,.06)",
            }}
          >
            <div className="mb-6 flex justify-center">
              <Logo className="scale-110" />
            </div>
            <h2 className="text-center text-xl font-semibold sm:text-2xl" style={{ color: INK }}>
              Sign in
            </h2>
            <p className="mt-1 text-center text-sm" style={{ color: MUTED }}>
              RGF sales dashboard
            </p>

            {search.reason === "idle" && (
              <div
                role="status"
                className="mt-5 flex items-start gap-2 rounded-md border border-[#C9D7EA] bg-[#F1F6FC] px-3 py-2.5 text-sm text-[#1E3A5F]"
              >
                <Info aria-hidden className="mt-0.5 h-4 w-4 shrink-0" />
                <span>You were signed out after 5 minutes of inactivity.</span>
              </div>
            )}

            {googleSso && (
              <>
                <a
                  href="/api/auth/google"
                  onClick={() => setGoogleBusy(true)}
                  aria-busy={googleBusy}
                  className={`mt-6 flex min-h-[44px] w-full items-center justify-center gap-3 rounded-md border border-[#D6D3CE] bg-white px-4 py-2.5 text-sm font-semibold text-[#1F1F1F] transition-colors hover:bg-[#F7F5F2] ${focusRing}`}
                >
                  {googleBusy ? (
                    <Loader2 aria-hidden className="h-[18px] w-[18px] animate-spin" />
                  ) : (
                    <GoogleIcon />
                  )}
                  {googleBusy ? "Redirecting to Google…" : "Sign in with Google"}
                </a>
                <div className="my-5 flex items-center gap-3" role="separator" aria-label="or">
                  <span className="h-px flex-1 bg-[#E7E2DA]" />
                  <span className="text-xs" style={{ color: MUTED }}>
                    or sign in with email
                  </span>
                  <span className="h-px flex-1 bg-[#E7E2DA]" />
                </div>
              </>
            )}

            <form
              onSubmit={submit}
              className={googleSso ? "space-y-4" : "mt-6 space-y-4"}
              noValidate
            >
              <div>
                <label
                  htmlFor="email"
                  className="mb-1.5 block text-sm font-medium"
                  style={{ color: INK }}
                >
                  Email
                </label>
                <input
                  id="email"
                  name="email"
                  type="email"
                  inputMode="email"
                  autoComplete="username"
                  autoCapitalize="none"
                  spellCheck={false}
                  autoFocus
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  aria-invalid={!!error || undefined}
                  aria-describedby={error ? "login-error" : undefined}
                  placeholder="name@rareglobalfood.com"
                  className={inputCls}
                />
              </div>
              <div>
                <label
                  htmlFor="password"
                  className="mb-1.5 block text-sm font-medium"
                  style={{ color: INK }}
                >
                  Password
                </label>
                <div className="relative">
                  <input
                    id="password"
                    name="password"
                    type={showPw ? "text" : "password"}
                    autoComplete="current-password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    onKeyDown={trackCaps}
                    onKeyUp={trackCaps}
                    onBlur={() => setCapsLock(false)}
                    required
                    aria-invalid={!!error || undefined}
                    aria-describedby={
                      [capsLock && "caps-warning", error && "login-error"]
                        .filter(Boolean)
                        .join(" ") || undefined
                    }
                    className={`${inputCls} pr-11`}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPw((v) => !v)}
                    aria-label={showPw ? "Hide password" : "Show password"}
                    aria-pressed={showPw}
                    aria-controls="password"
                    className={`absolute inset-y-0 right-0 flex w-11 items-center justify-center rounded-r-md text-[#5F635C] hover:text-[#1B2419] ${focusRing} focus-visible:ring-offset-0`}
                  >
                    {showPw ? (
                      <EyeOff aria-hidden className="h-4 w-4" />
                    ) : (
                      <Eye aria-hidden className="h-4 w-4" />
                    )}
                  </button>
                </div>
                {capsLock && (
                  <p
                    id="caps-warning"
                    role="status"
                    className="mt-1.5 text-xs font-medium text-[#8A5A00]"
                  >
                    Caps Lock is on.
                  </p>
                )}
              </div>

              {error && (
                <div
                  id="login-error"
                  role="alert"
                  className="flex items-start gap-2 rounded-md border border-[#F1C4C4] bg-[#FDF2F2] px-3 py-2.5 text-sm text-[#9B1C1C]"
                >
                  <AlertCircle aria-hidden className="mt-0.5 h-4 w-4 shrink-0" />
                  <span>{error}</span>
                </div>
              )}

              <button
                type="submit"
                disabled={!canSubmit}
                aria-busy={busy}
                className={`flex min-h-[44px] w-full items-center justify-center gap-2 rounded-md px-4 py-2.5 text-sm font-semibold transition-colors enabled:bg-[#86000B] enabled:text-white enabled:hover:bg-[#6E0009] disabled:cursor-not-allowed ${
                  busy ? "bg-[#86000B] text-white" : "disabled:bg-[#E7E5E2] disabled:text-[#6B6E68]"
                } ${focusRing}`}
              >
                {busy && <Loader2 aria-hidden className="h-4 w-4 animate-spin" />}
                {busy ? "Signing in…" : "Sign in"}
              </button>
            </form>

            <p className="mt-5 text-center text-sm" style={{ color: MUTED }}>
              Forgot password?{" "}
              {SUPPORT_EMAIL ? (
                <a
                  href={`mailto:${SUPPORT_EMAIL}?subject=${encodeURIComponent("RGF dashboard password reset")}`}
                  className={`font-medium text-[#86000B] underline-offset-2 hover:underline ${focusRing} rounded-sm`}
                >
                  Contact your administrator
                </a>
              ) : (
                "Contact your administrator."
              )}
            </p>
          </div>
        </div>

        <footer className="pb-6 text-center text-xs leading-relaxed" style={{ color: MUTED }}>
          <p>Authorized RGF personnel only. Activity is logged.</p>
          <p className="mt-1">
            © {new Date().getFullYear()} Rare Global Food Trading Corp
            <span aria-hidden> · </span>v{__APP_VERSION__}
            {SUPPORT_EMAIL && (
              <>
                <span aria-hidden> · </span>
                <a
                  href={`mailto:${SUPPORT_EMAIL}?subject=${encodeURIComponent("RGF dashboard help")}`}
                  className={`underline-offset-2 hover:underline ${focusRing} rounded-sm`}
                >
                  Need help?
                </a>
              </>
            )}
          </p>
        </footer>
      </main>
    </div>
  );
}
