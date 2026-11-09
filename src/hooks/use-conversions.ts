// Converted-state for Pre-Leads: conversions from /api/crm/leads plus conversions made in
// this browser session (so badges flip immediately after a successful convert).
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback, useMemo } from "react";
import { emailKey, phoneKey, type LeadIdentity } from "@/lib/conversion";
import type { LeadConversion, LeadsResponse } from "@/lib/leads";
import { useMe } from "@/hooks/use-me";

export const LEADS_QUERY_KEY = ["crm-leads"] as const;
const LOCAL_KEY = ["crm-conversions-local"] as const;

export interface LocalConversion extends LeadConversion {
  phone?: string;
  email?: string;
}

const EMPTY: LeadsResponse = {
  ok: false,
  connected: false,
  count: 0,
  fields: [],
  leads: [],
  conversions: [],
};

export async function fetchLeads(): Promise<LeadsResponse> {
  const r = await fetch("/api/crm/leads", { credentials: "include" });
  if (r.status === 404) return EMPTY;
  const j = (await r.json().catch(() => null)) as Partial<LeadsResponse> | null;
  if (!r.ok && !j) throw new Error(`/api/crm/leads failed (${r.status})`);
  return { ...EMPTY, ...(j ?? {}) } as LeadsResponse;
}

/** Shared Leads feed (cached 5 min). Enabled only when a Leads/conversion flag is on. */
export function useLeads(enabled = true) {
  const me = useMe();
  const on = !!(me.data?.flags.leadsTab || me.data?.flags.leadConversion);
  return useQuery<LeadsResponse>({
    queryKey: LEADS_QUERY_KEY,
    queryFn: fetchLeads,
    enabled: enabled && on,
    staleTime: 5 * 60_000,
    gcTime: 30 * 60_000,
    retry: 1,
  });
}

/** Lookup: is this Pre-Lead already converted? Returns its conversion (with leadId) or undefined. */
export function useConversions() {
  const qc = useQueryClient();
  const leads = useLeads();
  const local = useQuery<LocalConversion[]>({
    queryKey: LOCAL_KEY,
    queryFn: () => qc.getQueryData<LocalConversion[]>(LOCAL_KEY) ?? [],
    initialData: [],
    staleTime: Infinity,
    gcTime: Infinity,
  });

  const index = useMemo(() => {
    const byKey = new Map<string, LeadConversion>();
    const leadById = new Map((leads.data?.leads ?? []).map((l) => [l.id, l]));
    const add = (c: LeadConversion, phone?: string, email?: string) => {
      if (c.preLeadId) byKey.set(`id:${c.preLeadId}`, c);
      const p = phoneKey(phone);
      const e = emailKey(email);
      if (p) byKey.set(`p:${p}`, c);
      if (e) byKey.set(`e:${e}`, c);
    };
    for (const c of leads.data?.conversions ?? []) {
      const l = leadById.get(c.leadId);
      add(c, (l?.Mobile as string) || l?.Phone, l?.Email);
      if (l?.Phone) add(c, l.Phone);
    }
    for (const c of local.data ?? []) add(c, c.phone, c.email);
    return byKey;
  }, [leads.data, local.data]);

  const find = useCallback(
    (lead: LeadIdentity): LeadConversion | undefined =>
      (lead.id && index.get(`id:${lead.id}`)) ||
      (phoneKey(lead.phone) && index.get(`p:${phoneKey(lead.phone)}`)) ||
      (emailKey(lead.email) && index.get(`e:${emailKey(lead.email)}`)) ||
      undefined,
    [index],
  );

  const markConverted = useCallback(
    (c: LocalConversion) => {
      qc.setQueryData<LocalConversion[]>(LOCAL_KEY, (prev) => [...(prev ?? []), c]);
      void qc.invalidateQueries({ queryKey: LEADS_QUERY_KEY });
    },
    [qc],
  );

  return { find, markConverted, isLoading: leads.isLoading };
}
