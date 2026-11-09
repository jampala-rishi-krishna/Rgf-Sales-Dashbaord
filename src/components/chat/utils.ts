import { formatManila, hasReplied, type Conversation } from "@/lib/channels";

export type ChatVariant = "whatsapp" | "viber" | "sms";
export type ChatFilter = "all" | "replied" | "not_replied" | "escalated" | "meeting";

export const CHAT_FILTERS: { key: ChatFilter; label: string }[] = [
  { key: "all", label: "All" },
  { key: "replied", label: "Replied" },
  { key: "not_replied", label: "Not replied" },
  { key: "escalated", label: "Escalated" },
  { key: "meeting", label: "Meeting booked" },
];

export function displayName(c: Pick<Conversation, "leadName" | "companyName" | "phone">) {
  return c.leadName || c.companyName || c.phone;
}

export function initials(name: string) {
  const parts = name
    .replace(/[^\p{L}\p{N} ]/gu, " ")
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  if (parts.length === 0) return "#";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[1][0]).toUpperCase();
}

const AVATAR_COLORS = [
  "#00A884",
  "#53BDEB",
  "#FF8A65",
  "#A78BFA",
  "#F472B6",
  "#FBBF24",
  "#34D399",
  "#60A5FA",
  "#F87171",
  "#7360F2",
];
export function avatarColor(seed: string) {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) | 0;
  return AVATAR_COLORS[Math.abs(h) % AVATAR_COLORS.length];
}

function ms(ts?: string) {
  const t = ts ? new Date(ts).getTime() : NaN;
  return Number.isFinite(t) ? t : 0;
}
export function lastActivity(c: Conversation) {
  return Math.max(ms(c.lastMessageAt), ms(c.lastUpdated), ms(c.messages.at(-1)?.ts));
}

/** Search + chip filter, then sort by last activity (newest first). Test conversations are already removed by the feed hooks. */
export function filterConversations(items: Conversation[], q: string, filter: ChatFilter) {
  const query = q.trim().toLowerCase();
  return items
    .filter((c) => {
      if (filter === "replied" && !hasReplied(c)) return false;
      if (filter === "not_replied" && hasReplied(c)) return false;
      if (filter === "escalated" && !c.humanEscalated) return false;
      if (filter === "meeting" && !c.meetingScheduled) return false;
      if (!query) return true;
      return [c.phone, c.leadName, c.companyName].join(" ").toLowerCase().includes(query);
    })
    .sort((a, b) => lastActivity(b) - lastActivity(a));
}

/** Manila calendar-day key (YYYY-MM-DD). */
export function dayKey(ts?: string) {
  if (!ts) return "";
  try {
    return new Date(ts).toLocaleDateString("en-CA", { timeZone: "Asia/Manila" });
  } catch {
    return "";
  }
}

export function dayLabel(ts: string) {
  const k = dayKey(ts);
  const today = dayKey(new Date().toISOString());
  const yesterday = dayKey(new Date(Date.now() - 86_400_000).toISOString());
  if (k === today) return "Today";
  if (k === yesterday) return "Yesterday";
  return formatManila(ts, { weekday: "short", month: "long", day: "numeric", year: "numeric" });
}

export function timeOnly(ts?: string) {
  return formatManila(ts, { hour: "numeric", minute: "2-digit" });
}

/** List-row timestamp: time if today, "Yesterday", else short date. */
export function listTime(ts?: string) {
  if (!ts) return "";
  const label = dayLabel(ts);
  if (label === "Today") return timeOnly(ts);
  if (label === "Yesterday") return "Yesterday";
  return formatManila(ts, { month: "short", day: "numeric" });
}

export function zohoLeadUrl(leadId: string) {
  return `https://crm.zoho.com/crm/tab/CustomModule?id=${encodeURIComponent(leadId)}`;
}

export function isTypingTarget(el: EventTarget | null) {
  if (!(el instanceof HTMLElement)) return false;
  return el.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(el.tagName);
}
