import { createFileRoute } from "@tanstack/react-router";
import { getSession, json } from "@/lib/session.server";
import {
  defaultOwnerId,
  ownersFromLeads,
  parseOwnersEnv,
  type LeadOwner,
} from "@/lib/owners.server";
import { getLeadsFeed, leadsSourceConfigured } from "@/lib/leads-feed.server";

export const Route = createFileRoute("/api/crm/owners")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const user = getSession(request);
        if (!user) return json({ ok: false, error: "Unauthorized" }, 401);
        let owners: LeadOwner[] = parseOwnersEnv(process.env.ZOHO_LEAD_OWNERS);
        if (!owners.length && leadsSourceConfigured()) {
          try {
            owners = ownersFromLeads((await getLeadsFeed()).leads ?? []);
          } catch (err) {
            console.warn("[owners] leads feed unavailable:", err);
          }
        }
        return json({ ok: true, owners, defaultOwnerId: defaultOwnerId(owners, user.email) });
      },
    },
  },
});
