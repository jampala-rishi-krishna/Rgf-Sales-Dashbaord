import { useQuery } from "@tanstack/react-query";

export interface LeadOwnerOption {
  id: string;
  name: string;
  email?: string;
}
export interface OwnersResponse {
  owners: LeadOwnerOption[];
  defaultOwnerId?: string;
}

export function useLeadOwners(enabled = true) {
  return useQuery<OwnersResponse>({
    queryKey: ["crm-owners"],
    queryFn: async () => {
      const r = await fetch("/api/crm/owners", { credentials: "include" });
      if (!r.ok) return { owners: [] };
      return (await r.json()) as OwnersResponse;
    },
    enabled,
    staleTime: 10 * 60_000,
    retry: false,
  });
}
