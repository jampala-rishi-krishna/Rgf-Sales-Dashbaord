import { describe, expect, it } from "vitest";
import { n8nErrorMessage } from "./n8n-actions.server";

describe("n8nErrorMessage", () => {
  it("explains an unregistered webhook (workflow not published)", () => {
    const body = {
      code: 404,
      message: 'The requested webhook "POST dashboard-manual-reply" is not registered.',
    };
    expect(n8nErrorMessage(404, body)).toMatch(/isn't published yet/);
    expect(n8nErrorMessage(404, null)).toMatch(/isn't published yet/);
  });
  it("surfaces the workflow's own error", () => {
    expect(n8nErrorMessage(404, { ok: false, error: "No conversation found for this phone" })).toBe(
      "No conversation found for this phone",
    );
    expect(n8nErrorMessage(200, { ok: false, error: "Twilio rejected the message" })).toBe(
      "Twilio rejected the message",
    );
  });
  it("falls back to the status code", () => {
    expect(n8nErrorMessage(500, {})).toBe("n8n responded 500");
  });
});
