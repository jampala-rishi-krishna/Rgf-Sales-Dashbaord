import { describe, expect, it } from "vitest";
import {
  channelFromLeadSource,
  conversionRateByChannel,
  joinLeads,
  leadsKpis,
  manilaWeekStart,
  median,
} from "./leads-join";
import { normalizeLeadsPayload } from "./leads-feed.server";
import type { LeadConversion, LeadRecord } from "./leads";

const leads: LeadRecord[] = [
  {
    id: "L1",
    First_Name: "Ana",
    Last_Name: "Cruz",
    Company: "Cruz Bakery",
    Phone: "0917 123 4567",
    Mobile: "",
    Email: "Ana@Cruz.PH",
    Lead_Source: "AI Agent - WhatsApp",
    Lead_Status: "Contacted",
    Owner: "Maria Santos",
    Created_Time: "2026-11-05T10:00:00+08:00",
    Modified_Time: "2026-11-06T09:00:00+08:00",
  },
  {
    id: "L2",
    First_Name: "Ben",
    Last_Name: "Lim",
    Company: "Lim Foods",
    Mobile: "+63 918 765 4321",
    Phone: "02 8123 4567",
    Lead_Source: "Trade Show",
    Lead_Status: "Pre-Qualified",
    Owner: "Jose Reyes",
    Created_Time: "2026-10-01T10:00:00+08:00",
  },
];

const conversions: LeadConversion[] = [
  {
    leadId: "L1",
    preLeadId: "P1",
    convertedAt: "2026-11-09T10:00:00+08:00",
    convertedBy: "rishi@rareglobalfood.com",
    repliedChannels: ["viber", "whatsapp"],
    firstContactAt: "2026-11-01T10:00:00+08:00",
    firstReplyAt: "2026-11-02T10:00:00+08:00",
  },
];

describe("joinLeads (leads ⇄ conversions)", () => {
  const rows = joinLeads(
    leads,
    conversions,
    new Map([["+639187654321", "2026-11-08T10:00:00+08:00"]]),
  );

  it("attaches the conversion and derives dashboard fields", () => {
    const a = rows[0];
    expect(a.conversion?.preLeadId).toBe("P1");
    expect(a.fromDashboard).toBe(true);
    expect(a.name).toBe("Ana Cruz");
    expect(a.phone).toBe("+639171234567");
    expect(a.email).toBe("ana@cruz.ph");
    expect(a.sourceChannel).toBe("viber"); // first replied channel wins over Lead_Source
    expect(a.becameLeadAt).toBe("2026-11-09T10:00:00+08:00");
    expect(a.daysToConvert).toBe(8);
    expect(a.convertedBy).toBe("rishi@rareglobalfood.com");
  });

  it("falls back to Zoho fields for leads not converted from the dashboard", () => {
    const b = rows[1];
    expect(b.fromDashboard).toBe(false);
    expect(b.phone).toBe("+639187654321"); // Mobile preferred
    expect(b.sourceChannel).toBeUndefined(); // "Trade Show" isn't a channel
    expect(b.becameLeadAt).toBe("2026-10-01T10:00:00+08:00");
    expect(b.daysToConvert).toBeUndefined();
    expect(b.lastActivityAt).toBe("2026-11-08T10:00:00+08:00"); // from feed activity
  });

  it("keeps the latest conversion when a lead was converted twice", () => {
    const twice = joinLeads(leads.slice(0, 1), [
      { ...conversions[0], convertedAt: "2026-11-01T00:00:00Z", convertedBy: "old" },
      conversions[0],
    ]);
    expect(twice[0].convertedBy).toBe("rishi@rareglobalfood.com");
  });
});

describe("helpers", () => {
  it("parses channel from Lead_Source", () => {
    expect(channelFromLeadSource("AI Agent - WhatsApp")).toBe("whatsapp");
    expect(channelFromLeadSource("AI Agent - Website")).toBe("web");
    expect(channelFromLeadSource("AI Agent - Voice")).toBe("voice");
    expect(channelFromLeadSource("AI Agent - SMS")).toBe("sms");
    expect(channelFromLeadSource("Cold Call")).toBe("voice");
    expect(channelFromLeadSource("Referral")).toBeUndefined();
  });

  it("computes the Manila week start (Monday 00:00 +08:00)", () => {
    // Sunday 2026-11-08 23:30 Manila → week started Monday 2026-11-02 00:00 Manila.
    const sunday = Date.parse("2026-11-08T23:30:00+08:00");
    expect(manilaWeekStart(sunday)).toBe(Date.parse("2026-11-02T00:00:00+08:00"));
    // Monday 00:10 Manila is Sunday 16:10 UTC — still the new week.
    const monday = Date.parse("2026-11-09T00:10:00+08:00");
    expect(manilaWeekStart(monday)).toBe(Date.parse("2026-11-09T00:00:00+08:00"));
  });

  it("median handles odd, even and empty", () => {
    expect(median([3, 1, 2])).toBe(2);
    expect(median([4, 1, 2, 3])).toBe(2.5);
    expect(median([])).toBeUndefined();
  });

  it("KPIs", () => {
    const k = leadsKpis(joinLeads(leads, conversions), Date.parse("2026-11-10T12:00:00+08:00"));
    expect(k).toEqual({
      total: 2,
      convertedThisWeek: 1,
      fromDashboardAllTime: 1,
      medianDaysToConvert: 8,
    });
  });

  it("conversion rate by channel counts each replied channel", () => {
    const rates = conversionRateByChannel({ whatsapp: 4, viber: 0 }, conversions);
    const wa = rates.find((r) => r.channel === "whatsapp")!;
    const vb = rates.find((r) => r.channel === "viber")!;
    const sms = rates.find((r) => r.channel === "sms")!;
    expect(wa).toMatchObject({ eligible: 4, converted: 1, rate: 0.25 });
    expect(vb).toMatchObject({ eligible: 1, converted: 1, rate: 1 }); // never below converted
    expect(sms).toMatchObject({ eligible: 0, converted: 0, rate: 0 });
  });
});

describe("normalizeLeadsPayload (n8n /dashboard-leads)", () => {
  it("flattens lookups and filters invalid conversions", () => {
    const out = normalizeLeadsPayload({
      ok: true,
      count: 1,
      fetchedAt: "2026-11-09T00:00:00Z",
      fields: [{ apiName: "Lead_Status", label: "Lead Status", type: "picklist" }, { bad: 1 }],
      leads: [
        { id: 123, Owner: { name: "Maria", id: "u1" }, Email: "X@Y.COM", Custom_Field: "keep" },
        { First_Name: "no id" },
      ],
      conversions: [
        {
          leadId: "123",
          preLeadId: "P9",
          convertedAt: "2026-11-09T00:00:00Z",
          repliedChannels: "sms;Viber;fax",
        },
        { leadId: "x" },
      ],
    })!;
    expect(out.connected).toBe(true);
    expect(out.leads).toHaveLength(1);
    expect(out.leads[0]).toMatchObject({
      id: "123",
      Owner: "Maria",
      Owner_id: "u1",
      Email: "x@y.com",
      Custom_Field: "keep",
    });
    expect(out.fields).toEqual([
      { apiName: "Lead_Status", label: "Lead Status", type: "picklist" },
    ]);
    expect(out.conversions).toEqual([
      expect.objectContaining({ leadId: "123", repliedChannels: ["sms", "viber"] }),
    ]);
  });

  it("accepts a bare array and rejects junk", () => {
    expect(normalizeLeadsPayload([{ id: "a" }])?.leads).toHaveLength(1);
    expect(normalizeLeadsPayload({ nope: true })).toBeNull();
    expect(normalizeLeadsPayload(null)).toBeNull();
  });
});
