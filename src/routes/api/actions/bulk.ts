import { createFileRoute } from "@tanstack/react-router";
import { json } from "@/lib/session.server";
import { callN8n, readJson, requireRole, toResponse } from "@/lib/n8n-actions.server";
import { BulkRequestSchema, MAX_BULK_LIMIT, buildBulkPayload } from "@/lib/bulk-payload";

export const Route = createFileRoute("/api/actions/bulk")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const user = requireRole(request, "admin");
        if (user instanceof Response) return user;
        // limit 0/missing = ALL eligible leads in n8n, so the schema requires 1..MAX.
        const parsed = BulkRequestSchema.safeParse(await readJson(request));
        if (!parsed.success)
          return json(
            {
              ok: false,
              error: `Invalid bulk request: limit must be a whole number 1–${MAX_BULK_LIMIT}, sortOrder asc|desc for WhatsApp/Email`,
            },
            400,
          );
        const { path, body, count } = buildBulkPayload(parsed.data);
        const r = await callN8n(path, body, {
          user,
          action: "bulk",
          channel: parsed.data.channel,
          count,
          exactBody: true,
        });
        return toResponse(r);
      },
    },
  },
});
