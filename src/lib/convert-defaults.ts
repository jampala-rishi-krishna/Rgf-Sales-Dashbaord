// Default Convert-to-Lead payload. Used by the dialog (as editable pre-fill) and by bulk
// conversion (as-is, no per-row editing). Pure and client-safe.
import {
  LEAD_SOURCE,
  conversationSummary,
  splitName,
  type ConversionEligibility,
  type ConvertLeadRequest,
  type TimelineItem,
} from "@/lib/conversion";

export interface ConvertSubject {
  /** Zoho Pre_Leads id (may be empty when only known from a conversation). */
  preLeadId?: string;
  /** Full contact name; split into first/last when firstName/lastName are absent. */
  name?: string;
  firstName?: string;
  lastName?: string;
  company?: string;
  phone?: string;
  email?: string;
  product?: string;
  /** Pre-Lead "Channel" segment (e.g. Restaurant, Hotel). */
  channelSegment?: string;
}

export function buildConvertRequest(
  s: ConvertSubject,
  elig: ConversionEligibility,
  timeline: TimelineItem[],
  ownerId?: string,
): ConvertLeadRequest {
  const split = splitName(s.name);
  const first = s.firstName?.trim() || (s.lastName ? "" : split.firstName);
  const last = s.lastName?.trim() || (s.firstName ? "" : split.lastName) || "Unknown";
  const primary = elig.channels[0];
  return {
    preLeadId: s.preLeadId ?? "",
    lead: {
      firstName: first,
      lastName: last || "Unknown",
      company: s.company?.trim() || [first, last].filter(Boolean).join(" ") || "Unknown",
      phone: s.phone ?? "",
      email: s.email ?? "",
      product: s.product ?? "",
      channel: s.channelSegment ?? "",
      leadSource: primary ? LEAD_SOURCE[primary] : "AI Agent",
      leadStatus: "Contacted",
      ownerId,
      notes: conversationSummary(timeline),
    },
    repliedChannels: elig.channels,
    firstContactAt: elig.firstContactAt,
    firstReplyAt: elig.firstReplyAt,
  };
}
