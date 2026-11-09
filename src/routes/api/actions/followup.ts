import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { json } from "@/lib/session.server";
import { callN8n, readJson, requireRole } from "@/lib/n8n-actions.server";

// Calls tab follow-up: n8n sends a follow-up into the lead's existing SMS/WhatsApp/Viber
// conversation (or Martin's opener when there is none) and posts the result to RGF Scout.
const Body = z.object({
  channel: z.enum(["sms", "whatsapp", "viber"]),
  phone: z.string().min(5).max(32),
  leadId: z.string().max(64).default(""),
  leadName: z.string().max(200).default(""),
  companyName: z.string().max(300).default(""),
  product: z.string().max(300).default(""),
  callId: z.string().max(80).default(""),
  callOutcome: z.string().max(40).default(""),
  callAt: z.string().max(40).default(""),
});

type N8nFollowup = { ok?: boolean; result?: string; detail?: string; error?: string };

export const Route = createFileRoute("/api/actions/followup")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const user = requireRole(request, "agent");
        if (user instanceof Response) return user;
        const parsed = Body.safeParse(await readJson(request));
        if (!parsed.success)
          return json(
            { ok: false, error: `Invalid follow-up: ${parsed.error.issues[0]?.path.join(".")}` },
            400,
          );
        const r = await callN8n<N8nFollowup>(
          "/dashboard-call-followup",
          { ...parsed.data, agentName: user.name },
          {
            user,
            action: "call_followup",
            channel: parsed.data.channel,
            count: 1,
            leadIds: parsed.data.leadId ? [parsed.data.leadId] : [],
          },
        );
        if (r.dryRun) return json({ ok: true, dryRun: true, data: { result: "dry-run" } });
        const d = (r.data ?? {}) as N8nFollowup;
        if (r.ok && d.ok !== false) return json({ ok: true, data: d });
        return json(
          { ok: false, error: d.error || d.detail || r.error || "Follow-up failed", data: d },
          r.status >= 400 ? r.status : 502,
        );
      },
    },
  },
});
