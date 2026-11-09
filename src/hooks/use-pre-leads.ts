import { useQuery } from "@tanstack/react-query";
import type { PreLeadsCount, PreLeadsResponse } from "@/lib/crm";

export type { PreLead, PreLeadsCount, PreLeadsResponse } from "@/lib/crm";

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

async function fetchPreLeadsCount(): Promise<PreLeadsCount> {
  const r = await fetch("/api/crm/pre-leads-count", { credentials: "include" });
  if (r.status === 404) return { connected: false, total: 0, recent: [] };
  if (!r.ok) throw new Error(`/api/crm/pre-leads-count failed (${r.status})`);
  const d = (await r.json()) as Partial<PreLeadsCount>;
  return {
    connected: d.connected !== false,
    total: d.total ?? 0,
    recent: d.recent ?? [],
    fetchedAt: d.fetchedAt,
    error: d.error,
  };
}

/** Pre-Leads total + recent created times only (tiny payload) — for the home screen. */
export function usePreLeadsCount() {
  return useQuery<PreLeadsCount>({
    queryKey: ["pre-leads-count"],
    queryFn: fetchPreLeadsCount,
    staleTime: 5 * 60_000,
    refetchInterval: 5 * 60_000,
    gcTime: 30 * 60_000,
    retry: 1,
  });
}

/** All Zoho Pre_Leads (~8k), cached 5 min. Heavy — only the Campaigns page uses it. */
export function usePreLeads() {
  return useQuery<PreLeadsResponse>({
    queryKey: ["pre-leads"],
    queryFn: fetchPreLeads,
    staleTime: 5 * 60_000,
    gcTime: 30 * 60_000,
    retry: 1,
  });
}
