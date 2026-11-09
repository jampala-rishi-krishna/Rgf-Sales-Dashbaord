// Pre-Lead → Lead conversion: who is convertible, plus the shared cross-channel timeline.
// Pure and client-safe (no React, no server imports).
import { hasReplied, isTestConversation, type Conversation } from "@/lib/channels";
import { normalizePhPhone } from "@/lib/phone";
import { callOutcome, transcriptLines, type VapiCall } from "@/components/calls/vapi";

export type ConvertChannel = "whatsapp" | "sms" | "viber" | "email" | "voice" | "web";
export const CONVERT_CHANNELS: ConvertChannel[] = [
  "whatsapp",
  "sms",
  "viber",
  "email",
  "voice",
  "web",
];

/** Zoho Lead_Source value per replied channel. */
export const LEAD_SOURCE: Record<ConvertChannel, string> = {
  whatsapp: "AI Agent - WhatsApp",
  sms: "AI Agent - SMS",
  viber: "AI Agent - Viber",
  email: "AI Agent - Email",
  voice: "AI Agent - Voice",
  web: "AI Agent - Website",
};

/** Our own mailboxes: messages from these are never a lead reply. */
export const RGF_EMAIL_DOMAIN = "rareglobalfood.com";

/** Whatever identifies a Pre-Lead (all optional; matched by phone, email, then Zoho id). */
export interface LeadIdentity {
  id?: string;
  phone?: string;
  email?: string;
  companyName?: string;
}

/** Gmail thread summary (shape of /api/gmail-threads items). */
export interface EmailThreadLite {
  threadId: string;
  subject?: string;
  from: string;
  to?: string;
  date: string;
  direction: "inbound" | "outbound";
  snippet?: string;
  messageCount?: number;
}

/** Website chat session (shape of /api/website-chat-sessions items). */
export interface WebSessionLite {
  sessionId: string;
  visitorName?: string;
  visitorEmail?: string;
  visitorPhone?: string;
  businessType?: string;
  firstSeenAt?: string;
  lastMessageAt?: string;
  messages?: { sender: string; text: string; timestamp: string }[];
}

export interface ConversionFeeds {
  whatsapp?: Conversation[];
  sms?: Conversation[];
  viber?: Conversation[];
  email?: EmailThreadLite[];
  calls?: VapiCall[];
  web?: WebSessionLite[];
}

export interface ConversionEligibility {
  eligible: boolean;
  /** Channels with a real two-way interaction (in CONVERT_CHANNELS order). */
  channels: ConvertChannel[];
  firstContactAt?: string;
  firstReplyAt?: string;
  lastActivityAt?: string;
  /** Why it is (or isn't) eligible; used as the disabled-button tooltip. */
  reason: string;
}

// ── matching ──────────────────────────────────────────────────────────────
export const phoneKey = (p?: string | null) => (p ? normalizePhPhone(p) : "");
export const emailKey = (e?: string | null) => (e ? e.trim().toLowerCase() : "");

/** Extracts the bare address from `"Name" <a@b.com>` or `a@b.com`. */
export function emailAddress(raw?: string | null): string {
  if (!raw) return "";
  const m = raw.match(/<([^>]+)>/) ?? raw.match(/[\w.+-]+@[\w.-]+\.[A-Za-z]{2,}/);
  return emailKey(m ? (m[1] ?? m[0]) : raw);
}
export const isRgfAddress = (addr: string) => emailKey(addr).endsWith(`@${RGF_EMAIL_DOMAIN}`);

function sameLead(lead: LeadIdentity, phone?: string | null, email?: string | null, id?: string) {
  const p = phoneKey(lead.phone);
  const e = emailKey(lead.email);
  return (
    (!!p && p === phoneKey(phone)) ||
    (!!e && e === emailKey(email)) ||
    (!!lead.id && lead.id === id)
  );
}

// ── timeline ──────────────────────────────────────────────────────────────
export interface TimelineItem {
  channel: ConvertChannel;
  ts: string;
  /** out = RGF (Martin, Mara or a rep); in = the lead. */
  direction: "out" | "in";
  who: string;
  text: string;
  /** Deep link to the source thread/call/session in the dashboard. */
  href: string;
}

const ms = (ts?: string) => {
  const t = ts ? Date.parse(ts) : NaN;
  return Number.isFinite(t) ? t : 0;
};
const byTime = (a: TimelineItem, b: TimelineItem) => ms(a.ts) - ms(b.ts);

function convItems(ch: "whatsapp" | "sms" | "viber", c: Conversation): TimelineItem[] {
  const route = { whatsapp: "/whatsapp", sms: "/sms", viber: "/viber" }[ch];
  const href = `${route}?phone=${encodeURIComponent(c.phone)}`;
  return (c.messages ?? []).map((m) => ({
    channel: ch,
    ts: m.ts,
    direction: m.role === "customer" ? "in" : "out",
    who:
      m.role === "customer"
        ? c.leadName || c.companyName || "Lead"
        : m.role === "human"
          ? m.agentName || "Sales rep"
          : "Martin",
    text: m.content ?? "",
    href,
  }));
}

function callItems(c: VapiCall): TimelineItem[] {
  const href = `/calls?id=${encodeURIComponent(c.id)}`;
  const base = c.startedAt ?? c.createdAt;
  const lines = transcriptLines(c);
  const outcome = callOutcome(c);
  const head: TimelineItem = {
    channel: "voice",
    ts: c.createdAt,
    direction: "out",
    who: "Mara",
    text: `Call · ${outcome}${c.analysis?.summary ? ` · ${c.analysis.summary}` : ""}`,
    href,
  };
  return [
    head,
    ...lines.map((l, i) => ({
      channel: "voice" as const,
      ts:
        l.start != null && base
          ? new Date(ms(base) + l.start * 1000).toISOString()
          : new Date(ms(base) + i).toISOString(),
      direction: (l.speaker === "customer" ? "in" : "out") as "in" | "out",
      who: l.speaker === "customer" ? "Lead" : "Mara",
      text: l.text,
      href,
    })),
  ];
}

function emailItems(t: EmailThreadLite): TimelineItem[] {
  return [
    {
      channel: "email",
      ts: t.date,
      direction: t.direction === "inbound" ? "in" : "out",
      who: t.direction === "inbound" ? emailAddress(t.from) || "Lead" : "Martin",
      text: [t.subject, t.snippet].filter(Boolean).join(" — "),
      href: `/email?thread=${encodeURIComponent(t.threadId)}`,
    },
  ];
}

function webItems(s: WebSessionLite): TimelineItem[] {
  const href = `/website?session=${encodeURIComponent(s.sessionId)}`;
  return (s.messages ?? []).map((m) => ({
    channel: "web",
    ts: m.timestamp,
    direction: m.sender === "visitor" ? "in" : "out",
    who: m.sender === "visitor" ? s.visitorName || "Visitor" : "Martin",
    text: m.text ?? "",
    href,
  }));
}

const callPhone = (c: VapiCall) => c.customer?.number;

/** Every message/call/email for this lead across all channels, oldest first. */
export function buildLeadTimeline(lead: LeadIdentity, feeds: ConversionFeeds): TimelineItem[] {
  const out: TimelineItem[] = [];
  for (const ch of ["whatsapp", "sms", "viber"] as const)
    for (const c of feeds[ch] ?? [])
      if (!isTestConversation(c) && sameLead(lead, c.phone, c.leadEmail, c.leadId))
        out.push(...convItems(ch, c));
  for (const c of feeds.calls ?? []) if (sameLead(lead, callPhone(c))) out.push(...callItems(c));
  const e = emailKey(lead.email);
  if (e)
    for (const t of feeds.email ?? [])
      if (emailAddress(t.from) === e || emailAddress(t.to) === e) out.push(...emailItems(t));
  for (const s of feeds.web ?? [])
    if (sameLead(lead, s.visitorPhone, s.visitorEmail)) out.push(...webItems(s));
  return out.filter((i) => i.ts).sort(byTime);
}

// ── eligibility ───────────────────────────────────────────────────────────
interface ChannelResult {
  contacted: boolean;
  replied: boolean;
  firstContactAt?: string;
  firstReplyAt?: string;
  lastAt?: string;
}

const minTs = (a?: string, b?: string) => (!a ? b : !b ? a : ms(a) <= ms(b) ? a : b);
const maxTs = (a?: string, b?: string) => (!a ? b : !b ? a : ms(a) >= ms(b) ? a : b);

function fold(results: ChannelResult[]): ChannelResult {
  return results.reduce<ChannelResult>(
    (acc, r) => ({
      contacted: acc.contacted || r.contacted,
      replied: acc.replied || r.replied,
      firstContactAt: minTs(acc.firstContactAt, r.firstContactAt),
      firstReplyAt: minTs(acc.firstReplyAt, r.firstReplyAt),
      lastAt: maxTs(acc.lastAt, r.lastAt),
    }),
    { contacted: false, replied: false },
  );
}

function evalConversation(c: Conversation): ChannelResult {
  const msgs = [...(c.messages ?? [])].sort((a, b) => ms(a.ts) - ms(b.ts));
  const firstOut = msgs.find((m) => m.role !== "customer");
  const replied = hasReplied(c);
  const firstReply = replied
    ? (msgs.find((m) => m.role === "customer" && (!firstOut || ms(m.ts) >= ms(firstOut.ts))) ??
      msgs.find((m) => m.role === "customer"))
    : undefined;
  return {
    contacted: !!firstOut,
    replied,
    firstContactAt: firstOut?.ts,
    firstReplyAt: firstReply?.ts,
    lastAt: msgs.at(-1)?.ts ?? c.lastMessageAt,
  };
}

function evalCall(c: VapiCall): ChannelResult {
  const outcome = callOutcome(c);
  const spoke = transcriptLines(c).some((l) => l.speaker === "customer" && l.text.trim());
  const reached = !["No Answer", "Voicemail", "Failed", "Live"].includes(outcome);
  return {
    contacted: true,
    replied: reached && spoke,
    firstContactAt: c.createdAt,
    firstReplyAt: reached && spoke ? (c.startedAt ?? c.createdAt) : undefined,
    lastAt: c.endedAt ?? c.createdAt,
  };
}

function evalEmail(threads: EmailThreadLite[], lead: string): ChannelResult {
  const mine = threads.filter((t) => emailAddress(t.from) === lead || emailAddress(t.to) === lead);
  const inbound = mine.filter(
    (t) => t.direction === "inbound" && emailAddress(t.from) === lead && !isRgfAddress(t.from),
  );
  const outbound = mine.filter((t) => t.direction === "outbound");
  return {
    contacted: outbound.length > 0 || inbound.length > 0,
    replied: inbound.length > 0,
    firstContactAt: outbound.map((t) => t.date).reduce(minTs, undefined as string | undefined),
    firstReplyAt: inbound.map((t) => t.date).reduce(minTs, undefined as string | undefined),
    lastAt: mine.map((t) => t.date).reduce(maxTs, undefined as string | undefined),
  };
}

function evalWeb(s: WebSessionLite): ChannelResult {
  const msgs = s.messages ?? [];
  const visitor = msgs.filter((m) => m.sender === "visitor");
  const captured = !!(s.visitorPhone?.trim() || s.visitorEmail?.trim());
  const replied = visitor.length > 0 && captured;
  return {
    contacted: msgs.length > 0,
    replied,
    firstContactAt: s.firstSeenAt ?? msgs[0]?.timestamp,
    firstReplyAt: replied ? visitor[0]?.timestamp : undefined,
    lastAt: s.lastMessageAt ?? msgs.at(-1)?.timestamp,
  };
}

const LABEL: Record<ConvertChannel, string> = {
  whatsapp: "WhatsApp",
  sms: "SMS",
  viber: "Viber",
  email: "Email",
  voice: "Voice",
  web: "Website",
};
export const channelLabel = (c: ConvertChannel) => LABEL[c];

/**
 * A Pre-Lead is convertible when it has a real two-way interaction on any channel:
 * WhatsApp/SMS/Viber pass hasReplied(); an inbound Gmail message from the lead's own
 * (non-RGF) address; a Vapi call where the customer spoke and it wasn't no-answer,
 * voicemail or failed; a website session with visitor messages and a captured phone/email.
 */
export function getConversionEligibility(
  lead: LeadIdentity,
  feeds: ConversionFeeds,
): ConversionEligibility {
  if (isTestConversation({ companyName: lead.companyName }))
    return { eligible: false, channels: [], reason: "Test company — excluded from conversion" };
  if (!phoneKey(lead.phone) && !emailKey(lead.email) && !lead.id)
    return { eligible: false, channels: [], reason: "No phone or email to match conversations" };

  const per: Partial<Record<ConvertChannel, ChannelResult>> = {};
  for (const ch of ["whatsapp", "sms", "viber"] as const) {
    const rs = (feeds[ch] ?? [])
      .filter((c) => !isTestConversation(c) && sameLead(lead, c.phone, c.leadEmail, c.leadId))
      .map(evalConversation);
    if (rs.length) per[ch] = fold(rs);
  }
  const e = emailKey(lead.email);
  if (e && feeds.email?.length) {
    const r = evalEmail(feeds.email, e);
    if (r.contacted) per.email = r;
  }
  const calls = (feeds.calls ?? []).filter((c) => sameLead(lead, callPhone(c)));
  if (calls.length) per.voice = fold(calls.map(evalCall));
  const web = (feeds.web ?? []).filter((s) => sameLead(lead, s.visitorPhone, s.visitorEmail));
  if (web.length) per.web = fold(web.map(evalWeb));

  const channels = CONVERT_CHANNELS.filter((ch) => per[ch]?.replied);
  const all = fold(Object.values(per) as ChannelResult[]);
  const contacted = CONVERT_CHANNELS.filter((ch) => per[ch]?.contacted);
  const reason = channels.length
    ? `Replied on ${channels.map(channelLabel).join(", ")}`
    : contacted.length
      ? `Contacted on ${contacted.map(channelLabel).join(", ")} — no reply yet`
      : "No outreach or reply found on any channel";
  return {
    eligible: channels.length > 0,
    channels,
    firstContactAt: all.firstContactAt,
    firstReplyAt: all.firstReplyAt,
    lastActivityAt: all.lastAt,
    reason,
  };
}

// ── dialog prefill ────────────────────────────────────────────────────────
/** Plain-text summary of the last 10 timeline entries, capped at `max` chars. */
export function conversationSummary(items: TimelineItem[], max = 1500): string {
  const lines = items.slice(-10).map((i) => {
    const text = i.text.replace(/\s+/g, " ").trim();
    return `[${channelLabel(i.channel)}] ${i.who}: ${text}`;
  });
  let out = lines.join("\n");
  while (out.length > max && lines.length > 1) {
    lines.shift();
    out = lines.join("\n");
  }
  return out.length > max ? `${out.slice(0, max - 1)}…` : out;
}

/** Splits "Ana Maria Cruz" → first "Ana Maria", last "Cruz"; empty last → "Unknown". */
export function splitName(full?: string): { firstName: string; lastName: string } {
  const parts = (full ?? "").trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return { firstName: "", lastName: "Unknown" };
  if (parts.length === 1) return { firstName: "", lastName: parts[0] };
  return { firstName: parts.slice(0, -1).join(" "), lastName: parts.at(-1)! };
}

// ── API contracts ─────────────────────────────────────────────────────────
export interface ConvertLeadInput {
  firstName: string;
  lastName: string;
  company: string;
  phone: string;
  email: string;
  product: string;
  channel: string;
  leadSource: string;
  leadStatus: string;
  ownerId?: string;
  notes: string;
}

/** Body of POST /api/actions/convert-lead (forwarded to n8n /dashboard-convert-lead). */
export interface ConvertLeadRequest {
  preLeadId: string;
  lead: ConvertLeadInput;
  repliedChannels: ConvertChannel[];
  firstContactAt?: string;
  firstReplyAt?: string;
  force?: boolean;
}

export type ConvertLeadResult =
  | { ok: true; leadId: string; zohoUrl?: string; convertedAt?: string; dryRun?: boolean }
  | {
      ok: false;
      duplicate: true;
      existingLeadId: string;
      existingZohoUrl?: string;
      matchedOn?: "phone" | "email";
    }
  | { ok: false; duplicate?: false; error: string };

export const LEAD_STATUSES = [
  "Contacted",
  "Attempted to Contact",
  "Contact in Future",
  "Not Contacted",
  "Pre-Qualified",
  "Not Qualified",
  "Lost Lead",
  "Junk Lead",
] as const;

export const ZOHO_LEAD_URL = (id: string) =>
  `https://crm.zoho.com/crm/tab/Leads/${encodeURIComponent(id)}`;
