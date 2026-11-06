// Shared channel identity + conversation helpers. Single source of truth for all tabs.
export type ChannelKey = "whatsapp" | "sms" | "viber" | "email" | "voice" | "web" | "crm" | "scout";

export const CHANNELS: Record<
  ChannelKey,
  { label: string; color: string; agent: "Martin" | "Mara" | "Scout" | "—"; route: string }
> = {
  whatsapp: { label: "WhatsApp", color: "#25D366", agent: "Martin", route: "/whatsapp" },
  sms: { label: "SMS", color: "#1A73E8", agent: "Martin", route: "/sms" },
  viber: { label: "Viber", color: "#7360F2", agent: "Martin", route: "/viber" },
  email: { label: "Email", color: "#EA4335", agent: "Martin", route: "/email" },
  voice: { label: "Voice", color: "#F97316", agent: "Mara", route: "/calls" },
  web: { label: "Website", color: "#86000B", agent: "Martin", route: "/website" },
  crm: { label: "Zoho CRM", color: "#226DB4", agent: "—", route: "/crm" },
  scout: { label: "Scout", color: "#0EA5A4", agent: "Scout", route: "/crm" },
};

export type ChatRole = "martin" | "customer" | "human";
export interface ChatMessage {
  role: ChatRole;
  content: string;
  ts: string;
  agentName?: string;
}

/** Shape shared by WhatsApp / SMS / Viber feeds (Viber adds the optional fields). */
export interface Conversation {
  phone: string;
  leadId?: string;
  leadName: string;
  companyName: string;
  leadEmail?: string;
  channel: string;
  product?: string;
  conversationStage: string;
  lastAction?: string;
  brochureSent: boolean;
  priceSent: boolean;
  formSent: boolean;
  meetingScheduled: boolean;
  meetingLink?: string;
  meetingDateTime?: string;
  humanEscalated: boolean;
  discountAttempts: number;
  duplicateRowCount?: number;
  openerDeliveryStatus?: string;
  smsFallbackSent?: boolean;
  lastUpdated: string;
  lastMessageAt: string;
  lastMessagePreview: string;
  messages: ChatMessage[];
}

/** Test-company exclusion (existing business rule). */
export function isTestConversation(c: { companyName?: string }) {
  return !!c.companyName?.startsWith("Test Dummy Company - ");
}

/** Real two-way reply: lead wrote at least once AND Martin wrote at least once (existing business rule). */
export function hasReplied(c: { messages: { role: string }[] }) {
  const roles = new Set(c.messages.map((m) => m.role));
  return roles.has("customer") && roles.has("martin");
}

export const MANILA_TZ = "Asia/Manila";
export function formatManila(
  ts: string | number | Date | undefined,
  opts: Intl.DateTimeFormatOptions = {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  },
) {
  if (!ts) return "";
  try {
    return new Date(ts).toLocaleString("en-PH", { timeZone: MANILA_TZ, ...opts });
  } catch {
    return String(ts);
  }
}
