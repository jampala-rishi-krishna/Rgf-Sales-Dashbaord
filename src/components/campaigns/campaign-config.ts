import type { ChannelKey } from "@/lib/channels";
import type { CampaignChannel } from "@/hooks/use-campaign-runs";

/** "asc" = Oldest first, "desc" = Newest first (exact n8n sort_order values). */
export type { BulkSortOrder as SortOrder } from "@/lib/bulk-payload";

export interface CampaignDef {
  key: CampaignChannel;
  /** Identity channel in CHANNELS. */
  channel: ChannelKey;
  /** Key in the outreach index entry. */
  outreachKey: "whatsapp" | "sms" | "viber" | "email" | "call";
  title: string;
  agentLine: string;
  hasCount: boolean;
  hasSort: boolean;
  needs: "phone" | "email";
  note?: string;
  warning?: string;
  /** Max leads per launch (defaults to MAX_LIMIT). */
  maxLimit?: number;
  /** Shows the "Only leads not yet called" checkbox. */
  hasSkipContacted?: boolean;
}

export const CAMPAIGNS: CampaignDef[] = [
  {
    key: "whatsapp",
    channel: "whatsapp",
    outreachKey: "whatsapp",
    title: "WhatsApp openers",
    agentLine: "Martin sends the WhatsApp opener template",
    hasCount: true,
    hasSort: true,
    needs: "phone",
  },
  {
    key: "sms",
    channel: "sms",
    outreachKey: "sms",
    title: "SMS openers",
    agentLine: "Martin texts the SMS opener",
    hasCount: true,
    hasSort: false,
    needs: "phone",
    warning: "0/blank means ALL eligible leads in n8n — blocked here",
  },
  {
    key: "viber",
    channel: "viber",
    outreachKey: "viber",
    title: "Viber openers",
    agentLine: "Martin sends the Viber opener",
    hasCount: true,
    hasSort: false,
    needs: "phone",
    note: "Workflow not published yet",
  },
  {
    key: "email",
    channel: "email",
    outreachKey: "email",
    title: "Email outreach",
    agentLine: "Martin emails the intro + brochure",
    hasCount: true,
    hasSort: true,
    needs: "email",
  },
  {
    key: "voice_batch",
    channel: "voice",
    outreachKey: "call",
    title: "Voice calls",
    agentLine: "Mara calls Pre-Leads one by one",
    hasCount: true,
    hasSort: true,
    hasSkipContacted: true,
    maxLimit: 50,
    needs: "phone",
  },
];

export const VOICE_BATCH_SIZE = 3;
export { MAX_BULK_LIMIT as MAX_LIMIT } from "@/lib/bulk-payload";
export const DEFAULT_LIMIT = 10;
