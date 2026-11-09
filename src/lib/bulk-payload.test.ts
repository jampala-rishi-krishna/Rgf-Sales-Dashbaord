import { describe, expect, it } from "vitest";
import { BulkRequestSchema, buildBulkPayload } from "./bulk-payload";

describe("bulk limit guard (0/missing = ALL eligible in n8n)", () => {
  for (const channel of ["whatsapp", "email", "sms", "viber"] as const) {
    const extra = channel === "whatsapp" || channel === "email" ? { sortOrder: "asc" } : {};
    it(`${channel}: rejects limit 0`, () => {
      expect(BulkRequestSchema.safeParse({ channel, limit: 0, ...extra }).success).toBe(false);
    });
    it(`${channel}: rejects missing limit`, () => {
      expect(BulkRequestSchema.safeParse({ channel, ...extra }).success).toBe(false);
    });
    it(`${channel}: rejects negative, fractional and string limits`, () => {
      for (const limit of [-1, 1.5, "10", "", null]) {
        expect(BulkRequestSchema.safeParse({ channel, limit, ...extra }).success).toBe(false);
      }
    });
    it(`${channel}: accepts limit 1`, () => {
      expect(BulkRequestSchema.safeParse({ channel, limit: 1, ...extra }).success).toBe(true);
    });
  }
});

describe("bulk payload shapes", () => {
  it("whatsapp sends { limit, sort_order } with asc/desc", () => {
    const req = BulkRequestSchema.parse({
      channel: "whatsapp",
      limit: 10,
      sortOrder: "desc",
      runId: "r1",
    });
    expect(buildBulkPayload(req)).toEqual({
      path: "/whatsapp-bulk-trigger",
      body: { limit: 10, sort_order: "desc" },
      count: 10,
    });
  });
  it("email sends { limit, sort_order }", () => {
    const req = BulkRequestSchema.parse({ channel: "email", limit: 5, sortOrder: "asc" });
    expect(buildBulkPayload(req).body).toEqual({ limit: 5, sort_order: "asc" });
  });
  it("rejects the old 'newest'/'oldest' values and a missing sort order", () => {
    expect(
      BulkRequestSchema.safeParse({ channel: "whatsapp", limit: 5, sortOrder: "newest" }).success,
    ).toBe(false);
    expect(BulkRequestSchema.safeParse({ channel: "email", limit: 5 }).success).toBe(false);
  });
  it("voice sends { limit, sortOrder, skipContacted } to the voice campaign", () => {
    const req = BulkRequestSchema.parse({ channel: "voice_batch", limit: 5 });
    expect(buildBulkPayload(req)).toEqual({
      path: "/dashboard-voice-campaign",
      body: { limit: 5, sortOrder: "desc", skipContacted: true },
      count: 5,
    });
    const r2 = BulkRequestSchema.parse({
      channel: "voice_batch",
      limit: 2,
      sortOrder: "asc",
      skipContacted: false,
    });
    expect(buildBulkPayload(r2).body).toEqual({ limit: 2, sortOrder: "asc", skipContacted: false });
    expect(BulkRequestSchema.safeParse({ channel: "voice_batch", limit: 51 }).success).toBe(false);
    expect(BulkRequestSchema.safeParse({ channel: "voice_batch" }).success).toBe(false);
  });
  it("sms and viber send { limit } only", () => {
    for (const channel of ["sms", "viber"] as const) {
      const req = BulkRequestSchema.parse({ channel, limit: 7, runId: "r1" });
      expect(buildBulkPayload(req).body).toEqual({ limit: 7 });
    }
  });
});
