import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useReducedMotion } from "motion/react";
import {
  ArrowLeft,
  CalendarCheck,
  MessageSquare,
  Phone,
  PhoneForwarded,
  Sparkles,
  Wrench,
} from "lucide-react";
import { SiViber, SiWhatsapp } from "react-icons/si";
import { toast } from "sonner";
import { AgentAvatar, DisabledReason } from "@/components/shared";
import { useMe } from "@/hooks/use-me";
import { ConvertLeadButton, ConvertedBadge } from "@/components/convert/ConvertLeadButton";
import { postAction } from "@/lib/action-client";
import { formatManila } from "@/lib/channels";
import { OutcomeChip } from "./call-card";
import { WaveformPlayer, type WaveformHandle } from "./waveform-player";
import {
  callLead,
  callOutcome,
  callTitle,
  durationSeconds,
  endedReasonText,
  isLive,
  mmss,
  recordingUrl,
  summaryText,
  toolChips,
  transcriptLines,
  type VapiCall,
} from "./vapi";

export function CallDetail({ call, onBack }: { call: VapiCall; onBack?: () => void }) {
  const lead = callLead(call);
  const outcome = callOutcome(call);
  const subject = {
    preLeadId: lead.leadId,
    name: lead.leadName,
    company: lead.companyName,
    phone: lead.phone,
    product: lead.product,
  };
  const lines = useMemo(() => transcriptLines(call), [call]);
  const chips = useMemo(() => toolChips(call), [call]);
  const synced = lines.some((l) => l.start != null);
  const [time, setTime] = useState(0);
  const [playing, setPlaying] = useState(false);
  const playerRef = useRef<WaveformHandle>(null);

  useEffect(() => {
    setTime(0);
    setPlaying(false);
  }, [call.id]);

  const activeIdx = useMemo(() => {
    if (!synced || (!playing && time === 0)) return -1;
    let idx = -1;
    lines.forEach((l, i) => {
      if (l.start != null && l.start <= time + 0.15) idx = i;
    });
    return idx;
  }, [lines, synced, time, playing]);

  return (
    <div className="flex h-full min-h-0 flex-col">
      <header className="flex shrink-0 items-center gap-3 border-b border-white/5 px-4 py-3 md:px-6">
        {onBack && (
          <button
            type="button"
            onClick={onBack}
            aria-label="Back to calls"
            className="-ml-1 rounded-full p-1.5 text-[var(--ch-text-2)] hover:bg-white/5 md:hidden"
          >
            <ArrowLeft className="size-5" />
          </button>
        )}
        <AgentAvatar agent="Mara" channel="voice" size={36} />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <h2 className="truncate text-base font-semibold text-[var(--ch-text)]">
              {callTitle(call)}
            </h2>
            <OutcomeChip outcome={outcome} />
            <ConvertedBadge subject={subject} />
          </div>
          <div className="truncate text-xs text-[var(--ch-text-2)]">
            <span className="font-mono">{lead.phone ?? "—"}</span>
            {lead.leadName && lead.companyName ? ` · ${lead.leadName}` : ""} ·{" "}
            {formatManila(call.createdAt)}
          </div>
        </div>
        <ConvertLeadButton subject={subject} size="sm" tone="dark" className="shrink-0" />
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className="mx-auto max-w-3xl space-y-5 p-4 md:p-6">
          <CallActions call={call} />

          <section className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            <Stat label="Duration" value={mmss(durationSeconds(call))} />
            <Stat
              label="Cost"
              value={typeof call.cost === "number" ? `$${call.cost.toFixed(2)}` : "—"}
            />
            <Stat
              label="Started"
              value={
                call.startedAt
                  ? formatManila(call.startedAt, { hour: "2-digit", minute: "2-digit" })
                  : "—"
              }
            />
            <Stat
              label="Ended reason"
              value={
                humanEndedReason(endedReasonText(call)) || (isLive(call) ? "In progress" : "—")
              }
              title={endedReasonText(call)}
              small
            />
          </section>

          {!isLive(call) && (
            <section>
              <SectionLabel>Recording</SectionLabel>
              <WaveformPlayer
                ref={playerRef}
                url={recordingUrl(call.id)}
                onTime={setTime}
                onPlayingChange={setPlaying}
              />
            </section>
          )}

          {chips.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {chips.map((c) => (
                <span
                  key={c.label}
                  className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium ring-1 ${
                    c.tone === "good"
                      ? "bg-emerald-500/10 text-emerald-300 ring-emerald-500/30"
                      : c.tone === "warn"
                        ? "bg-orange-500/10 text-orange-300 ring-orange-500/30"
                        : "bg-white/5 text-[var(--ch-text-2)] ring-white/10"
                  }`}
                >
                  {c.label === "Meeting booked" ? (
                    <CalendarCheck className="size-3.5" />
                  ) : c.label === "Escalated" ? (
                    <PhoneForwarded className="size-3.5" />
                  ) : (
                    <Wrench className="size-3.5" />
                  )}
                  {c.label}
                </span>
              ))}
            </div>
          )}

          <section className="rounded-2xl border border-orange-500/20 bg-orange-500/[0.06] p-4">
            <div className="mb-1.5 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-[var(--ch)]">
              <Sparkles className="size-3.5" /> Summary
            </div>
            <p className="text-sm leading-relaxed text-[var(--ch-text)]">
              {summaryText(call) || "No summary generated."}
            </p>
          </section>

          <section>
            <SectionLabel>
              Transcript{" "}
              {synced && (
                <span className="ml-1 normal-case tracking-normal text-[var(--ch-text-2)]/70">
                  · click a line to jump
                </span>
              )}
            </SectionLabel>
            {lines.length === 0 ? (
              <p className="text-sm text-[var(--ch-text-2)]">No transcript available.</p>
            ) : (
              <Transcript
                lines={lines}
                activeIdx={activeIdx}
                playing={playing}
                onSeek={(s) => playerRef.current?.seek(s)}
              />
            )}
          </section>
        </div>
      </div>
    </div>
  );
}

function Transcript({
  lines,
  activeIdx,
  playing,
  onSeek,
}: {
  lines: ReturnType<typeof transcriptLines>;
  activeIdx: number;
  playing: boolean;
  onSeek: (s: number) => void;
}) {
  const reduce = useReducedMotion();
  const refs = useRef<(HTMLDivElement | null)[]>([]);
  useEffect(() => {
    if (!playing || activeIdx < 0) return;
    refs.current[activeIdx]?.scrollIntoView({
      block: "nearest",
      behavior: reduce ? "auto" : "smooth",
    });
  }, [activeIdx, playing, reduce]);

  return (
    <div className="space-y-2">
      {lines.map((l, i) => {
        const agent = l.speaker === "agent";
        const active = i === activeIdx;
        const seekable = l.start != null;
        return (
          <div
            key={i}
            ref={(el) => {
              refs.current[i] = el;
            }}
            className={`flex ${agent ? "justify-start" : "justify-end"}`}
          >
            <button
              type="button"
              disabled={!seekable}
              onClick={() => seekable && onSeek(l.start!)}
              className={`max-w-[85%] rounded-2xl px-3.5 py-2 text-left text-sm leading-relaxed transition-colors motion-reduce:transition-none disabled:cursor-default ${
                agent ? "rounded-bl-md" : "rounded-br-md"
              } ${
                active
                  ? "bg-[var(--ch)] text-white shadow-lg shadow-orange-500/20"
                  : agent
                    ? "bg-[var(--ch-panel)] text-[var(--ch-text)] ring-1 ring-white/5 enabled:hover:ring-orange-500/40"
                    : "bg-white/10 text-[var(--ch-text)] enabled:hover:bg-white/15"
              }`}
            >
              <span
                className={`mb-0.5 flex items-center gap-2 text-[10px] font-semibold uppercase tracking-wider ${active ? "text-white/80" : agent ? "text-[var(--ch)]" : "text-[var(--ch-text-2)]"}`}
              >
                {agent ? "Mara" : "Customer"}
                {l.start != null && (
                  <span className="font-mono normal-case tracking-normal opacity-70">
                    {mmss(l.start)}
                  </span>
                )}
              </span>
              {l.text}
            </button>
          </div>
        );
      })}
    </div>
  );
}

type FollowupChannel = "sms" | "whatsapp" | "viber";
const FOLLOWUP: Record<FollowupChannel, { label: string; icon: ReactNode }> = {
  sms: { label: "SMS", icon: <MessageSquare className="size-4" /> },
  whatsapp: { label: "WhatsApp", icon: <SiWhatsapp className="size-4" /> },
  viber: { label: "Viber", icon: <SiViber className="size-4" /> },
};

function CallActions({ call }: { call: VapiCall }) {
  const { data: me } = useMe();
  const singleCall = !!me?.flags?.singleCall;
  const lead = callLead(call);
  const [busy, setBusy] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<FollowupChannel | null>(null);

  useEffect(() => {
    if (!confirm) return;
    const t = setTimeout(() => setConfirm(null), 4000);
    return () => clearTimeout(t);
  }, [confirm]);

  async function callLeadNow() {
    setBusy("call");
    await postAction(
      "/api/actions/call",
      {
        leadId: lead.leadId ?? "",
        leadName: lead.leadName ?? "",
        companyName: lead.companyName ?? "",
        phone: lead.phone ?? "",
        product: lead.product ?? "",
        channel: "Voice",
      },
      "Mara is calling this lead",
    );
    setBusy(null);
  }

  async function sendFollowup(channel: FollowupChannel) {
    if (confirm !== channel) return setConfirm(channel);
    setConfirm(null);
    setBusy(channel);
    const label = FOLLOWUP[channel].label;
    const r = await postAction<{ result?: string }>(
      "/api/actions/followup",
      {
        channel,
        phone: lead.phone ?? "",
        leadId: lead.leadId ?? "",
        leadName: lead.leadName ?? "",
        companyName: lead.companyName ?? "",
        product: lead.product ?? "",
        callId: call.id,
        callOutcome: callOutcome(call),
        callAt: call.createdAt ?? "",
      },
      `${label} follow-up sent`,
    );
    if (r.ok && r.data?.result === "opener")
      toast.info(`No ${label} conversation yet, so Martin's ${label} opener was sent instead.`);
    setBusy(null);
  }

  const noPhone = !lead.phone;
  const btn =
    "inline-flex items-center gap-1.5 rounded-full px-3.5 py-2 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-400 disabled:cursor-not-allowed disabled:opacity-50 motion-reduce:transition-none";

  return (
    <div className="space-y-2">
      <DisabledReason
        disabled={!singleCall || noPhone}
        reason={
          noPhone
            ? "No phone number on this call"
            : "Calling isn't switched on yet (FEATURE_SINGLE_CALL)"
        }
      >
        <button
          type="button"
          className={`${btn} w-full justify-center bg-[var(--ch-accept)] text-white enabled:hover:brightness-110 sm:w-auto`}
          disabled={!singleCall || noPhone || busy !== null}
          onClick={callLeadNow}
        >
          <Phone className="size-4" /> {busy === "call" ? "Calling…" : "Call this lead"}
        </button>
      </DisabledReason>
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-3 [&>*]:w-full [&_button]:w-full [&_button]:justify-center">
        {(Object.keys(FOLLOWUP) as FollowupChannel[]).map((ch) => (
          <DisabledReason key={ch} disabled={noPhone} reason="No phone number on this call">
            <button
              type="button"
              className={`${btn} ${confirm === ch ? "bg-[var(--ch)] text-white" : "bg-white/10 text-[var(--ch-text)] enabled:hover:bg-white/15"}`}
              disabled={noPhone || busy !== null}
              onClick={() => sendFollowup(ch)}
              title={`Send a ${FOLLOWUP[ch].label} follow-up about this call (posted to RGF Scout)`}
            >
              {FOLLOWUP[ch].icon}{" "}
              {busy === ch
                ? "Sending…"
                : confirm === ch
                  ? `Click again to send ${FOLLOWUP[ch].label}`
                  : `${FOLLOWUP[ch].label} follow-up`}
            </button>
          </DisabledReason>
        ))}
      </div>
    </div>
  );
}

/** "customer-did-not-answer" → "Customer didn't answer"; unknown reasons are de-hyphenated. */
function humanEndedReason(raw: string): string {
  if (!raw) return "";
  const r = raw.toLowerCase();
  if (/did-not-answer|no-answer|noanswer/.test(r)) return "Customer didn't answer";
  if (r.includes("busy")) return "Line busy";
  if (r.includes("voicemail")) return "Voicemail";
  if (r.includes("customer-ended")) return "Customer hung up";
  if (r.includes("assistant-ended") || r.includes("assistant-said-end"))
    return "Mara ended the call";
  if (r.includes("forward") || r.includes("transfer")) return "Transferred";
  if (r.includes("silence")) return "Ended on silence";
  if (r.includes("max-duration") || r.includes("exceeded-max")) return "Max duration reached";
  if (/error|fail|fault|invalid|unreachable/.test(r)) return "Call failed";
  const t = raw.replace(/[-_.]+/g, " ").trim();
  return t.charAt(0).toUpperCase() + t.slice(1);
}

function Stat({
  label,
  value,
  small,
  title,
}: {
  label: string;
  value: string;
  small?: boolean;
  title?: string;
}) {
  return (
    <div className="rounded-xl bg-[var(--ch-panel)] px-3 py-2 ring-1 ring-white/5">
      <div className="text-[10px] font-semibold uppercase tracking-wider text-[var(--ch-text-2)]">
        {label}
      </div>
      <div
        className={`mt-0.5 tabular-nums text-[var(--ch-text)] ${small ? "line-clamp-2 text-xs font-medium" : "truncate font-mono text-sm"}`}
        title={title || value}
      >
        {value}
      </div>
    </div>
  );
}

function SectionLabel({ children }: { children: ReactNode }) {
  return (
    <div className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-[var(--ch-text-2)]">
      {children}
    </div>
  );
}
