// Pure join of Zoho Leads ⇄ dashboard conversions, plus the /leads KPI helpers.
import {
  CONVERT_CHANNELS,
  emailAddress,
  emailKey,
  phoneKey,
  type ConversionFeeds,
  type ConvertChannel,
} from "@/lib/conversion";
import type { LeadConversion, LeadRecord } from "@/lib/leads";
import { normalizePhPhone } from "@/lib/phone";

export interface JoinedLead {
  id: string;
  lead: LeadRecord;
  conversion?: LeadConversion;
  name: string;
  company: string;
  /** Normalized +63… (Mobile preferred over Phone). */
  phone: string;
  email: string;
  sourceChannel?: ConvertChannel;
  product: string;
  status: string;
  owner: string;
  firstContactAt?: string;
  firstReplyAt?: string;
  /** convertedAt when converted from the dashboard, else Zoho Created_Time. */
  becameLeadAt?: string;
  daysToConvert?: number;
  lastActivityAt?: string;
  convertedBy?: string;
  fromDashboard: boolean;
}

const DAY = 86_400_000;
const ms = (ts?: string) => {
  const t = ts ? Date.parse(ts) : NaN;
  return Number.isFinite(t) ? t : NaN;
};
const maxTs = (a?: string, b?: string) => (!a ? b : !b ? a : (ms(a) || 0) >= (ms(b) || 0) ? a : b);

const SOURCE_RE: [RegExp, ConvertChannel][] = [
  [/whats\s*app/i, "whatsapp"],
  [/viber/i, "viber"],
  [/\bsms\b|text/i, "sms"],
  [/e-?mail|gmail/i, "email"],
  [/voice|call|phone|vapi/i, "voice"],
  [/web(site)?|chat/i, "web"],
];

/** "AI Agent - WhatsApp" → "whatsapp". Undefined for sources that aren't a channel. */
export function channelFromLeadSource(src?: string): ConvertChannel | undefined {
  if (!src) return undefined;
  const tail = src.includes(" - ") ? src.split(" - ").slice(1).join(" - ") : src;
  for (const [re, ch] of SOURCE_RE) if (re.test(tail)) return ch;
  return undefined;
}

const text = (v: unknown) => (typeof v === "string" ? v : v == null ? "" : String(v));

function productOf(l: LeadRecord): string {
  const v =
    l.Product_Interest ?? l.Associated_Products ?? l.Product ?? l.Products ?? l.product ?? "";
  return Array.isArray(v) ? v.map(text).filter(Boolean).join(", ") : text(v);
}

/**
 * Joins leads with conversions (by leadId). `activity` optionally maps a normalized phone
 * or lowercase email to the latest feed activity, used for "Last activity".
 */
export function joinLeads(
  leads: LeadRecord[],
  conversions: LeadConversion[],
  activity?: Map<string, string>,
): JoinedLead[] {
  const byLead = new Map<string, LeadConversion>();
  for (const c of conversions) {
    const prev = byLead.get(c.leadId);
    if (!prev || (ms(c.convertedAt) || 0) > (ms(prev.convertedAt) || 0)) byLead.set(c.leadId, c);
  }
  return leads.map((lead) => {
    const conversion = byLead.get(lead.id);
    const phone = normalizePhPhone(lead.Mobile || lead.Phone);
    const email = emailKey(lead.Email);
    const becameLeadAt = conversion?.convertedAt ?? lead.Created_Time;
    const firstContactAt = conversion?.firstContactAt;
    const days =
      firstContactAt && becameLeadAt
        ? Math.max(0, (ms(becameLeadAt) - ms(firstContactAt)) / DAY)
        : NaN;
    const feedLast = maxTs(
      phone ? activity?.get(phone) : undefined,
      email ? activity?.get(email) : undefined,
    );
    return {
      id: lead.id,
      lead,
      conversion,
      name: [lead.First_Name, lead.Last_Name].filter(Boolean).join(" ").trim(),
      company: lead.Company ?? "",
      phone,
      email,
      sourceChannel: conversion?.repliedChannels?.[0] ?? channelFromLeadSource(lead.Lead_Source),
      product: productOf(lead),
      status: lead.Lead_Status ?? "",
      owner: lead.Owner ?? "",
      firstContactAt,
      firstReplyAt: conversion?.firstReplyAt,
      becameLeadAt,
      daysToConvert: Number.isFinite(days) ? Math.round(days * 10) / 10 : undefined,
      lastActivityAt: maxTs(lead.Modified_Time, feedLast),
      convertedBy: conversion?.convertedBy,
      fromDashboard: !!conversion,
    };
  });
}

/** Latest feed activity per normalized phone / lowercase email (for "Last activity"). */
export function buildActivityMap(feeds: ConversionFeeds): Map<string, string> {
  const map = new Map<string, string>();
  const put = (key: string, ts?: string) => {
    if (!key || !ts || !Number.isFinite(ms(ts))) return;
    const prev = map.get(key);
    if (!prev || ms(ts) > ms(prev)) map.set(key, ts);
  };
  for (const ch of ["whatsapp", "sms", "viber"] as const)
    for (const c of feeds[ch] ?? []) {
      const ts = c.lastMessageAt || c.messages?.at(-1)?.ts || c.lastUpdated;
      put(phoneKey(c.phone), ts);
      put(emailKey(c.leadEmail), ts);
    }
  for (const c of feeds.calls ?? []) put(phoneKey(c.customer?.number), c.endedAt ?? c.createdAt);
  for (const s of feeds.web ?? []) {
    put(phoneKey(s.visitorPhone), s.lastMessageAt);
    put(emailKey(s.visitorEmail), s.lastMessageAt);
  }
  for (const t of feeds.email ?? []) {
    put(emailAddress(t.from), t.date);
    put(emailAddress(t.to), t.date);
  }
  return map;
}

// ── KPIs ──────────────────────────────────────────────────────────────────
const MANILA_OFFSET = 8 * 3_600_000; // Asia/Manila is UTC+8 with no DST.

/** Start (as epoch ms) of the Manila calendar week (Monday 00:00) containing `now`. */
export function manilaWeekStart(now = Date.now()): number {
  const local = new Date(now + MANILA_OFFSET);
  const dow = (local.getUTCDay() + 6) % 7; // Monday = 0
  const midnight = Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate());
  return midnight - dow * DAY - MANILA_OFFSET;
}

export function median(xs: number[]): number | undefined {
  const s = xs.filter(Number.isFinite).sort((a, b) => a - b);
  if (!s.length) return undefined;
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

export interface ChannelRate {
  channel: ConvertChannel;
  eligible: number;
  converted: number;
  /** 0..1 */
  rate: number;
}

/**
 * converted ÷ eligible per channel. `eligibleByChannel` counts every Pre-Lead that replied
 * on that channel (converted or not); a conversion counts for each of its replied channels.
 */
export function conversionRateByChannel(
  eligibleByChannel: Partial<Record<ConvertChannel, number>>,
  conversions: LeadConversion[],
): ChannelRate[] {
  return CONVERT_CHANNELS.map((channel) => {
    const converted = conversions.filter((c) => c.repliedChannels?.includes(channel)).length;
    const eligible = Math.max(eligibleByChannel[channel] ?? 0, converted);
    return { channel, eligible, converted, rate: eligible ? converted / eligible : 0 };
  });
}

export interface LeadsKpis {
  total: number;
  convertedThisWeek: number;
  fromDashboardAllTime: number;
  medianDaysToConvert?: number;
}

export function leadsKpis(rows: JoinedLead[], now = Date.now()): LeadsKpis {
  const week = manilaWeekStart(now);
  return {
    total: rows.length,
    convertedThisWeek: rows.filter((r) => (ms(r.becameLeadAt) || 0) >= week).length,
    fromDashboardAllTime: rows.filter((r) => r.fromDashboard).length,
    medianDaysToConvert: median(
      rows.map((r) => r.daysToConvert).filter((d): d is number => d != null),
    ),
  };
}
