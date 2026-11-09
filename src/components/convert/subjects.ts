// Convert-to-Lead subjects built from each channel's conversation shape.
import type { Conversation } from "@/lib/channels";
import { emailAddress, isRgfAddress } from "@/lib/conversion";
import type { ConvertSubject } from "@/lib/convert-defaults";
import { parseSender, type GmailThreadSummary } from "@/components/email/types";

/** WhatsApp / SMS / Viber conversation. */
export function conversationSubject(c: Conversation): ConvertSubject {
  return {
    preLeadId: c.leadId,
    name: c.leadName,
    company: c.companyName,
    phone: c.phone,
    email: c.leadEmail,
    product: c.product,
    channelSegment: c.channel,
  };
}

/** The lead side of a Gmail thread: the first non-RGF address among from / to. */
export function emailSubject(t: GmailThreadSummary): ConvertSubject | null {
  const candidates = [t.from, ...(t.to ?? "").split(",")].filter(Boolean);
  const raw = candidates.find((a) => {
    const addr = emailAddress(a);
    return !!addr && !isRgfAddress(addr);
  });
  if (!raw) return null;
  const sender = parseSender(raw);
  return { email: emailAddress(raw), name: sender.name || undefined };
}
