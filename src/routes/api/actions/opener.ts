import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { json } from "@/lib/session.server";
import { callN8n, readJson, requireRole, toResponse } from "@/lib/n8n-actions.server";

// Viber path is not published in n8n yet; works in dry run, may 404 live.
const PATHS = {
  whatsapp: "/zoho-prelead-webhook",
  sms: "/zoho-prelead-sms-webhook",
  viber: "/zoho-prelead-viber-webhook",
} as const;

const Body = z.object({
  channel: z.enum(["whatsapp", "sms", "viber"]),
  lead: z.object({
    leadId: z.string().min(1).max(64),
    leadName: z.string().max(200).default(""),
    companyName: z.string().max(300).default(""),
    phone: z.string().min(5).max(32),
    product: z.string().max(300).default(""),
    channel: z.string().max(64).optional(),
  }),
});

export const Route = createFileRoute("/api/actions/opener")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const user = requireRole(request, "agent");
        if (user instanceof Response) return user;
        const parsed = Body.safeParse(await readJson(request));
        if (!parsed.success) return json({ ok: false, error: "Invalid opener request" }, 400);
        const { channel, lead } = parsed.data;
        const r = await callN8n(
          PATHS[channel],
          { ...lead, channel: lead.channel ?? channel },
          {
            user,
            action: "opener",
            channel,
            count: 1,
            leadIds: [lead.leadId],
          },
        );
        return toResponse(r);
      },
    },
  },
});
