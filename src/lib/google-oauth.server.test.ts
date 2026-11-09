import { afterEach, describe, expect, it, vi } from "vitest";
import {
  SsoError,
  googleSsoEnabled,
  identityFromClaims,
  newState,
  resolveSsoUser,
  stateMatches,
} from "./google-oauth.server";

const CLIENT = "client-123.apps.googleusercontent.com";
const good = {
  iss: "https://accounts.google.com",
  aud: CLIENT,
  exp: Math.floor(Date.now() / 1000) + 600,
  email: "Jane@RareGlobalFood.com",
  email_verified: true,
  hd: "rareglobalfood.com",
  name: "Jane",
};

const codeOf = (fn: () => unknown) => {
  try {
    fn();
  } catch (e) {
    return e instanceof SsoError ? e.code : "other";
  }
  return "none";
};

describe("identityFromClaims", () => {
  it("accepts a verified company account", () => {
    expect(identityFromClaims(good, CLIENT)).toEqual({
      email: "jane@rareglobalfood.com",
      name: "Jane",
    });
  });
  it("rejects other domains, unverified email, wrong audience and expired tokens", () => {
    expect(
      codeOf(() => identityFromClaims({ ...good, email: "j@gmail.com", hd: undefined }, CLIENT)),
    ).toBe("domain");
    expect(codeOf(() => identityFromClaims({ ...good, hd: undefined }, CLIENT))).toBe("domain");
    expect(codeOf(() => identityFromClaims({ ...good, email_verified: false }, CLIENT))).toBe(
      "unverified",
    );
    expect(codeOf(() => identityFromClaims({ ...good, aud: "other" }, CLIENT))).toBe("exchange");
    expect(codeOf(() => identityFromClaims({ ...good, exp: 1 }, CLIENT))).toBe("exchange");
    expect(codeOf(() => identityFromClaims({ ...good, iss: "https://evil" }, CLIENT))).toBe(
      "exchange",
    );
  });
});

describe("resolveSsoUser", () => {
  afterEach(() => vi.unstubAllEnvs());
  const id = { email: "jane@rareglobalfood.com", name: "Jane G" };

  it("uses the DASHBOARD_USERS role first", () => {
    vi.stubEnv(
      "DASHBOARD_USERS",
      JSON.stringify([
        { email: "JANE@rareglobalfood.com", name: "Jane", role: "admin", passwordHash: "x" },
      ]),
    );
    vi.stubEnv("DASHBOARD_ROLES", JSON.stringify({ "*": "viewer" }));
    expect(resolveSsoUser(id)).toEqual({ email: id.email, name: "Jane", role: "admin" });
  });
  it("falls back to DASHBOARD_ROLES, then the * default", () => {
    vi.stubEnv("DASHBOARD_USERS", "[]");
    vi.stubEnv("DASHBOARD_ROLES", JSON.stringify({ "Jane@rareglobalfood.com": "agent" }));
    expect(resolveSsoUser(id).role).toBe("agent");
    vi.stubEnv("DASHBOARD_ROLES", JSON.stringify({ "*": "viewer" }));
    expect(resolveSsoUser(id).role).toBe("viewer");
  });
  it("refuses unmapped accounts", () => {
    vi.stubEnv("DASHBOARD_USERS", "[]");
    vi.stubEnv("DASHBOARD_ROLES", "");
    expect(codeOf(() => resolveSsoUser(id))).toBe("not_provisioned");
  });
});

describe("feature flag and state", () => {
  afterEach(() => vi.unstubAllEnvs());
  it("needs both the flag and a configured client", () => {
    vi.stubEnv("FEATURE_GOOGLE_SSO", "true");
    vi.stubEnv("GOOGLE_CLIENT_ID", "");
    vi.stubEnv("GOOGLE_CLIENT_SECRET", "");
    expect(googleSsoEnabled()).toBe(false);
    vi.stubEnv("GOOGLE_CLIENT_ID", CLIENT);
    vi.stubEnv("GOOGLE_CLIENT_SECRET", "s");
    expect(googleSsoEnabled()).toBe(true);
    vi.stubEnv("FEATURE_GOOGLE_SSO", "false");
    expect(googleSsoEnabled()).toBe(false);
  });
  it("matches state only against its own cookie", () => {
    const { state } = newState();
    const req = new Request("https://x/api/auth/google/callback", {
      headers: { cookie: `a=b; rgf_oauth_state=${state}` },
    });
    expect(stateMatches(req, state)).toBe(true);
    expect(stateMatches(req, `${state}x`)).toBe(false);
    expect(stateMatches(new Request("https://x"), state)).toBe(false);
  });
});
