import { describe, expect, it } from "vitest";
import type { Conversation } from "@/lib/channels";
import type { VapiCall } from "@/components/calls/vapi";
import {
  buildLeadTimeline,
  conversationSummary,
  getConversionEligibility,
  splitName,
  type EmailThreadLite,
  type TimelineItem,
  type WebSessionLite,
} from "./conversion";

const PHONE = "+639171234567";
const lead = {
  id: "pl-1",
  phone: "09171234567",
  email: "Ana@CruzBakery.ph",
  companyName: "Cruz Bakery",
};

function conv(over: Partial<Conversation> & { messages: Conversation["messages"] }): Conversation {
  return {
    phone: PHONE,
    leadName: "Ana Cruz",
    companyName: "Cruz Bakery",
    channel: "Bakery",
    conversationStage: "opener",
    brochureSent: false,
    priceSent: false,
    formSent: false,
    meetingScheduled: false,
    humanEscalated: false,
    discountAttempts: 0,
    lastUpdated: "",
    lastMessageAt: "",
    lastMessagePreview: "",
    ...over,
  };
}
const opener = { role: "martin" as const, content: "Hi from RGF", ts: "2026-11-01T01:00:00.000Z" };
const reply = {
  role: "customer" as const,
  content: "Yes, send prices",
  ts: "2026-11-01T02:00:00.000Z",
};
const later = { role: "martin" as const, content: "Here you go", ts: "2026-11-02T03:00:00.000Z" };

describe("getConversionEligibility — WhatsApp / SMS / Viber", () => {
  for (const ch of ["whatsapp", "sms", "viber"] as const) {
    it(`${ch}: eligible after a customer reply to Martin's opener`, () => {
      const r = getConversionEligibility(lead, {
        [ch]: [conv({ messages: [opener, reply, later] })],
      });
      expect(r.eligible).toBe(true);
      expect(r.channels).toEqual([ch]);
      expect(r.firstContactAt).toBe(opener.ts);
      expect(r.firstReplyAt).toBe(reply.ts);
      expect(r.lastActivityAt).toBe(later.ts);
      expect(r.reason).toMatch(/^Replied on/);
    });
    it(`${ch}: not eligible with only the opener`, () => {
      const r = getConversionEligibility(lead, { [ch]: [conv({ messages: [opener] })] });
      expect(r.eligible).toBe(false);
      expect(r.channels).toEqual([]);
      expect(r.firstContactAt).toBe(opener.ts);
      expect(r.reason).toMatch(/no reply yet/);
    });
  }

  it("matches 09xx lead phones to +63 feed phones", () => {
    const r = getConversionEligibility(
      { phone: "0917 123 4567" },
      { whatsapp: [conv({ phone: "+63 917-123-4567", messages: [opener, reply] })] },
    );
    expect(r.eligible).toBe(true);
  });

  it("ignores other leads' conversations", () => {
    const r = getConversionEligibility(lead, {
      sms: [conv({ phone: "+639990000000", leadEmail: "x@y.com", messages: [opener, reply] })],
    });
    expect(r.eligible).toBe(false);
    expect(r.reason).toMatch(/No outreach/);
  });

  it("combines several channels, earliest first contact and reply", () => {
    const r = getConversionEligibility(lead, {
      whatsapp: [conv({ messages: [opener, reply] })],
      viber: [
        conv({
          messages: [
            { ...opener, ts: "2026-10-30T00:00:00.000Z" },
            { ...reply, ts: "2026-11-03T00:00:00.000Z" },
          ],
        }),
      ],
    });
    expect(r.channels).toEqual(["whatsapp", "viber"]);
    expect(r.firstContactAt).toBe("2026-10-30T00:00:00.000Z");
    expect(r.firstReplyAt).toBe(reply.ts);
    expect(r.lastActivityAt).toBe("2026-11-03T00:00:00.000Z");
  });
});

describe("getConversionEligibility — test companies", () => {
  it("excludes a test-company lead even when it replied", () => {
    const r = getConversionEligibility(
      { ...lead, companyName: "Test Dummy Company - 7" },
      { whatsapp: [conv({ messages: [opener, reply] })] },
    );
    expect(r.eligible).toBe(false);
    expect(r.reason).toMatch(/Test company/);
  });
  it("ignores test-company conversations in the feeds", () => {
    const r = getConversionEligibility(lead, {
      whatsapp: [conv({ companyName: "Test Dummy Company - 1", messages: [opener, reply] })],
    });
    expect(r.eligible).toBe(false);
  });
});

describe("getConversionEligibility — email", () => {
  const out: EmailThreadLite = {
    threadId: "t1",
    from: "Martin <martin@rareglobalfood.com>",
    to: "ana@cruzbakery.ph",
    date: "2026-11-01T00:00:00.000Z",
    direction: "outbound",
  };
  it("eligible with an inbound message from the lead's own address", () => {
    const inbound: EmailThreadLite = {
      threadId: "t1",
      from: '"Ana Cruz" <ana@cruzbakery.ph>',
      to: "martin@rareglobalfood.com",
      date: "2026-11-02T00:00:00.000Z",
      direction: "inbound",
    };
    const r = getConversionEligibility(lead, { email: [out, inbound] });
    expect(r.eligible).toBe(true);
    expect(r.channels).toEqual(["email"]);
    expect(r.firstContactAt).toBe(out.date);
    expect(r.firstReplyAt).toBe(inbound.date);
  });
  it("not eligible for outbound-only threads", () => {
    const r = getConversionEligibility(lead, { email: [out] });
    expect(r.eligible).toBe(false);
    expect(r.reason).toMatch(/Email — no reply yet/);
  });
  it("an RGF sender never counts as the lead's reply", () => {
    const rgf: EmailThreadLite = {
      threadId: "t2",
      from: "sales@rareglobalfood.com",
      to: "ana@cruzbakery.ph",
      date: "2026-11-02T00:00:00.000Z",
      direction: "inbound",
    };
    expect(getConversionEligibility(lead, { email: [rgf] }).eligible).toBe(false);
    expect(
      getConversionEligibility({ email: "sales@rareglobalfood.com" }, { email: [rgf] }).eligible,
    ).toBe(false);
  });
});

describe("getConversionEligibility — voice", () => {
  const call = (over: Partial<VapiCall>): VapiCall => ({
    id: "c1",
    createdAt: "2026-11-01T00:00:00.000Z",
    startedAt: "2026-11-01T00:00:05.000Z",
    endedAt: "2026-11-01T00:03:00.000Z",
    endedReason: "customer-ended-call",
    status: "ended",
    customer: { number: PHONE },
    artifact: {
      messages: [
        { role: "bot", message: "Hello, this is Mara", secondsFromStart: 1 },
        { role: "user", message: "Hi, tell me more", secondsFromStart: 4 },
      ],
    },
    ...over,
  });
  it("eligible when the customer spoke on an answered call", () => {
    const r = getConversionEligibility(lead, { calls: [call({})] });
    expect(r.eligible).toBe(true);
    expect(r.channels).toEqual(["voice"]);
    expect(r.firstReplyAt).toBe("2026-11-01T00:00:05.000Z");
  });
  for (const endedReason of ["customer-did-not-answer", "voicemail", "pipeline-error-failed"])
    it(`not eligible for ${endedReason}`, () => {
      expect(getConversionEligibility(lead, { calls: [call({ endedReason })] }).eligible).toBe(
        false,
      );
    });
  it("not eligible when the transcript has no customer turns", () => {
    const r = getConversionEligibility(lead, {
      calls: [call({ artifact: { messages: [{ role: "bot", message: "Hello?" }] } })],
    });
    expect(r.eligible).toBe(false);
    expect(r.reason).toMatch(/Voice — no reply yet/);
  });
});

describe("getConversionEligibility — website chat", () => {
  const session = (over: Partial<WebSessionLite>): WebSessionLite => ({
    sessionId: "s1",
    visitorName: "Ana",
    visitorPhone: PHONE,
    visitorEmail: "",
    firstSeenAt: "2026-11-01T00:00:00.000Z",
    lastMessageAt: "2026-11-01T00:05:00.000Z",
    messages: [
      { sender: "agent", text: "Hi! How can I help?", timestamp: "2026-11-01T00:00:00.000Z" },
      { sender: "visitor", text: "Need beef prices", timestamp: "2026-11-01T00:01:00.000Z" },
    ],
    ...over,
  });
  it("eligible with visitor messages and a captured phone", () => {
    const r = getConversionEligibility(lead, { web: [session({})] });
    expect(r.eligible).toBe(true);
    expect(r.channels).toEqual(["web"]);
    expect(r.firstReplyAt).toBe("2026-11-01T00:01:00.000Z");
  });
  it("eligible when matched by email only", () => {
    const r = getConversionEligibility(
      { email: "ana@cruzbakery.ph" },
      { web: [session({ visitorPhone: "", visitorEmail: "ANA@cruzbakery.ph" })] },
    );
    expect(r.eligible).toBe(true);
  });
  it("not eligible without visitor messages", () => {
    const r = getConversionEligibility(lead, {
      web: [
        session({
          messages: [{ sender: "agent", text: "Hi", timestamp: "2026-11-01T00:00:00.000Z" }],
        }),
      ],
    });
    expect(r.eligible).toBe(false);
  });
});

describe("getConversionEligibility — identity", () => {
  it("needs a phone, email or id", () => {
    const r = getConversionEligibility({ companyName: "X" }, {});
    expect(r.eligible).toBe(false);
    expect(r.reason).toMatch(/No phone or email/);
  });
});

describe("buildLeadTimeline + conversationSummary", () => {
  it("merges channels oldest first", () => {
    const items = buildLeadTimeline(lead, {
      whatsapp: [conv({ messages: [opener, reply] })],
      sms: [conv({ messages: [{ ...later, ts: "2026-10-31T00:00:00.000Z" }] })],
    });
    expect(items.map((i) => i.channel)).toEqual(["sms", "whatsapp", "whatsapp"]);
    expect(items[2]).toMatchObject({ direction: "in", text: reply.content });
  });
  it("keeps the last 10 lines and caps at 1,500 chars", () => {
    const items: TimelineItem[] = Array.from({ length: 15 }, (_, i) => ({
      channel: "whatsapp",
      ts: `2026-11-01T00:${String(i).padStart(2, "0")}:00.000Z`,
      direction: i % 2 ? "in" : "out",
      who: i % 2 ? "Ana" : "Martin",
      text: `message ${i} ${"x".repeat(300)}`,
      href: "/whatsapp",
    }));
    const s = conversationSummary(items);
    expect(s.length).toBeLessThanOrEqual(1500);
    expect(s).toContain("message 14");
    expect(s).not.toContain("message 4 ");
    expect(conversationSummary(items.slice(0, 2))).toBe(
      `[WhatsApp] Martin: message 0 ${"x".repeat(300)}\n[WhatsApp] Ana: message 1 ${"x".repeat(300)}`,
    );
  });
});

describe("splitName", () => {
  it("splits first/last and falls back to Unknown", () => {
    expect(splitName("Ana Maria Cruz")).toEqual({ firstName: "Ana Maria", lastName: "Cruz" });
    expect(splitName("Ana")).toEqual({ firstName: "", lastName: "Ana" });
    expect(splitName("")).toEqual({ firstName: "", lastName: "Unknown" });
  });
});
