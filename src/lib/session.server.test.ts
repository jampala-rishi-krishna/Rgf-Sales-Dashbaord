import { afterEach, describe, expect, it, vi } from "vitest";
import bcrypt from "bcryptjs";
import { AuthConfigurationError, parseDashboardUsers, verifyCredentials } from "./session.server";

const hash = bcrypt.hashSync("pw-123", 4);
const json = JSON.stringify([{ email: "a@rgf.com", name: "A", role: "admin", passwordHash: hash }]);

describe("parseDashboardUsers (DASHBOARD_USERS paste variants)", () => {
  const variants: [string, string][] = [
    ["raw JSON (correct Vercel value)", json],
    ["wrapped in single quotes", `'${json}'`],
    ["wrapped in double quotes", `"${json}"`],
    ["with \\$ escaping from a local .env", json.split("$").join("\\$")],
    ["with surrounding whitespace", `  ${json}\n`],
  ];
  for (const [name, value] of variants) {
    it(`accepts ${name}`, () => {
      const { users, problems } = parseDashboardUsers(value);
      expect(problems).toEqual([]);
      expect(users).toHaveLength(1);
      expect(bcrypt.compareSync("pw-123", users[0].passwordHash)).toBe(true);
    });
  }
  it("reports missing, invalid JSON, and corrupted hashes", () => {
    expect(parseDashboardUsers(undefined).problems).toEqual(["DASHBOARD_USERS is not set"]);
    expect(parseDashboardUsers("[{oops").problems).toEqual(["DASHBOARD_USERS is not valid JSON"]);
    const corrupted = json.replace(hash, hash.slice(0, 7)); // what Vite's $ expansion leaves behind
    expect(parseDashboardUsers(corrupted).problems[0]).toMatch(/not a valid bcrypt hash/);
  });
});

describe("verifyCredentials", () => {
  afterEach(() => vi.unstubAllEnvs());

  it("accepts the configured password and rejects incorrect credentials", async () => {
    vi.stubEnv("DASHBOARD_USERS", json);
    vi.stubEnv("SESSION_SECRET", "test-session-secret-at-least-16-chars");
    await expect(verifyCredentials(" A@RGF.COM ", "pw-123")).resolves.toEqual({
      email: "a@rgf.com", name: "A", role: "admin",
    });
    await expect(verifyCredentials("a@rgf.com", "incorrect")).resolves.toBeNull();
    await expect(verifyCredentials("unknown@rgf.com", "pw-123")).resolves.toBeNull();
  });

  it.each([undefined, "invalid JSON", "[]", json.replace(hash, hash.slice(0, 7))])(
    "reports unusable account configuration separately from incorrect credentials (%s)",
    async (value) => {
      vi.stubEnv("DASHBOARD_USERS", value);
      vi.stubEnv("SESSION_SECRET", "test-session-secret-at-least-16-chars");
      await expect(verifyCredentials("a@rgf.com", "pw-123")).rejects.toBeInstanceOf(AuthConfigurationError);
    },
  );

  it("reports a missing production session secret as a configuration error", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("DASHBOARD_USERS", json);
    vi.stubEnv("SESSION_SECRET", undefined);
    await expect(verifyCredentials("a@rgf.com", "pw-123")).rejects.toBeInstanceOf(AuthConfigurationError);
  });
});
