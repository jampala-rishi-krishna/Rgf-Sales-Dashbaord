// Agent event model (§6). Pure functions only — safe on server and client.
import { isTestConversation, type Conversation } from "@/lib/channels";

export type EventChannel =
  "whatsapp" | "sms" | "viber" | "email" | "voice" | "web" | "scout" | "crm";
export type EventKind =
  | "lead_created"
  | "opener_sent"
  | "reply_in"
  | "reply_out"
  | "price_sent"
  | "brochure_sent"
  | "form_sent"
  | "meeting_booked"
  | "escalated"
  | "call_started"
  | "call_ended"
  | "call_transferred"
  | "human_reply";

export type AgentEvent = {
  id: string;
  ts: string;
  channel: EventChannel;
  agent: "Martin" | "Mara" | "Scout";
  kind: EventKind;
  leadId?: string;
  phone?: string;
  email?: string;
  company?: string;
  leadName?: string;
  preview?: string;
  meta?: Record<string, unknown>;
};

export const EVENT_LABEL: Record<EventKind, string> = {
  lead_created: "New lead",
  opener_sent: "Opener sent",
  reply_in: "Lead replied",
  reply_out: "Martin replied",
  price_sent: "Price list sent",
  brochure_sent: "Brochure sent",
  form_sent: "Form sent",
  meeting_booked: "Meeting booked",
  escalated: "Escalated to human",
  call_started: "Call started",
  call_ended: "Call ended",
  call_transferred: "Call transferred",
  human_reply: "Sales rep replied",
};

/** FNV-1a 32-bit → base36. Stable across server/client. */
export function hashId(...parts: (string | number | undefined | null)[]): string {
  const s = parts.map((p) => (p == null ? "" : String(p))).join("|");
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(36);
}

const clip = (s: string | undefined, n = 140) => {
  const t = (s ?? "").replace(/\s+/g, " ").trim();
  return t.length > n ? `${t.slice(0, n - 1)}…` : t;
};

export function deriveConversationEvents(
  channel: "whatsapp" | "sms" | "viber",
  conversations: Conversation[],
): AgentEvent[] {
  const out: AgentEvent[] = [];
  for (const c of conversations ?? []) {
    if (!c || isTestConversation(c)) continue;
    const base = {
      channel,
      leadId: c.leadId,
      phone: c.phone,
      email: c.leadEmail,
      company: c.companyName,
      leadName: c.leadName,
    } as const;
    let sawMartin = false;
    (c.messages ?? []).forEach((m, i) => {
      if (!m?.ts) return;
      let kind: EventKind;
      if (m.role === "customer") kind = "reply_in";
      else if (m.role === "human") kind = "human_reply";
      else {
        kind = sawMartin ? "reply_out" : "opener_sent";
        sawMartin = true;
      }
      out.push({
        ...base,
        id: hashId(channel, c.phone, i, m.ts, m.role),
        ts: m.ts,
        agent: "Martin",
        kind,
        preview: clip(m.content),
      });
    });
    const flagTs = c.lastUpdated || c.lastMessageAt;
    if (!flagTs) continue;
    const flag = (kind: EventKind, on: boolean, meta?: Record<string, unknown>) => {
      if (on)
        out.push({
          ...base,
          id: hashId(channel, c.phone, kind),
          ts: flagTs,
          agent: "Martin",
          kind,
          meta,
        });
    };
    flag("price_sent", c.priceSent);
    flag("brochure_sent", c.brochureSent);
    flag("form_sent", c.formSent);
    flag("meeting_booked", c.meetingScheduled, {
      meetingLink: c.meetingLink,
      meetingDateTime: c.meetingDateTime,
    });
    flag("escalated", c.humanEscalated);
  }
  return out;
}

export interface WebsiteSessionLike {
  sessionId: string;
  visitorName?: string;
  visitorEmail?: string;
  visitorPhone?: string;
  businessType?: string;
  status?: string;
  lastMessageAt?: string;
  messages?: { sender: string; text: string; timestamp: string; attachmentType?: string | null }[];
}

export function deriveWebsiteEvents(sessions: WebsiteSessionLike[]): AgentEvent[] {
  const out: AgentEvent[] = [];
  for (const s of sessions ?? []) {
    if (!s?.sessionId) continue;
    const base = {
      channel: "web" as const,
      agent: "Martin" as const,
      phone: s.visitorPhone || undefined,
      email: s.visitorEmail || undefined,
      company: s.businessType || s.visitorName || `Visitor ${s.sessionId.slice(-6)}`,
      leadName: s.visitorName || undefined,
      meta: { sessionId: s.sessionId },
    };
    (s.messages ?? []).forEach((m, i) => {
      if (!m?.timestamp) return;
      const kind: EventKind = m.sender === "visitor" ? "reply_in" : "reply_out";
      out.push({
        ...base,
        id: hashId("web", s.sessionId, i, m.timestamp),
        ts: m.timestamp,
        kind,
        preview: clip(m.text),
      });
      if (m.attachmentType === "price_list_pdf")
        out.push({
          ...base,
          id: hashId("web", s.sessionId, i, "price"),
          ts: m.timestamp,
          kind: "price_sent",
        });
      if (m.attachmentType === "catalog_pdf")
        out.push({
          ...base,
          id: hashId("web", s.sessionId, i, "brochure"),
          ts: m.timestamp,
          kind: "brochure_sent",
        });
    });
    if (s.status === "escalated" && s.lastMessageAt)
      out.push({
        ...base,
        id: hashId("web", s.sessionId, "escalated"),
        ts: s.lastMessageAt,
        kind: "escalated",
      });
  }
  return out;
}

export interface VapiCallLike {
  id: string;
  createdAt: string;
  startedAt?: string;
  endedAt?: string;
  endedReason?: string;
  status?: string;
  customer?: { number?: string; name?: string };
  analysis?: { summary?: string };
}

export const LIVE_CALL_STATUSES = ["in-progress", "ringing", "queued"];
export const isLiveCall = (c: VapiCallLike) =>
  LIVE_CALL_STATUSES.includes((c.status ?? "").toLowerCase());
export const isTransferredCall = (c: VapiCallLike) =>
  (c.endedReason ?? "").toLowerCase().includes("transfer");

export function deriveCallEvents(calls: VapiCallLike[]): AgentEvent[] {
  const out: AgentEvent[] = [];
  for (const c of calls ?? []) {
    if (!c?.id) continue;
    const base = {
      channel: "voice" as const,
      agent: "Mara" as const,
      phone: c.customer?.number,
      company: c.customer?.name,
      leadName: c.customer?.name,
      meta: { callId: c.id, status: c.status, endedReason: c.endedReason },
    };
    out.push({
      ...base,
      id: hashId("voice", c.id, "start"),
      ts: c.startedAt || c.createdAt,
      kind: "call_started",
    });
    if (c.endedAt) {
      out.push({
        ...base,
        id: hashId("voice", c.id, "end"),
        ts: c.endedAt,
        kind: isTransferredCall(c) ? "call_transferred" : "call_ended",
        preview: clip(c.analysis?.summary),
      });
    }
  }
  return out;
}

/** Dedupe by id, sort newest first, cap. */
export function finalizeEvents(events: AgentEvent[], limit = 300, since?: string): AgentEvent[] {
  const sinceMs = since ? Date.parse(since) : NaN;
  const seen = new Map<string, AgentEvent>();
  for (const e of events) {
    if (!e.ts || Number.isNaN(Date.parse(e.ts))) continue;
    if (!Number.isNaN(sinceMs) && Date.parse(e.ts) <= sinceMs) continue;
    if (!seen.has(e.id)) seen.set(e.id, e);
  }
  return [...seen.values()].sort((a, b) => Date.parse(b.ts) - Date.parse(a.ts)).slice(0, limit);
}
