import { describe, expect, it } from "vitest";
import bcrypt from "bcryptjs";
import { parseDashboardUsers } from "./session.server";

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
