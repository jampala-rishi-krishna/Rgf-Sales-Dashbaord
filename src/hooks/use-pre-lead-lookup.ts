import { useQuery } from "@tanstack/react-query";
import { emailKey, phoneKey } from "@/lib/conversion";
import type { LeadField } from "@/lib/leads";

export interface PreLeadLookup {
  ok: boolean;
  found: boolean;
  connected?: boolean;
  lead: Record<string, unknown> | null;
  zohoUrl?: string;
  fields?: LeadField[];
  error?: string;
}

/** The Zoho Pre-Lead behind a conversation (by id, else phone/email). Cached 5 min. */
export function usePreLeadLookup(
  who: { id?: string; phone?: string; email?: string },
  enabled = true,
) {
  const id = (who.id ?? "").replace(/\D/g, "");
  const phone = phoneKey(who.phone);
  const email = emailKey(who.email);
  return useQuery<PreLeadLookup>({
    queryKey: ["pre-lead-lookup", id, phone, email],
    enabled: enabled && !!(id || phone || email),
    staleTime: 5 * 60_000,
    gcTime: 30 * 60_000,
    retry: 1,
    queryFn: async () => {
      const qs = new URLSearchParams();
      if (id) qs.set("id", id);
      if (phone) qs.set("phone", phone);
      if (email) qs.set("email", email);
      const r = await fetch(`/api/crm/pre-lead-lookup?${qs}`, { credentials: "include" });
      const j = (await r.json().catch(() => null)) as PreLeadLookup | null;
      if (!j) throw new Error(`Pre-Lead lookup failed (${r.status})`);
      return { ...j, lead: j.lead ?? null };
    },
  });
}
