import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

describe("Gmail connection", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.stubEnv("GMAIL_CLIENT_ID", "test-client");
    vi.stubEnv("GMAIL_CLIENT_SECRET", "test-secret");
    vi.stubEnv("GMAIL_REFRESH_TOKEN", "test-refresh");
  });
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it("reports missing settings before contacting Google", async () => {
    vi.stubEnv("GMAIL_CLIENT_ID", "");
    const fetch = vi.fn();
    vi.stubGlobal("fetch", fetch);
    const { getGmailAccessToken } = await import("./gmail-server");
    await expect(getGmailAccessToken()).rejects.toMatchObject({ code: "gmail_not_configured" });
    expect(fetch).not.toHaveBeenCalled();
  });

  it.each([
    ["invalid_client", "gmail_invalid_client"],
    ["unauthorized_client", "gmail_invalid_client"],
    ["invalid_grant", "gmail_reconnect_required"],
  ])("explains %s without exposing Google's raw response", async (error, code) => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(
      JSON.stringify({ error, error_description: "private upstream details" }), { status: 400 },
    )));
    const { getGmailAccessToken } = await import("./gmail-server");
    await expect(getGmailAccessToken()).rejects.toMatchObject({ code });
    await expect(getGmailAccessToken()).rejects.not.toThrow("private upstream details");
  });

  it("refreshes and caches a valid access token", async () => {
    const fetch = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      access_token: "test-access", expires_in: 3600,
    })));
    vi.stubGlobal("fetch", fetch);
    const { getGmailAccessToken } = await import("./gmail-server");
    await expect(getGmailAccessToken()).resolves.toBe("test-access");
    await expect(getGmailAccessToken()).resolves.toBe("test-access");
    expect(fetch).toHaveBeenCalledTimes(1);
  });
});
