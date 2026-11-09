import { describe, expect, it } from "vitest";
import type { Conversation } from "@/lib/channels";
import { countRepliedSince } from "./use-campaign-runs";

const conv = (firstTs: string, roles: ("martin" | "customer")[]): Conversation =>
  ({
    phone: "+639170000000",
    leadName: "",
    companyName: "Acme",
    channel: "",
    conversationStage: "",
    brochureSent: false,
    priceSent: false,
    formSent: false,
    meetingScheduled: false,
    humanEscalated: false,
    discountAttempts: 0,
    lastUpdated: firstTs,
    lastMessageAt: firstTs,
    lastMessagePreview: "",
    messages: roles.map((role) => ({ role, content: "x", ts: firstTs })),
  }) as Conversation;

describe("countRepliedSince (View N replies on a campaign run)", () => {
  const since = Date.parse("2026-11-06T00:00:00Z");
  it("counts only real two-way replies started by the run", () => {
    const feed = [
      conv("2026-11-06T01:00:00Z", ["martin", "customer"]), // replied, in run
      conv("2026-11-06T02:00:00Z", ["martin"]), // opener only: sent, not replied
      conv("2026-11-05T23:00:00Z", ["martin", "customer"]), // replied, but before the run
    ];
    expect(countRepliedSince(feed, since)).toBe(1);
  });
  it("is 0 for an empty or missing feed", () => {
    expect(countRepliedSince([], since)).toBe(0);
    expect(countRepliedSince(undefined, since)).toBe(0);
  });
});
