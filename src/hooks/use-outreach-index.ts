// Client-side join of every outreach feed, keyed by normalized phone / leadId / lowercased email.
import { useMemo } from "react";
import { hasReplied, type Conversation } from "@/lib/channels";
import { normalizePhPhone } from "@/lib/phone";
import {
  useSmsFeed,
  useVapiFeed,
  useViberFeed,
  useWebsiteFeed,
  useWhatsAppFeed,
} from "@/hooks/use-feeds";

export type OutreachState = { contacted: boolean; replied: boolean; meeting: boolean };
export type OutreachChannel = "whatsapp" | "sms" | "viber" | "email" | "call" | "web";
export type OutreachEntry = Partial<Record<OutreachChannel, OutreachState>>;
export type OutreachIndex = Map<string, OutreachEntry>;

export const OUTREACH_CHANNELS: OutreachChannel[] = [
  "whatsapp",
  "sms",
  "viber",
  "email",
  "call",
  "web",
];

const phoneKey = (p?: string) => (p ? normalizePhPhone(p) : "");
const idKey = (id?: string) => (id ? `id:${id}` : "");
const emailKey = (e?: string) => (e ? `email:${e.trim().toLowerCase()}` : "");

function merge(index: OutreachIndex, keys: string[], ch: OutreachChannel, s: OutreachState) {
  for (const k of keys) {
    if (!k) continue;
    const entry = index.get(k) ?? {};
    const prev = entry[ch];
    entry[ch] = prev
      ? {
          contacted: prev.contacted || s.contacted,
          replied: prev.replied || s.replied,
          meeting: prev.meeting || s.meeting,
        }
      : s;
    index.set(k, entry);
  }
}

function addConversations(
  index: OutreachIndex,
  ch: OutreachChannel,
  items: Conversation[] | undefined,
) {
  for (const c of items ?? []) {
    merge(index, [phoneKey(c.phone), idKey(c.leadId), emailKey(c.leadEmail)], ch, {
      contacted: c.messages?.some((m) => m.role !== "customer") ?? true,
      replied: hasReplied({ messages: c.messages ?? [] }),
      meeting: !!c.meetingScheduled,
    });
  }
}

/** Pure builder (exported for tests / server reuse). */
export function buildOutreachIndex(input: {
  whatsapp?: Conversation[];
  sms?: Conversation[];
  viber?: Conversation[];
  web?: Record<string, unknown>[];
  calls?: Record<string, unknown>[];
}): OutreachIndex {
  const index: OutreachIndex = new Map();
  addConversations(index, "whatsapp", input.whatsapp);
  addConversations(index, "sms", input.sms);
  addConversations(index, "viber", input.viber);
  for (const s of input.web ?? []) {
    const msgs = (s.messages as { sender?: string }[] | undefined) ?? [];
    const stage = String(s.conversationStage ?? "").toLowerCase();
    merge(index, [phoneKey(s.visitorPhone as string), emailKey(s.visitorEmail as string)], "web", {
      contacted: true,
      replied: msgs.some((m) => m.sender === "visitor"),
      meeting: stage.includes("meeting"),
    });
  }
  for (const c of input.calls ?? []) {
    const num = (c.customer as { number?: string } | undefined)?.number;
    const ended = String(c.endedReason ?? "").toLowerCase();
    const summary = String(
      (c.analysis as { summary?: string } | undefined)?.summary ?? "",
    ).toLowerCase();
    merge(index, [phoneKey(num)], "call", {
      contacted: true,
      replied: !!c.startedAt && !/no-answer|busy|failed|voicemail/.test(ended),
      meeting: /meeting (booked|scheduled)/.test(summary),
    });
  }
  return index;
}

/** Memoized outreach index from the shared feed hooks (shares their query cache). */
export function useOutreachIndex() {
  const wa = useWhatsAppFeed();
  const sms = useSmsFeed();
  const viber = useViberFeed();
  const web = useWebsiteFeed();
  const vapi = useVapiFeed();
  const index = useMemo(
    () =>
      buildOutreachIndex({
        whatsapp: wa.data?.items,
        sms: sms.data?.items,
        viber: viber.data?.items,
        web: Array.isArray(web.data) ? web.data : [],
        calls: Array.isArray(vapi.data) ? vapi.data : [],
      }),
    [wa.data, sms.data, viber.data, web.data, vapi.data],
  );
  const isLoading = wa.isLoading || sms.isLoading || viber.isLoading;
  return {
    index,
    isLoading,
    feeds: {
      whatsapp: wa.data?.items ?? [],
      sms: sms.data?.items ?? [],
      viber: viber.data?.items ?? [],
      web: (web.data ?? []) as Record<string, unknown>[],
      calls: (vapi.data ?? []) as Record<string, unknown>[],
    },
  };
}

/** Merge all index entries that match the lead's phone, id or email. */
export function lookupOutreach(
  index: OutreachIndex,
  lead: { id?: string; leadId?: string; phone?: string; email?: string },
): OutreachEntry {
  const keys = [phoneKey(lead.phone), idKey(lead.id ?? lead.leadId), emailKey(lead.email)].filter(
    Boolean,
  );
  const out: OutreachEntry = {};
  for (const k of keys) {
    const e = index.get(k);
    if (!e) continue;
    for (const ch of OUTREACH_CHANNELS) {
      const s = e[ch];
      if (!s) continue;
      const p = out[ch];
      out[ch] = p
        ? {
            contacted: p.contacted || s.contacted,
            replied: p.replied || s.replied,
            meeting: p.meeting || s.meeting,
          }
        : { ...s };
    }
  }
  return out;
}

export function outreachSummary(e: OutreachEntry) {
  const states = Object.values(e).filter(Boolean) as OutreachState[];
  return {
    contacted: states.some((s) => s.contacted),
    replied: states.some((s) => s.replied),
    meeting: states.some((s) => s.meeting),
  };
}
