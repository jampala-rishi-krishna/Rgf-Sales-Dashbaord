import { beforeEach, describe, expect, it } from "vitest";
import {
  LOCKOUT_MS,
  MAX_FAILURES,
  __resetThrottle,
  clearFailures,
  lockRemainingMs,
  recordFailure,
} from "./login-throttle.server";

describe("login throttle", () => {
  beforeEach(() => __resetThrottle());

  it("locks an email+IP after 5 failures for 15 minutes", () => {
    const t = 1_000_000;
    for (let i = 1; i < MAX_FAILURES; i++) expect(recordFailure("a@x.com", "1.1.1.1", t)).toBe(0);
    expect(recordFailure("A@X.com ", "1.1.1.1", t)).toBe(LOCKOUT_MS);
    expect(lockRemainingMs("a@x.com", "1.1.1.1", t + 1000)).toBe(LOCKOUT_MS - 1000);
    expect(lockRemainingMs("a@x.com", "1.1.1.1", t + LOCKOUT_MS)).toBe(0);
  });

  it("keeps different IPs and emails independent", () => {
    for (let i = 0; i < MAX_FAILURES; i++) recordFailure("a@x.com", "1.1.1.1", 0);
    expect(lockRemainingMs("a@x.com", "2.2.2.2", 1)).toBe(0);
    expect(lockRemainingMs("b@x.com", "1.1.1.1", 1)).toBe(0);
  });

  it("forgets old failures and resets on success", () => {
    for (let i = 0; i < MAX_FAILURES - 1; i++) recordFailure("a@x.com", "ip", 0);
    expect(recordFailure("a@x.com", "ip", LOCKOUT_MS + 1)).toBe(0);
    for (let i = 0; i < MAX_FAILURES - 1; i++) recordFailure("b@x.com", "ip", 0);
    clearFailures("b@x.com", "ip");
    expect(recordFailure("b@x.com", "ip", 1)).toBe(0);
  });
});
