import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { motion, useReducedMotion } from "motion/react";
import { Logo } from "@/lib/brand";
import { CHANNELS, type ChannelKey } from "@/lib/channels";
import { useMe } from "@/hooks/use-me";

export const Route = createFileRoute("/login")({
  head: () => ({
    meta: [
      { title: "Sign in — Rare Global Food" },
      { name: "description", content: "Sales dashboard for Rare Global Food Trading Corp." },
    ],
  }),
  component: LoginPage,
});

const PODS: { key: ChannelKey; status: string }[] = [
  { key: "whatsapp", status: "Conversing" },
  { key: "sms", status: "Sending" },
  { key: "viber", status: "Idle" },
  { key: "email", status: "Sending" },
  { key: "voice", status: "On call" },
  { key: "web", status: "Conversing" },
];

function AgentPods() {
  const reduce = useReducedMotion();
  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5 md:gap-3">
      {PODS.map((p, i) => {
        const ch = CHANNELS[p.key];
        return (
          <motion.div
            key={p.key}
            initial={reduce ? false : { opacity: 0, y: 12 }}
            animate={reduce ? undefined : { opacity: 1, y: [0, -4, 0] }}
            transition={
              reduce
                ? undefined
                : {
                    opacity: { duration: 0.4, delay: i * 0.08 },
                    y: { duration: 3.2, delay: i * 0.35, repeat: Infinity, ease: "easeInOut" },
                  }
            }
            className="flex items-center gap-2.5 rounded-xl bg-white/10 px-3 py-2.5 ring-1 ring-white/15 backdrop-blur-sm"
          >
            <span className="relative flex h-2.5 w-2.5 shrink-0">
              {!reduce && p.status !== "Idle" && (
                <span
                  className="absolute inline-flex h-full w-full animate-ping rounded-full opacity-60"
                  style={{ backgroundColor: ch.color }}
                />
              )}
              <span
                className="relative inline-flex h-2.5 w-2.5 rounded-full"
                style={{ backgroundColor: ch.color }}
              />
            </span>
            <div className="min-w-0 leading-tight">
              <div className="truncate text-sm font-semibold text-white">
                {ch.agent} · {ch.label}
              </div>
              <div className="text-[11px] text-white/70">{p.status}</div>
            </div>
          </motion.div>
        );
      })}
    </div>
  );
}

function LoginPage() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const me = useMe();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (me.data?.user) void navigate({ to: "/" });
  }, [me.data?.user, navigate]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
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
        setError(j.error ?? "Sign in failed.");
        return;
      }
      await qc.invalidateQueries({ queryKey: ["me"] });
      await navigate({ to: "/" });
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="min-h-screen flex flex-col md:flex-row" style={{ backgroundColor: "#FFF8F0" }}>
      {/* Brand panel */}
      <div
        className="relative overflow-hidden px-6 py-8 md:w-1/2 md:flex md:items-center md:justify-center md:p-12"
        style={{
          background: "radial-gradient(120% 120% at 0% 0%, #A3101C 0%, #86000B 55%, #5E0008 100%)",
        }}
      >
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 opacity-[0.07]"
          style={{
            backgroundImage: "radial-gradient(#fff 1px, transparent 1px)",
            backgroundSize: "18px 18px",
          }}
        />
        <div className="relative w-full max-w-lg text-white">
          <div className="mb-3 text-[11px] font-bold tracking-[0.3em] opacity-80 md:mb-6">
            RGF MISSION CONTROL
          </div>
          <h1 className="text-2xl font-bold leading-tight md:text-4xl lg:text-5xl">
            Every AI sales agent, live in one place.
          </h1>
          <p className="mt-3 hidden text-base leading-relaxed opacity-80 md:block">
            Watch Martin, Mara and Scout work WhatsApp, SMS, Viber, email, voice and web — and step
            in when a lead needs a human.
          </p>
          <div className="mt-6 md:mt-10">
            <AgentPods />
          </div>
        </div>
      </div>

      {/* Form */}
      <div className="flex flex-1 items-center justify-center p-4 sm:p-6">
        <div
          className="w-full max-w-md rounded-[14px] border p-6 sm:p-8"
          style={{
            backgroundColor: "#fff",
            borderColor: "#EDE6DC",
            boxShadow: "0 1px 2px rgba(27,36,25,.06),0 8px 24px rgba(27,36,25,.06)",
          }}
        >
          <div className="mb-6 flex justify-center">
            <Logo />
          </div>
          <h2 className="text-center text-xl font-bold sm:text-2xl" style={{ color: "#1B2419" }}>
            Welcome back
          </h2>
          <p className="mt-1 text-center text-xs sm:text-sm" style={{ color: "#6B6F68" }}>
            Sign in to your sales dashboard
          </p>

          <form onSubmit={submit} className="mt-6 space-y-4" noValidate>
            <div>
              <label
                htmlFor="email"
                className="mb-1.5 block text-xs font-semibold"
                style={{ color: "#1B2419" }}
              >
                Email
              </label>
              <input
                id="email"
                type="email"
                autoComplete="username"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                className="w-full rounded-md border border-gray-200 px-3 py-2.5 text-base focus:outline-none focus:ring-2 focus:ring-[#86000B]/40 sm:text-sm"
              />
            </div>
            <div>
              <label
                htmlFor="password"
                className="mb-1.5 block text-xs font-semibold"
                style={{ color: "#1B2419" }}
              >
                Password
              </label>
              <input
                id="password"
                type="password"
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                className="w-full rounded-md border border-gray-200 px-3 py-2.5 text-base focus:outline-none focus:ring-2 focus:ring-[#86000B]/40 sm:text-sm"
              />
            </div>
            {error && (
              <div role="alert" className="text-sm text-red-600">
                {error}
              </div>
            )}
            <button
              type="submit"
              disabled={busy || !email || !password}
              className="min-h-[44px] w-full rounded-md py-2.5 font-semibold text-white transition-opacity hover:opacity-90 disabled:opacity-60"
              style={{ backgroundColor: "#86000B" }}
            >
              {busy ? "Signing in…" : "Sign in"}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
