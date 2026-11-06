export interface GmailThreadSummary {
  threadId: string;
  subject: string;
  from: string;
  to: string;
  date: string;
  direction: "inbound" | "outbound";
  snippet: string;
  messageCount: number;
  isUnread: boolean;
  isFlagged: boolean;
  /** Not provided by /api/gmail-threads today; reserved for when it is. */
  hasAttachment?: boolean;
}

export interface GmailMessage {
  id: string;
  from: string;
  to: string;
  subject: string;
  date: string;
  direction: "inbound" | "outbound";
  htmlBody: string;
  snippet: string;
}

export type MailboxKey = "inbox" | "starred" | "sent" | "ai-replied" | "needs-human" | "openers";
export type ChipKey = "has-reply" | "from-lead" | "has-attachment" | "last-7d";

export const MAILBOXES: { key: MailboxKey; label: string; hint: string }[] = [
  { key: "inbox", label: "Inbox", hint: "All sales threads" },
  { key: "starred", label: "Starred", hint: "Starred in Gmail" },
  { key: "sent", label: "Sent", hint: "Last message was sent by us" },
  { key: "ai-replied", label: "AI Replied", hint: "Conversations where Martin replied last" },
  {
    key: "needs-human",
    label: "Needs Human",
    hint: "Lead replied after our opener and is waiting",
  },
  { key: "openers", label: "Campaign Openers", hint: "Single outbound opener, no reply yet" },
];

export const PAGE_SIZE = 40;

// Client-side approximations — the list API has no label data beyond STARRED/UNREAD.
export function matchesMailbox(t: GmailThreadSummary, key: MailboxKey): boolean {
  switch (key) {
    case "inbox":
      return true;
    case "starred":
      return t.isFlagged;
    case "sent":
      return t.direction === "outbound";
    case "ai-replied":
      return t.direction === "outbound" && t.messageCount > 1;
    case "needs-human":
      return t.direction === "inbound" && t.messageCount > 1;
    case "openers":
      return t.direction === "outbound" && t.messageCount === 1;
  }
}

export function matchesChip(t: GmailThreadSummary, chip: ChipKey): boolean {
  switch (chip) {
    case "has-reply":
      return t.messageCount > 1;
    case "from-lead":
      return t.direction === "inbound";
    case "has-attachment":
      return !!t.hasAttachment;
    case "last-7d": {
      const ts = new Date(t.date).getTime();
      return Number.isFinite(ts) && Date.now() - ts <= 7 * 86_400_000;
    }
  }
}

export function parseSender(raw: string): { name: string; email: string } {
  const match = raw.match(/^\s*"?([^"<]*)"?\s*<([^>]+)>\s*$/);
  if (match) return { name: match[1].trim(), email: match[2].trim() };
  const emailMatch = raw.match(/[\w.+-]+@[\w.-]+\.[A-Za-z]{2,}/);
  return { name: "", email: emailMatch?.[0] ?? raw.trim() };
}

export function displayName(raw: string): string {
  const s = parseSender(raw);
  return s.name || s.email.split("@")[0] || s.email;
}

export function dedupeByThreadId(threads: GmailThreadSummary[]): GmailThreadSummary[] {
  const map = new Map<string, GmailThreadSummary>();
  for (const t of threads) map.set(t.threadId, t);
  return Array.from(map.values());
}

/** Gmail-style list date: time today, "Mar 4" this year, else "3/4/24". */
export function formatListDate(ts: string): string {
  const d = new Date(ts);
  if (Number.isNaN(d.getTime())) return "";
  const now = new Date();
  if (d.toDateString() === now.toDateString()) {
    return d.toLocaleTimeString("en-PH", { hour: "numeric", minute: "2-digit" });
  }
  if (d.getFullYear() === now.getFullYear()) {
    return d.toLocaleDateString("en-PH", { month: "short", day: "numeric" });
  }
  return d.toLocaleDateString("en-PH", { year: "2-digit", month: "numeric", day: "numeric" });
}

export function formatFullDate(ts: string): string {
  const d = new Date(ts);
  if (Number.isNaN(d.getTime())) return ts;
  return d.toLocaleString("en-PH", {
    weekday: "short",
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

const AVATAR_COLORS = [
  "#4285F4",
  "#EA4335",
  "#34A853",
  "#FBBC04",
  "#A142F4",
  "#24C1E0",
  "#F06292",
  "#E8710A",
];
export function avatarColor(seed: string): string {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) | 0;
  return AVATAR_COLORS[Math.abs(h) % AVATAR_COLORS.length];
}

export function escapeHtml(s: string): string {
  return s.replace(
    /[&<>"']/g,
    (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!,
  );
}

/** Strip active content before rendering in the (script-less) sandboxed iframe. */
export function sanitizeEmailHtml(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<(iframe|object|embed|form)[\s\S]*?<\/\1>/gi, "")
    .replace(/\son\w+\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, "")
    .replace(/(href|src)\s*=\s*(["'])\s*javascript:[^"']*\2/gi, '$1="#"');
}
