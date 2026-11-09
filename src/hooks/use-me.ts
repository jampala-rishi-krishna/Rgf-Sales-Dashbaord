import { useQuery } from "@tanstack/react-query";

export type Role = "viewer" | "agent" | "admin";
export interface MeUser {
  email: string;
  name: string;
  role: Role;
}
export interface MeFlags {
  emailSend: boolean;
  manualReply: boolean;
  singleCall: boolean;
  campaignRuns: boolean;
  agentEvents: boolean;
  crm: boolean;
  googleSso: boolean;
  leadConversion: boolean;
  leadsTab: boolean;
}
export interface MeResponse {
  user: MeUser | null;
  flags: MeFlags;
  dryRun: boolean;
}

export const DEFAULT_FLAGS: MeFlags = {
  emailSend: false,
  manualReply: false,
  singleCall: false,
  campaignRuns: false,
  agentEvents: false,
  crm: false,
  googleSso: false,
  leadConversion: false,
  leadsTab: false,
};

export async function fetchMe(): Promise<MeResponse> {
  const r = await fetch("/api/auth/me", {
    credentials: "include",
    headers: { Accept: "application/json" },
  });
  if (r.status === 401) {
    // Signed out: still read the public flags (e.g. googleSso for the login page).
    const j = (await r.json().catch(() => ({}))) as Partial<MeResponse>;
    return { user: null, flags: { ...DEFAULT_FLAGS, ...(j.flags ?? {}) }, dryRun: true };
  }
  if (!r.ok) throw new Error(`GET /api/auth/me failed (${r.status})`);
  const j = (await r.json()) as Partial<MeResponse>;
  return {
    user: j.user ?? null,
    flags: { ...DEFAULT_FLAGS, ...(j.flags ?? {}) },
    dryRun: j.dryRun ?? true,
  };
}

/** Current session user + feature flags + dry-run state. user is null when signed out. */
export function useMe() {
  return useQuery({ queryKey: ["me"], queryFn: fetchMe, staleTime: 60_000, retry: 1 });
}

const RANK: Record<Role, number> = { viewer: 0, agent: 1, admin: 2 };
export function canAct(role: Role | null | undefined, need: "agent" | "admin"): boolean {
  if (!role) return false;
  return RANK[role] >= RANK[need];
}
