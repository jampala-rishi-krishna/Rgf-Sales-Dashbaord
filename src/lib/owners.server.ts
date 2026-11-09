// Server-only Zoho Lead owner list for the Convert dialog.
import type { LeadRecord } from "@/lib/leads";

export interface LeadOwner {
  id: string;
  name: string;
  email?: string;
  default?: boolean;
}

/** Parses ZOHO_LEAD_OWNERS (JSON array). Invalid entries are dropped. */
export function parseOwnersEnv(value: string | undefined): LeadOwner[] {
  const v = value?.trim();
  if (!v) return [];
  try {
    const raw: unknown = JSON.parse(v);
    if (!Array.isArray(raw)) return [];
    return raw
      .filter(
        (o): o is LeadOwner =>
          !!o && typeof o.id === "string" && !!o.id && typeof o.name === "string",
      )
      .map((o) => ({
        id: o.id,
        name: o.name,
        email: typeof o.email === "string" ? o.email.toLowerCase() : undefined,
        default: o.default === true || undefined,
      }));
  } catch {
    console.error("[owners] ZOHO_LEAD_OWNERS is not valid JSON");
    return [];
  }
}

/** Distinct owners seen on Leads (Owner name + Owner_id). */
export function ownersFromLeads(leads: LeadRecord[]): LeadOwner[] {
  const map = new Map<string, LeadOwner>();
  for (const l of leads) {
    const id = typeof l.Owner_id === "string" ? l.Owner_id : "";
    const name = typeof l.Owner === "string" ? l.Owner : "";
    if (id && !map.has(id)) map.set(id, { id, name: name || id });
  }
  return [...map.values()].sort((a, b) => a.name.localeCompare(b.name));
}

/** The session user's own owner (by email), else the default (Sales Director). */
export function defaultOwnerId(owners: LeadOwner[], userEmail: string): string | undefined {
  const e = userEmail.trim().toLowerCase();
  return (
    owners.find((o) => o.email && o.email === e)?.id ??
    owners.find((o) => o.default)?.id ??
    owners.find((o) => /sales director/i.test(o.name))?.id
  );
}
