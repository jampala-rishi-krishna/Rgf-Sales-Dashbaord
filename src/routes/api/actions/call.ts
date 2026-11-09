import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { json } from "@/lib/session.server";
import { getFlags } from "@/lib/flags.server";
import { callN8n, readJson, requireRole, toResponse } from "@/lib/n8n-actions.server";

const Body = z.object({
  leadId: z.string().max(64).default(""),
  phone: z.string().min(5).max(32),
  companyName: z.string().max(300).default(""),
  leadName: z.string().max(200).default(""),
  product: z.string().max(300).default(""),
  channel: z.string().max(64).default("voice"),
});

export const Route = createFileRoute("/api/actions/call")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const user = requireRole(request, "agent");
        if (user instanceof Response) return user;
        if (!getFlags().singleCall)
          return json({ ok: false, error: "Backend not connected yet" }, 403);
        const parsed = Body.safeParse(await readJson(request));
        if (!parsed.success) return json({ ok: false, error: "Invalid call request" }, 400);
        const r = await callN8n("/dashboard-single-call", parsed.data, {
          user,
          action: "single_call",
          channel: "voice",
          count: 1,
          leadIds: parsed.data.leadId ? [parsed.data.leadId] : [],
        });
        return toResponse(r);
      },
    },
  },
});
