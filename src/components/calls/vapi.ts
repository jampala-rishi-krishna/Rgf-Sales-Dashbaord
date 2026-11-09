// Vapi call shapes + pure helpers for the Calls tab (Mara, voice channel).

export interface VapiToolCall {
  id?: string;
  type?: string;
  function?: { name?: string; arguments?: unknown };
}

export interface VapiMessage {
  role?: string; // "bot" | "assistant" | "user" | "system" | "tool_calls" | "tool_call_result"
  message?: string;
  content?: string;
  time?: number;
  secondsFromStart?: number;
  toolCalls?: VapiToolCall[];
  name?: string;
}

export interface VapiCall {
  id: string;
  createdAt: string;
  startedAt?: string;
  endedAt?: string;
  endedReason?: string;
  status?: string;
  cost?: number;
  recordingUrl?: string;
  customer?: { number?: string; name?: string };
  analysis?: { summary?: string; successEvaluation?: string | boolean };
  artifact?: {
    transcript?: string;
    recordingUrl?: string;
    videoRecordingUrl?: string;
    messages?: VapiMessage[];
  };
  messages?: VapiMessage[];
  assistant?: { name?: string };
  assistantOverrides?: { variableValues?: Record<string, unknown> };
  metadata?: Record<string, unknown>;
  phoneNumberId?: string;
  type?: string;
}

/**
 * Coerces a Vapi field to display text. Vapi (and OpenAI-format messages) sometimes send
 * content as an array of parts ([{type:"text",text}]) or an object; rendering those
 * directly crashed the Calls page.
 */
export function asText(v: unknown): string {
  if (v == null) return "";
  if (typeof v === "string") return v;
  if (typeof v === "number" || typeof v === "boolean") return String(v);
  if (Array.isArray(v)) return v.map(asText).filter(Boolean).join(" ");
  if (typeof v === "object") {
    const o = v as Record<string, unknown>;
    for (const k of ["text", "content", "message", "value", "summary"])
      if (o[k] != null) return asText(o[k]);
  }
  return "";
}

/** Call summary as plain text ("" when absent). */
export const summaryText = (c: VapiCall) => asText(c.analysis?.summary).trim();
/** endedReason as plain text ("" when absent). */
export const endedReasonText = (c: VapiCall) => asText(c.endedReason).trim();

/** Normalises the Vapi list response (array, {data}, {calls}). */
export function toCallArray(json: unknown): VapiCall[] {
  if (Array.isArray(json)) return json as VapiCall[];
  const o = (json ?? {}) as { data?: unknown; calls?: unknown };
  if (Array.isArray(o.data)) return o.data as VapiCall[];
  if (Array.isArray(o.calls)) return o.calls as VapiCall[];
  return [];
}

export const LIVE_STATUSES = new Set(["queued", "ringing", "in-progress"]);
export const isLive = (c: VapiCall) => LIVE_STATUSES.has(asText(c.status).toLowerCase());

export type Outcome = "Live" | "Answered" | "No Answer" | "Transferred" | "Voicemail" | "Failed";

export function callOutcome(c: VapiCall): Outcome {
  if (isLive(c)) return "Live";
  const r = endedReasonText(c).toLowerCase();
  if (r.includes("transfer") || r.includes("forwarded")) return "Transferred";
  if (r.includes("voicemail")) return "Voicemail";
  if (
    r.includes("no-answer") ||
    r.includes("noanswer") ||
    r.includes("did-not-answer") ||
    r.includes("busy")
  )
    return "No Answer";
  if (
    r.includes("error") ||
    r.includes("failed") ||
    r.includes("fault") ||
    r.includes("unreachable") ||
    r.includes("invalid")
  )
    return "Failed";
  if (toolNames(c).some((n) => /transfer/i.test(n))) return "Transferred";
  return "Answered";
}

export const OUTCOME_STYLE: Record<Outcome, { fg: string; bg: string }> = {
  Live: { fg: "#FFFFFF", bg: "var(--ch-accept, #34C759)" },
  Answered: { fg: "#34C759", bg: "rgba(52,199,89,0.14)" },
  "No Answer": { fg: "#9BA6A0", bg: "rgba(155,166,160,0.16)" },
  Transferred: { fg: "#F97316", bg: "rgba(249,115,22,0.16)" },
  Voicemail: { fg: "#A78BFA", bg: "rgba(167,139,250,0.16)" },
  Failed: { fg: "#FF3B30", bg: "rgba(255,59,48,0.14)" },
};

export function durationSeconds(c: VapiCall): number | null {
  if (!c.startedAt || !c.endedAt) return null;
  const s = (new Date(c.endedAt).getTime() - new Date(c.startedAt).getTime()) / 1000;
  return Number.isFinite(s) && s >= 0 ? s : null;
}

export function mmss(totalSeconds: number | null | undefined) {
  if (totalSeconds == null || !Number.isFinite(totalSeconds) || totalSeconds < 0) return "—";
  const m = Math.floor(totalSeconds / 60);
  const s = Math.floor(totalSeconds % 60);
  return `${m}:${String(s).padStart(2, "0")}`;
}

function pickStr(obj: Record<string, unknown> | undefined, keys: string[]): string | undefined {
  if (!obj) return undefined;
  for (const k of keys) {
    const v = obj[k];
    if (typeof v === "string" && v.trim()) return v.trim();
  }
  return undefined;
}

const vars = (c: VapiCall) => ({
  ...(c.metadata ?? {}),
  ...(c.assistantOverrides?.variableValues ?? {}),
});

export function callLead(c: VapiCall) {
  const v = vars(c);
  return {
    leadId: pickStr(v, ["leadId", "lead_id", "zohoLeadId", "preLeadId"]),
    leadName:
      pickStr(v, ["leadName", "lead_name", "contactName", "firstName", "name"]) ??
      (asText(c.customer?.name) || undefined),
    companyName: pickStr(v, ["companyName", "company_name", "company", "businessName"]),
    product: pickStr(v, ["product", "products", "associatedProducts"]),
    phone: asText(c.customer?.number) || undefined,
  };
}

export function callTitle(c: VapiCall) {
  const l = callLead(c);
  return l.companyName ?? l.leadName ?? l.phone ?? "Unknown caller";
}

export function allMessages(c: VapiCall): VapiMessage[] {
  const m = c.artifact?.messages ?? c.messages;
  return Array.isArray(m) ? m.filter((x): x is VapiMessage => !!x && typeof x === "object") : [];
}

export function toolNames(c: VapiCall): string[] {
  const out: string[] = [];
  for (const m of allMessages(c)) {
    const calls = Array.isArray(m.toolCalls) ? m.toolCalls : [];
    for (const t of calls) {
      const n = asText(t?.function?.name);
      if (n) out.push(n);
    }
    const n = m.role === "tool_call_result" ? asText(m.name) : "";
    if (n) out.push(n);
  }
  return Array.from(new Set(out));
}

/** Human chips for tool calls ("Meeting booked", "Escalated" …). */
export function toolChips(c: VapiCall): { label: string; tone: "good" | "warn" | "neutral" }[] {
  const chips = new Map<string, "good" | "warn" | "neutral">();
  for (const n of toolNames(c)) {
    if (/book|meeting|schedule|calendar|appointment/i.test(n)) chips.set("Meeting booked", "good");
    else if (/transfer|escalat|forward|human/i.test(n)) chips.set("Escalated", "warn");
    else if (/sms|whatsapp|send|email|brochure|price/i.test(n))
      chips.set("Follow-up sent", "neutral");
    else if (/end ?call|endcall|hang/i.test(n)) continue;
    else chips.set(n.replace(/[_-]+/g, " "), "neutral");
  }
  if (callOutcome(c) === "Transferred") chips.set("Escalated", "warn");
  return Array.from(chips, ([label, tone]) => ({ label, tone }));
}

export interface TranscriptLine {
  speaker: "agent" | "customer";
  text: string;
  start?: number; // seconds from call start
}

/** Transcript lines from artifact messages (with secondsFromStart) or the plain transcript fallback. */
export function transcriptLines(c: VapiCall): TranscriptLine[] {
  const msgs = allMessages(c).filter(
    (m) => ["bot", "assistant", "user"].includes(m.role ?? "") && asText(m.message ?? m.content),
  );
  if (msgs.length) {
    return msgs.map((m) => ({
      speaker: m.role === "user" ? "customer" : "agent",
      text: asText(m.message ?? m.content).trim(),
      start: typeof m.secondsFromStart === "number" ? m.secondsFromStart : undefined,
    }));
  }
  const raw = asText(c.artifact?.transcript);
  const lines: TranscriptLine[] = [];
  for (const line of raw.split(/\r?\n/)) {
    const m = line.match(/^\s*(AI|Assistant|Bot|User|Customer)\s*:\s*(.*)$/i);
    if (m) lines.push({ speaker: /user|customer/i.test(m[1]) ? "customer" : "agent", text: m[2] });
    else if (line.trim() && lines.length) lines[lines.length - 1].text += ` ${line.trim()}`;
  }
  return lines;
}

export const recordingUrl = (callId: string) =>
  `/api/vapi-recording?callId=${encodeURIComponent(callId)}&type=stereo`;
