import { z } from "zod";

/** n8n bulk webhook paths (verified against the n8n workflows). */
export const BULK_PATHS = {
  whatsapp: "/whatsapp-bulk-trigger",
  sms: "/5630e167-fd05-44f9-88b4-aed5a72f3622",
  viber: "/b3e9d0a6-7c41-4f2e-9a85-viber-bulk-leadgen",
  email: "/email-outreach-trigger",
  // Calls N Pre-Leads (newest/oldest first), skipping numbers Mara already called.
  voice_batch: "/dashboard-voice-campaign",
} as const;

export const MAX_BULK_LIMIT = 500;
/** Voice calls run one by one (~5s apart), so keep a launch small. */
export const MAX_VOICE_LIMIT = 50;

/** "asc" = Oldest first, "desc" = Newest first. */
export const SortOrderSchema = z.enum(["asc", "desc"]);
export type BulkSortOrder = z.infer<typeof SortOrderSchema>;

const LimitSchema = z.number().int().min(1).max(MAX_BULK_LIMIT);

/**
 * Every bulk workflow treats limit 0 or a missing limit as "send to ALL eligible leads",
 * so limit is required and must be >= 1 for every counted channel.
 */
export const BulkRequestSchema = z.discriminatedUnion("channel", [
  z.object({
    channel: z.literal("whatsapp"),
    limit: LimitSchema,
    sortOrder: SortOrderSchema,
    runId: z.string().max(80).optional(),
  }),
  z.object({
    channel: z.literal("email"),
    limit: LimitSchema,
    sortOrder: SortOrderSchema,
    runId: z.string().max(80).optional(),
  }),
  z.object({ channel: z.literal("sms"), limit: LimitSchema, runId: z.string().max(80).optional() }),
  z.object({
    channel: z.literal("viber"),
    limit: LimitSchema,
    runId: z.string().max(80).optional(),
  }),
  z.object({
    channel: z.literal("voice_batch"),
    limit: z.number().int().min(1).max(MAX_VOICE_LIMIT),
    sortOrder: SortOrderSchema.default("desc"),
    skipContacted: z.boolean().default(true),
    runId: z.string().max(80).optional(),
  }),
]);
export type BulkRequest = z.infer<typeof BulkRequestSchema>;

/** Exact n8n body per channel. Nothing else is added. */
export function buildBulkPayload(req: BulkRequest): {
  path: string;
  body: Record<string, unknown>;
  count: number;
} {
  switch (req.channel) {
    case "whatsapp":
    case "email":
      return {
        path: BULK_PATHS[req.channel],
        body: { limit: req.limit, sort_order: req.sortOrder },
        count: req.limit,
      };
    case "sms":
    case "viber":
      return { path: BULK_PATHS[req.channel], body: { limit: req.limit }, count: req.limit };
    case "voice_batch":
      return {
        path: BULK_PATHS.voice_batch,
        body: { limit: req.limit, sortOrder: req.sortOrder, skipContacted: req.skipContacted },
        count: req.limit,
      };
  }
}
