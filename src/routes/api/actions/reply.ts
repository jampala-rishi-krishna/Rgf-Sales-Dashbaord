import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { json } from "@/lib/session.server";
import { getFlags } from "@/lib/flags.server";
import { callN8n, readJson, requireRole, toResponse } from "@/lib/n8n-actions.server";

const Body = z
  .object({
    channel: z.enum(["whatsapp", "sms", "viber", "web"]),
    phone: z.string().min(5).max(32).optional(),
    sessionId: z.string().min(1).max(128).optional(),
    text: z.string().trim().min(1).max(4000),
  })
  .refine((b) => !!b.phone || !!b.sessionId, { message: "phone or sessionId required" });

export const Route = createFileRoute("/api/actions/reply")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const user = requireRole(request, "agent");
        if (user instanceof Response) return user;
        if (!getFlags().manualReply)
          return json({ ok: false, error: "Backend not connected yet" }, 403);
        const parsed = Body.safeParse(await readJson(request));
        if (!parsed.success) return json({ ok: false, error: "Invalid reply request" }, 400);
        const r = await callN8n(
          "/dashboard-manual-reply",
          { ...parsed.data, agentName: user.name },
          {
            user,
            action: "manual_reply",
            channel: parsed.data.channel,
            count: 1,
          },
        );
        return toResponse(r);
      },
    },
  },
});
