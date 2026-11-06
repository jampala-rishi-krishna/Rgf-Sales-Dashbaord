import { z } from "zod";
import Papa from "papaparse";
import { leadContactName, type PreLead } from "@/lib/crm";
import {
  lookupOutreach,
  outreachSummary,
  type OutreachEntry,
  type OutreachIndex,
} from "@/hooks/use-outreach-index";

const yn = z.enum(["yes", "no"]).optional().catch(undefined);
const str = z.string().max(200).optional().catch(undefined);

export const crmSearchSchema = z.object({
  q: str,
  seg: str,
  prod: str,
  prov: str,
  /** "any" | "never" | a channel key */
  contacted: z
    .enum(["any", "never", "whatsapp", "sms", "viber", "email", "call", "web"])
    .optional()
    .catch(undefined),
  replied: yn,
  meeting: yn,
  from: str,
  to: str,
  view: str,
  lead: str,
});
export type CrmSearch = z.infer<typeof crmSearchSchema>;

export const SAVED_VIEWS: { id: string; label: string; search: Partial<CrmSearch> }[] = [
  { id: "never", label: "Never contacted", search: { contacted: "never" } },
  {
    id: "replied-no-meeting",
    label: "Replied no meeting",
    search: { replied: "yes", meeting: "no" },
  },
  { id: "industrial", label: "Industrial accounts", search: { seg: "industrial" } },
];

export type Stage = "New" | "Contacted" | "Replied" | "Meeting";
export const STAGE_ORDER: Record<Stage, number> = { New: 0, Contacted: 1, Replied: 2, Meeting: 3 };

export type CrmRow = {
  lead: PreLead;
  outreach: OutreachEntry;
  contacted: boolean;
  replied: boolean;
  meeting: boolean;
  stage: Stage;
  contact: string;
  hay: string;
  digits: string;
};

export function buildRows(leads: PreLead[], index: OutreachIndex): CrmRow[] {
  return leads.map((lead) => {
    const outreach = lookupOutreach(index, lead);
    const s = outreachSummary(outreach);
    const contact = leadContactName(lead);
    return {
      lead,
      outreach,
      ...s,
      stage: s.meeting ? "Meeting" : s.replied ? "Replied" : s.contacted ? "Contacted" : "New",
      contact,
      hay: `${lead.company} ${contact} ${lead.email ?? ""} ${lead.phone}`.toLowerCase(),
      digits: lead.phone.replace(/\D/g, ""),
    };
  });
}

/** Simple fuzzy: every token must be a substring; digit-only tokens also match phone digits (with/without leading 0/63). */
function matches(row: CrmRow, tokens: string[]) {
  for (const t of tokens) {
    if (row.hay.includes(t)) continue;
    const d = t.replace(/\D/g, "").replace(/^(63|0)/, "");
    if (d.length >= 3 && d.length === t.replace(/[\s+()-]/g, "").length && row.digits.includes(d))
      continue;
    return false;
  }
  return true;
}

export function filterRows(rows: CrmRow[], s: CrmSearch): CrmRow[] {
  const tokens = (s.q ?? "").toLowerCase().split(/\s+/).filter(Boolean);
  const seg = s.seg?.toLowerCase();
  const prod = s.prod?.toLowerCase();
  const prov = s.prov?.toLowerCase();
  const from = s.from ? Date.parse(s.from) : NaN;
  const to = s.to ? Date.parse(s.to) + 86_400_000 : NaN;
  return rows.filter((r) => {
    const l = r.lead;
    if (seg && !(l.channel ?? "").toLowerCase().includes(seg)) return false;
    if (prod && !l.products.some((p) => p.toLowerCase() === prod)) return false;
    if (prov && (l.province ?? "").toLowerCase() !== prov) return false;
    if (s.contacted === "any" && !r.contacted) return false;
    if (s.contacted === "never" && r.contacted) return false;
    if (
      s.contacted &&
      s.contacted !== "any" &&
      s.contacted !== "never" &&
      !r.outreach[s.contacted]?.contacted
    )
      return false;
    if (s.replied && r.replied !== (s.replied === "yes")) return false;
    if (s.meeting && r.meeting !== (s.meeting === "yes")) return false;
    if (!Number.isNaN(from) || !Number.isNaN(to)) {
      const c = Date.parse(l.createdTime);
      if (!Number.isNaN(from) && !(c >= from)) return false;
      if (!Number.isNaN(to) && !(c < to)) return false;
    }
    if (tokens.length && !matches(r, tokens)) return false;
    return true;
  });
}

export function facetValues(leads: PreLead[]) {
  const seg = new Set<string>();
  const prod = new Set<string>();
  const prov = new Set<string>();
  for (const l of leads) {
    if (l.channel) seg.add(l.channel);
    for (const p of l.products) prod.add(p);
    if (l.province) prov.add(l.province);
  }
  const sort = (s: Set<string>) => [...s].sort((a, b) => a.localeCompare(b));
  return { seg: sort(seg), prod: sort(prod), prov: sort(prov) };
}

export function exportCsv(rows: CrmRow[], name = "pre-leads") {
  const csv = Papa.unparse(
    rows.map((r) => ({
      id: r.lead.id,
      company: r.lead.company,
      contact: r.contact,
      phone: r.lead.phone,
      email: r.lead.email ?? "",
      segment: r.lead.channel ?? "",
      products: r.lead.products.join("; "),
      province: r.lead.province ?? "",
      city: r.lead.city ?? "",
      source: r.lead.source ?? "",
      owner: r.lead.owner ?? "",
      stage: r.stage,
      contacted: r.contacted,
      replied: r.replied,
      meeting: r.meeting,
      created: r.lead.createdTime,
      modified: r.lead.modifiedTime,
    })),
  );
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${name}-${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function readLocal<T>(key: string, fallback: T): T {
  try {
    const v = localStorage.getItem(key);
    return v ? (JSON.parse(v) as T) : fallback;
  } catch {
    return fallback;
  }
}
export function writeLocal(key: string, v: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(v));
  } catch {
    /* ignore */
  }
}

export const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
