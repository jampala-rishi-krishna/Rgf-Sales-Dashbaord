import { describe, expect, it } from "vitest";
import {
  asText,
  callLead,
  callOutcome,
  callTitle,
  endedReasonText,
  isLive,
  summaryText,
  toolChips,
  toolNames,
  transcriptLines,
  type VapiCall,
} from "./vapi";

const call = (over: Record<string, unknown>): VapiCall =>
  ({ id: "c1", createdAt: "2026-11-09T02:00:00.000Z", ...over }) as unknown as VapiCall;

describe("asText", () => {
  it("coerces strings, numbers, content-part arrays and objects", () => {
    expect(asText("hi")).toBe("hi");
    expect(asText(42)).toBe("42");
    expect(asText(null)).toBe("");
    expect(
      asText([
        { type: "text", text: "Hello" },
        { type: "text", text: "there" },
      ]),
    ).toBe("Hello there");
    expect(asText({ text: "x" })).toBe("x");
    expect(asText({ unknown: 1 })).toBe("");
  });
});

describe("transcriptLines (regression: non-string message/content crashed the Calls page)", () => {
  it("reads content-part arrays and object messages", () => {
    const c = call({
      artifact: {
        messages: [
          { role: "assistant", content: [{ type: "text", text: "Hi from Mara" }] },
          { role: "user", message: { text: "Hello" } },
          { role: "bot", message: { weird: true } },
          { role: "system", message: "ignored" },
        ],
      },
    });
    expect(transcriptLines(c)).toEqual([
      { speaker: "agent", text: "Hi from Mara", start: undefined },
      { speaker: "customer", text: "Hello", start: undefined },
    ]);
  });
  it("tolerates a non-array messages field and falls back to the plain transcript", () => {
    const c = call({ artifact: { messages: { bad: 1 }, transcript: "AI: Hello\nUser: Hi\nmore" } });
    expect(transcriptLines(c)).toEqual([
      { speaker: "agent", text: "Hello" },
      { speaker: "customer", text: "Hi more" },
    ]);
  });
});

describe("other hardened fields", () => {
  it("summary and endedReason objects become text", () => {
    const c = call({ analysis: { summary: { text: "Wants fries" } }, endedReason: { code: 1 } });
    expect(summaryText(c)).toBe("Wants fries");
    expect(endedReasonText(c)).toBe("");
    expect(callOutcome(c)).toBe("Answered");
  });
  it("outcome still classifies normal reasons", () => {
    expect(callOutcome(call({ endedReason: "customer-did-not-answer" }))).toBe("No Answer");
    expect(callOutcome(call({ endedReason: "voicemail" }))).toBe("Voicemail");
    expect(isLive(call({ status: "in-progress" }))).toBe(true);
    expect(isLive(call({ status: { s: 1 } }))).toBe(false);
  });
  it("tool names ignore non-string names and non-array toolCalls", () => {
    const c = call({
      artifact: {
        messages: [
          { role: "tool_calls", toolCalls: [{ function: { name: { n: 1 } } }] },
          { role: "tool_calls", toolCalls: { not: "array" } },
          { role: "tool_calls", toolCalls: [{ function: { name: "bookMeeting" } }] },
        ],
      },
    });
    expect(toolNames(c)).toEqual(["bookMeeting"]);
    expect(toolChips(c)).toEqual([{ label: "Meeting booked", tone: "good" }]);
  });
  it("lead/title survive web calls with no customer and numeric numbers", () => {
    expect(callTitle(call({ type: "webCall" }))).toBe("Unknown caller");
    expect(callLead(call({ customer: { number: 639171234567 } })).phone).toBe("639171234567");
  });
});
