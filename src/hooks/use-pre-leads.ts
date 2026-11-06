import { useQuery } from "@tanstack/react-query";
import type { PreLeadsResponse } from "@/lib/crm";

export type { PreLead, PreLeadsResponse } from "@/lib/crm";

async function fetchPreLeads(): Promise<PreLeadsResponse> {
  const r = await fetch("/api/crm/pre-leads", { credentials: "include" });
  if (r.status === 404) return { connected: false, leads: [] };
  if (!r.ok) throw new Error(`/api/crm/pre-leads failed (${r.status})`);
  const d = (await r.json()) as Partial<PreLeadsResponse>;
  return {
    connected: d.connected !== false,
    leads: d.leads ?? [],
    fetchedAt: d.fetchedAt,
    source: d.source,
    error: d.error,
  };
}

/** All Zoho Pre_Leads (~8k), cached 5 min and shared across CRM / campaigns / home. */
export function usePreLeads() {
  return useQuery<PreLeadsResponse>({
    queryKey: ["pre-leads"],
    queryFn: fetchPreLeads,
    staleTime: 5 * 60_000,
    gcTime: 30 * 60_000,
    retry: 1,
  });
}
