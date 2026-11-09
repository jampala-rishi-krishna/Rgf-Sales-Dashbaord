// /leads URL search params ⇄ filter state, filtering/sorting, and CSV export. Pure.
import { CONVERT_CHANNELS, type ConvertChannel } from "@/lib/conversion";
import type { JoinedLead } from "@/lib/leads-join";

export type LeadsView = "all" | "ready";
export type SortDir = "asc" | "desc";

/** Filter state as it lives in the URL. Defaults are omitted (undefined). */
export interface LeadsSearch {
  q?: string;
  status?: string[];
  owner?: string[];
  channel?: ConvertChannel[];
  /** Became-Lead date range, inclusive, YYYY-MM-DD in Asia/Manila. */
  from?: string;
  to?: string;
  /** Converted from the dashboard only. */
  dash?: boolean;
  sort?: string;
  dir?: SortDir;
  view?: LeadsView;
  /** Selected lead (detail drawer). */
  id?: string;
}

export const SORT_KEYS = [
  "lead",
  "phone",
  "email",
  "channel",
  "product",
  "status",
  "owner",
  "firstContact",
  "firstReply",
  "becameLead",
  "days",
  "lastActivity",
  "convertedBy",
] as const;
export const DEFAULT_SORT = "becameLead";
export const DEFAULT_DIR: SortDir = "desc";

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const str = (v: unknown) =>
  typeof v === "string" ? v.trim() : typeof v === "number" ? String(v) : "";

/** Accepts "a,b", ["a","b"] or a JSON-encoded array. */
function list(v: unknown): string[] {
  let raw: unknown[] = [];
  if (Array.isArray(v)) raw = v;
  else if (typeof v === "string") {
    const s = v.trim();
    if (s.startsWith("[")) {
      try {
        const j: unknown = JSON.parse(s);
        if (Array.isArray(j)) raw = j;
      } catch {
        raw = s.split(",");
      }
    } else raw = s.split(",");
  }
  return Array.from(new Set(raw.map(str).filter(Boolean)));
}

const nonEmpty = <T>(xs: T[]) => (xs.length ? xs : undefined);

/** validateSearch for /leads: tolerant parse of untrusted URL params. */
export function parseLeadsSearch(s: Record<string, unknown>): LeadsSearch {
  const out: LeadsSearch = {};
  const q = str(s.q).slice(0, 200);
  if (q) out.q = q;
  out.status = nonEmpty(list(s.status).slice(0, 20));
  out.owner = nonEmpty(list(s.owner).slice(0, 50));
  out.channel = nonEmpty(
    list(s.channel).filter((c): c is ConvertChannel => (CONVERT_CHANNELS as string[]).includes(c)),
  );
  const from = str(s.from);
  const to = str(s.to);
  if (DATE_RE.test(from)) out.from = from;
  if (DATE_RE.test(to)) out.to = to;
  if (s.dash === true || s.dash === "true" || s.dash === "1" || s.dash === 1) out.dash = true;
  const sort = str(s.sort);
  if ((SORT_KEYS as readonly string[]).includes(sort) && sort !== DEFAULT_SORT) out.sort = sort;
  const dir = str(s.dir);
  if ((dir === "asc" || dir === "desc") && dir !== DEFAULT_DIR) out.dir = dir;
  if (str(s.view) === "ready") out.view = "ready";
  const id = str(s.id).slice(0, 64);
  if (id) out.id = id;
  for (const k of Object.keys(out) as (keyof LeadsSearch)[])
    if (out[k] === undefined) delete out[k];
  return out;
}

/** Flat string params (lists comma-joined); defaults dropped. */
export function serializeLeadsSearch(s: LeadsSearch): Record<string, string> {
  const out: Record<string, string> = {};
  if (s.q) out.q = s.q;
  if (s.status?.length) out.status = s.status.join(",");
  if (s.owner?.length) out.owner = s.owner.join(",");
  if (s.channel?.length) out.channel = s.channel.join(",");
  if (s.from) out.from = s.from;
  if (s.to) out.to = s.to;
  if (s.dash) out.dash = "1";
  if (s.sort && s.sort !== DEFAULT_SORT) out.sort = s.sort;
  if (s.dir && s.dir !== DEFAULT_DIR) out.dir = s.dir;
  if (s.view === "ready") out.view = "ready";
  if (s.id) out.id = s.id;
  return out;
}

export function hasActiveFilters(s: LeadsSearch): boolean {
  return !!(
    s.q ||
    s.status?.length ||
    s.owner?.length ||
    s.channel?.length ||
    s.from ||
    s.to ||
    s.dash
  );
}

/** Manila calendar day (YYYY-MM-DD) of a timestamp. */
export function manilaDay(ts?: string): string {
  if (!ts) return "";
  const t = Date.parse(ts);
  if (!Number.isFinite(t)) return "";
  return new Date(t + 8 * 3_600_000).toISOString().slice(0, 10);
}

export function filterLeads(rows: JoinedLead[], s: LeadsSearch): JoinedLead[] {
  const q = s.q?.toLowerCase();
  // "0917…" / "63917…" / "+63 917…" all match the stored +63917… form.
  const digits = s.q?.replace(/\D/g, "").replace(/^(63|0)/, "");
  return rows.filter((r) => {
    if (s.dash && !r.fromDashboard) return false;
    if (s.status?.length && !s.status.includes(r.status)) return false;
    if (s.owner?.length && !s.owner.includes(r.owner)) return false;
    if (s.channel?.length && !(r.sourceChannel && s.channel.includes(r.sourceChannel)))
      return false;
    if (s.from || s.to) {
      const d = manilaDay(r.becameLeadAt);
      if (!d) return false;
      if (s.from && d < s.from) return false;
      if (s.to && d > s.to) return false;
    }
    if (q) {
      const hay = [r.name, r.company, r.email, r.product, r.owner, r.status, r.convertedBy]
        .join(" ")
        .toLowerCase();
      const phoneHit =
        !!digits && digits.length >= 4 && r.phone.replace(/\D/g, "").includes(digits);
      if (!hay.includes(q) && !phoneHit) return false;
    }
    return true;
  });
}

const tsVal = (ts?: string) => {
  const t = ts ? Date.parse(ts) : NaN;
  return Number.isFinite(t) ? t : undefined;
};

export function sortValue(r: JoinedLead, key: string): string | number | undefined {
  switch (key) {
    case "lead":
      return (r.name || r.company).toLowerCase() || undefined;
    case "phone":
      return r.phone || undefined;
    case "email":
      return r.email || undefined;
    case "channel":
      return r.sourceChannel;
    case "product":
      return r.product.toLowerCase() || undefined;
    case "status":
      return r.status || undefined;
    case "owner":
      return r.owner || undefined;
    case "firstContact":
      return tsVal(r.firstContactAt);
    case "firstReply":
      return tsVal(r.firstReplyAt);
    case "becameLead":
      return tsVal(r.becameLeadAt);
    case "days":
      return r.daysToConvert;
    case "lastActivity":
      return tsVal(r.lastActivityAt);
    case "convertedBy":
      return r.convertedBy || undefined;
    default:
      return undefined;
  }
}

/** Stable sort; empty values always last regardless of direction. */
export function sortLeads(rows: JoinedLead[], key = DEFAULT_SORT, dir = DEFAULT_DIR) {
  const sign = dir === "asc" ? 1 : -1;
  return rows
    .map((r, i) => ({ r, i, v: sortValue(r, key) }))
    .sort((a, b) => {
      if (a.v === undefined && b.v === undefined) return a.i - b.i;
      if (a.v === undefined) return 1;
      if (b.v === undefined) return -1;
      const c =
        typeof a.v === "number" && typeof b.v === "number"
          ? a.v - b.v
          : String(a.v).localeCompare(String(b.v));
      return c ? c * sign : a.i - b.i;
    })
    .map((x) => x.r);
}

// ── CSV ───────────────────────────────────────────────────────────────────
export function csvCell(v: unknown): string {
  const s = v == null ? "" : String(v);
  // Neutralize spreadsheet formulas from untrusted values.
  const safe = /^[=+\-@\t\r]/.test(s) ? `'${s}` : s;
  return /[",\n\r]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
}

export function toCsv(headers: string[], rows: unknown[][]): string {
  return [headers, ...rows].map((r) => r.map(csvCell).join(",")).join("\r\n");
}

export const LEADS_CSV_HEADERS = [
  "Lead ID",
  "Name",
  "Company",
  "Phone",
  "Email",
  "Source channel",
  "Product",
  "Status",
  "Owner",
  "First contacted",
  "First reply",
  "Became Lead",
  "Days to convert",
  "Last activity",
  "Converted by",
  "Converted from dashboard",
];

export function leadsCsv(rows: JoinedLead[]): string {
  return toCsv(
    LEADS_CSV_HEADERS,
    rows.map((r) => [
      r.id,
      r.name,
      r.company,
      r.phone,
      r.email,
      r.sourceChannel ?? "",
      r.product,
      r.status,
      r.owner,
      r.firstContactAt ?? "",
      r.firstReplyAt ?? "",
      r.becameLeadAt ?? "",
      r.daysToConvert ?? "",
      r.lastActivityAt ?? "",
      r.convertedBy ?? "",
      r.fromDashboard ? "Yes" : "No",
    ]),
  );
}

/** Triggers a browser download of `csv` (BOM so Excel reads UTF-8). */
export function downloadCsv(filename: string, csv: string) {
  const blob = new Blob(["﻿", csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
