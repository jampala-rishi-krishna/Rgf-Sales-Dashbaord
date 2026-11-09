import { createFileRoute } from "@tanstack/react-router";
import { json } from "@/lib/session.server";
import { getN8n } from "@/lib/n8n-actions.server";

// One Zoho Pre-Lead by email / phone / id, via n8n GET /dashboard-pre-lead-lookup (fast search,
// not the full ~8k feed). Used by the lead side panels on the conversation tabs.
export const Route = createFileRoute("/api/crm/pre-lead-lookup")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const url = new URL(request.url);
        const email = (url.searchParams.get("email") ?? "").trim().toLowerCase().slice(0, 200);
        const phone = (url.searchParams.get("phone") ?? "").replace(/[^\d+]/g, "").slice(0, 20);
        const id = (url.searchParams.get("id") ?? "").replace(/\D/g, "").slice(0, 30);
        if (!email && !phone && !id)
          return json({ ok: false, found: false, error: "email, phone or id is required" }, 400);
        const qs = new URLSearchParams();
        if (id) qs.set("id", id);
        else {
          if (email) qs.set("email", email);
          if (phone) qs.set("phone", phone);
        }
        const r = await getN8n(`/dashboard-pre-lead-lookup?${qs}`);
        if (!r.ok)
          return json(
            { ok: false, found: false, connected: r.status !== 404, error: r.error },
            r.status === 404 ? 200 : 502,
          );
        return json(r.data);
      },
    },
  },
});
