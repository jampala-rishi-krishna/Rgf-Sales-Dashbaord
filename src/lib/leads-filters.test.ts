import { describe, expect, it } from "vitest";
import {
  csvCell,
  filterLeads,
  leadsCsv,
  manilaDay,
  parseLeadsSearch,
  serializeLeadsSearch,
  sortLeads,
  type LeadsSearch,
} from "./leads-filters";
import type { JoinedLead } from "./leads-join";

const row = (p: Partial<JoinedLead>): JoinedLead => ({
  id: "x",
  lead: { id: "x" },
  name: "",
  company: "",
  phone: "",
  email: "",
  product: "",
  status: "",
  owner: "",
  fromDashboard: false,
  ...p,
});

describe("URL filter round-trip", () => {
  const full: LeadsSearch = {
    q: "cruz bakery",
    status: ["Contacted", "Pre-Qualified"],
    owner: ["Maria Santos"],
    channel: ["whatsapp", "viber"],
    from: "2026-11-01",
    to: "2026-11-09",
    dash: true,
    sort: "days",
    dir: "asc",
    view: "ready",
    id: "L1",
  };

  it("parse(serialize(state)) === state", () => {
    expect(parseLeadsSearch(serializeLeadsSearch(full))).toEqual(full);
    expect(parseLeadsSearch(serializeLeadsSearch({}))).toEqual({});
  });

  it("drops defaults when serializing", () => {
    expect(
      serializeLeadsSearch({ sort: "becameLead", dir: "desc", view: "all", status: [] }),
    ).toEqual({});
  });

  it("is tolerant of hand-edited or router-encoded URLs", () => {
    expect(
      parseLeadsSearch({
        status: ["Contacted", "Contacted"],
        channel: '["sms","fax"]',
        from: "11/01/2026",
        dash: "true",
        sort: "evil",
        dir: "sideways",
        view: "kanban",
        q: "  ",
      }),
    ).toEqual({ status: ["Contacted"], channel: ["sms"], dash: true });
  });
});

describe("filterLeads / sortLeads", () => {
  const rows = [
    row({
      id: "a",
      name: "Ana Cruz",
      company: "Cruz Bakery",
      phone: "+639171234567",
      status: "Contacted",
      owner: "Maria",
      sourceChannel: "whatsapp",
      fromDashboard: true,
      becameLeadAt: "2026-11-08T20:00:00Z", // 2026-11-09 in Manila
      daysToConvert: 3,
    }),
    row({
      id: "b",
      name: "Ben Lim",
      company: "Lim Foods",
      status: "Pre-Qualified",
      owner: "Jose",
      becameLeadAt: "2026-10-01T02:00:00Z",
    }),
  ];

  it("filters by every facet", () => {
    expect(filterLeads(rows, { q: "cruz" }).map((r) => r.id)).toEqual(["a"]);
    expect(filterLeads(rows, { q: "0917 1234" }).map((r) => r.id)).toEqual(["a"]);
    expect(filterLeads(rows, { status: ["Pre-Qualified"] }).map((r) => r.id)).toEqual(["b"]);
    expect(filterLeads(rows, { owner: ["Maria"] }).map((r) => r.id)).toEqual(["a"]);
    expect(filterLeads(rows, { channel: ["whatsapp"] }).map((r) => r.id)).toEqual(["a"]);
    expect(filterLeads(rows, { dash: true }).map((r) => r.id)).toEqual(["a"]);
    expect(filterLeads(rows, { from: "2026-11-09" }).map((r) => r.id)).toEqual(["a"]);
    expect(filterLeads(rows, { to: "2026-11-08" }).map((r) => r.id)).toEqual(["b"]);
  });

  it("uses Manila days for the date range", () => {
    expect(manilaDay("2026-11-08T20:00:00Z")).toBe("2026-11-09");
  });

  it("sorts with empty values last in both directions", () => {
    expect(sortLeads(rows, "days", "asc").map((r) => r.id)).toEqual(["a", "b"]);
    expect(sortLeads(rows, "days", "desc").map((r) => r.id)).toEqual(["a", "b"]);
    expect(sortLeads(rows, "becameLead", "asc").map((r) => r.id)).toEqual(["b", "a"]);
  });
});

describe("CSV", () => {
  it("escapes quotes, commas, newlines and formula prefixes", () => {
    expect(csvCell('He said "hi", ok')).toBe('"He said ""hi"", ok"');
    expect(csvCell("a\nb")).toBe('"a\nb"');
    expect(csvCell("=HYPERLINK(1)")).toBe("'=HYPERLINK(1)");
    expect(csvCell(undefined)).toBe("");
  });

  it("exports one row per lead with a header", () => {
    const csv = leadsCsv([row({ id: "a", name: "Ana, Jr." })]);
    const lines = csv.split("\r\n");
    expect(lines).toHaveLength(2);
    expect(lines[0]).toMatch(/^Lead ID,Name,Company/);
    expect(lines[1]).toMatch(/^a,"Ana, Jr\.",/);
  });
});
