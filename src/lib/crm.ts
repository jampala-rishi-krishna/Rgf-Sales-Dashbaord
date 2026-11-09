// Shared CRM (Zoho Pre_Leads) types + pure helpers. Safe for client and server.
import { normalizePhPhone } from "@/lib/phone";

export type PreLead = {
  id: string;
  firstName: string;
  lastName: string;
  company: string;
  phone: string /* normalized +63 */;
  email?: string;
  products: string[];
  channel?: string;
  province?: string;
  city?: string;
  source?: string;
  website?: string;
  owner?: string;
  createdTime: string;
  modifiedTime: string;
  raw: Record<string, unknown>;
};

export type PreLeadsResponse = {
  connected: boolean;
  leads: PreLead[];
  fetchedAt?: string;
  source?: "n8n" | "zoho";
  error?: string;
};

/** Lightweight home-screen summary from /api/crm/pre-leads-count. */
export type PreLeadsCount = {
  connected: boolean;
  total: number;
  /** Created_Time of leads from the last ~15 days (for "today" + sparkline). */
  recent: string[];
  fetchedAt?: string;
  error?: string;
};

export const ZOHO_CRM_ORG_URL = "https://crm.zoho.com/crm/tab/Pre_Leads";
export function zohoRecordUrl(id: string) {
  return `${ZOHO_CRM_ORG_URL}/${encodeURIComponent(id)}`;
}

const str = (v: unknown): string | undefined => {
  if (v == null) return undefined;
  if (typeof v === "string") return v.trim() || undefined;
  if (typeof v === "number" || typeof v === "boolean") return String(v);
  if (typeof v === "object" && v && "name" in v) return str((v as { name: unknown }).name);
  return undefined;
};

function first(r: Record<string, unknown>, ...keys: string[]) {
  for (const k of keys) {
    const v = str(r[k]);
    if (v) return v;
  }
  return undefined;
}

function toProducts(v: unknown): string[] {
  if (Array.isArray(v)) return v.map((x) => str(x)).filter((x): x is string => !!x);
  const s = str(v);
  if (!s) return [];
  return s
    .split(/[;,]/)
    .map((x) => x.trim())
    .filter(Boolean);
}

/** Normalize a raw Zoho Pre_Leads record (or compact n8n row) into PreLead. */
export function normalizePreLead(r: Record<string, unknown>): PreLead {
  return {
    id: String(r.id ?? r.ID ?? r.leadId ?? ""),
    firstName: first(r, "First_Name", "firstName") ?? "",
    lastName: first(r, "Last_Name", "lastName") ?? "",
    company: first(r, "Name", "Company", "company", "companyName") ?? "",
    phone: normalizePhPhone(first(r, "Lead_Phone", "Phone", "Mobile", "phone")),
    email: first(r, "Email", "Lead_Email", "email")?.toLowerCase(),
    products: toProducts(r.Associated_Products ?? r.products),
    channel: first(r, "Channel", "channel"),
    province: first(r, "Province", "State", "province"),
    city: first(r, "City", "city"),
    source: first(r, "Lead_Source", "Source", "source"),
    website: first(r, "Website", "website"),
    owner: first(r, "Owner", "owner"),
    createdTime: first(r, "Created_Time", "createdTime") ?? "",
    modifiedTime: first(r, "Modified_Time", "modifiedTime") ?? "",
    raw: r,
  };
}

export function leadContactName(l: Pick<PreLead, "firstName" | "lastName">) {
  return [l.firstName, l.lastName].filter(Boolean).join(" ");
}
