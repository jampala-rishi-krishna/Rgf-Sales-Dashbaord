export interface WebsiteChatMessage {
  sender: "visitor" | "agent";
  text: string;
  timestamp: string;
  attachmentUrl?: string | null;
  attachmentType?: "price_list_pdf" | "catalog_pdf" | null;
}

export interface WebsiteChatSession {
  sessionId: string;
  visitorName: string;
  visitorEmail: string;
  visitorPhone: string;
  businessType: string;
  businessSegment: string;
  visitorCity: string;
  visitorRegion: string;
  visitorCountry: string;
  pageUrl: string;
  status: "ai" | "escalated";
  conversationStage: string;
  firstSeenAt: string;
  lastMessageAt: string;
  messageCount: number;
  messages: WebsiteChatMessage[];
}

export const sessionLabel = (s: WebsiteChatSession) =>
  s.visitorName || `Visitor · ${s.sessionId.slice(-8)}`;

export const statusMeta = (status: WebsiteChatSession["status"]) =>
  status === "escalated"
    ? { label: "Needs Human", cls: "bg-[#86000B] text-white" }
    : { label: "AI Handling", cls: "bg-[#33673B]/12 text-[#33673B] ring-1 ring-[#33673B]/30" };

export const initials = (name: string) =>
  name
    .replace(/[^\p{L}\p{N} ]/gu, "")
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0])
    .join("")
    .toUpperCase() || "V";

export function location(s: WebsiteChatSession) {
  return [s.visitorCity, s.visitorRegion, s.visitorCountry].filter(Boolean).join(", ");
}

const URL_RE = /(https?:\/\/[^\s<>()]+[^\s<>().,!?;:'"])/g;

export type TextPart =
  | { kind: "text"; text: string }
  | { kind: "link"; url: string }
  | { kind: "file"; url: string; name: string };

/** Splits message text into plain text, links and file (PDF) references. */
export function parseText(text: string): TextPart[] {
  const parts: TextPart[] = [];
  let last = 0;
  for (const m of text.matchAll(URL_RE)) {
    const url = m[0];
    const i = m.index ?? 0;
    if (i > last) parts.push({ kind: "text", text: text.slice(last, i) });
    if (/\.pdf($|[?#])/i.test(url)) parts.push({ kind: "file", url, name: fileName(url) });
    else parts.push({ kind: "link", url });
    last = i + url.length;
  }
  if (last < text.length) parts.push({ kind: "text", text: text.slice(last) });
  return parts;
}

export function fileName(url: string) {
  try {
    const n = decodeURIComponent(new URL(url).pathname.split("/").pop() ?? "");
    return n || "Document.pdf";
  } catch {
    return "Document.pdf";
  }
}

export function attachmentName(m: WebsiteChatMessage) {
  if (m.attachmentType === "price_list_pdf") return "Price List.pdf";
  if (m.attachmentType === "catalog_pdf") return "Product Catalog.pdf";
  return m.attachmentUrl ? fileName(m.attachmentUrl) : "Attachment";
}
