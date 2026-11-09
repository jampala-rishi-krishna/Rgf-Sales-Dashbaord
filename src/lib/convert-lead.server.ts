// Server-only handler for POST /api/actions/convert-lead (kept out of the route for tests).
import { z } from "zod";
import { CONVERT_CHANNELS } from "@/lib/conversion";
import { getFlags } from "@/lib/flags.server";
import { callN8n, readJson, requireRole } from "@/lib/n8n-actions.server";
import { json } from "@/lib/session.server";

const s = (max: number) => z.string().trim().max(max);
const ts = z.string().max(40).optional();

export const ConvertLeadBody = z.object({
  preLeadId: s(64).default(""),
  lead: z.object({
    firstName: s(100).default(""),
    lastName: s(100).min(1).catch("Unknown"),
    company: s(300).min(1),
    phone: s(32).default(""),
    email: z.union([z.literal(""), z.string().trim().email().max(200)]).default(""),
    product: s(500).default(""),
    channel: s(100).default(""),
    leadSource: s(100).default(""),
    leadStatus: s(60).default("Contacted"),
    ownerId: s(64).optional(),
    notes: s(2000).default(""),
  }),
  repliedChannels: z
    .array(z.enum(CONVERT_CHANNELS as [string, ...string[]]))
    .max(6)
    .default([]),
  firstContactAt: ts,
  firstReplyAt: ts,
  force: z.boolean().optional(),
});

type N8nConvertData = {
  ok?: boolean;
  leadId?: string;
  zohoUrl?: string;
  convertedAt?: string;
  duplicate?: boolean;
  existingLeadId?: string;
  existingZohoUrl?: string;
  matchedOn?: "phone" | "email";
  error?: string;
};

export async function handleConvertLead(request: Request): Promise<Response> {
  const user = requireRole(request, "agent");
  if (user instanceof Response) return user;
  if (!getFlags().leadConversion)
    return json({ ok: false, error: "Backend not connected yet" }, 403);
  const parsed = ConvertLeadBody.safeParse(await readJson(request));
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    return json(
      { ok: false, error: `Invalid convert request${issue ? `: ${issue.path.join(".")}` : ""}` },
      400,
    );
  }
  const body = parsed.data;
  if (!body.preLeadId && !body.lead.phone && !body.lead.email)
    return json({ ok: false, error: "A Pre-Lead id, phone or email is required" }, 400);

  const r = await callN8n<N8nConvertData>(
    "/dashboard-convert-lead",
    { ...body, convertedBy: user.email },
    {
      user,
      action: "convert_lead",
      channel: body.repliedChannels[0] ?? "crm",
      leadIds: body.preLeadId ? [body.preLeadId] : [],
      exactBody: true,
    },
  );
  const d = (r.data && typeof r.data === "object" ? r.data : {}) as N8nConvertData;
  const log = (leadId: string | undefined, outcome: string) =>
    console.log(
      "[convert-lead]",
      JSON.stringify({
        user: user.email,
        preLeadId: body.preLeadId,
        leadId: leadId ?? null,
        outcome,
        force: !!body.force,
        dryRun: r.dryRun,
      }),
    );

  if (r.dryRun) {
    log("dry-run", "dry_run");
    return json({
      ok: true,
      dryRun: true,
      leadId: "dry-run",
      convertedAt: new Date().toISOString(),
    });
  }
  if (r.ok && d.leadId) {
    log(d.leadId, "converted");
    return json({
      ok: true,
      leadId: d.leadId,
      zohoUrl: d.zohoUrl,
      convertedAt: d.convertedAt ?? new Date().toISOString(),
    });
  }
  if (d.duplicate) {
    log(d.existingLeadId, "duplicate");
    return json(
      {
        ok: false,
        duplicate: true,
        existingLeadId: d.existingLeadId ?? "",
        existingZohoUrl: d.existingZohoUrl,
        matchedOn: d.matchedOn,
      },
      409,
    );
  }
  const error = r.ok ? "n8n did not return a Lead id" : (r.error ?? "Convert failed");
  log(undefined, `error: ${error}`);
  return json({ ok: false, error }, r.ok ? 502 : r.status >= 400 ? r.status : 502);
}
