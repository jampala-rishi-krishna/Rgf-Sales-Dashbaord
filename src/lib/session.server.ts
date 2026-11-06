// Server-only session handling: HMAC-SHA256 signed cookie.
import { createHmac, timingSafeEqual } from "node:crypto";
import bcrypt from "bcryptjs";

export type Role = "viewer" | "agent" | "admin";
export interface SessionUser {
  email: string;
  name: string;
  role: Role;
}
interface SessionPayload extends SessionUser {
  exp: number;
}

export const SESSION_COOKIE = "rgf_session";
const TTL_SECONDS = 12 * 60 * 60;
const ROLES: Role[] = ["viewer", "agent", "admin"];

function secret(): string {
  const s = process.env.SESSION_SECRET;
  if (!s || s.length < 16) {
    if (process.env.NODE_ENV === "production")
      throw new Error("SESSION_SECRET must be set (>=16 chars)");
    return "dev-only-insecure-session-secret";
  }
  return s;
}

const sign = (data: string) => createHmac("sha256", secret()).update(data).digest("base64url");

function encode(p: SessionPayload): string {
  const body = Buffer.from(JSON.stringify(p), "utf8").toString("base64url");
  return `${body}.${sign(body)}`;
}

function decode(token: string): SessionPayload | null {
  const [body, sig] = token.split(".");
  if (!body || !sig) return null;
  const expected = Buffer.from(sign(body));
  const given = Buffer.from(sig);
  if (expected.length !== given.length || !timingSafeEqual(expected, given)) return null;
  try {
    const p = JSON.parse(Buffer.from(body, "base64url").toString("utf8")) as SessionPayload;
    if (typeof p.exp !== "number" || p.exp * 1000 < Date.now()) return null;
    if (!p.email || !ROLES.includes(p.role)) return null;
    return p;
  } catch {
    return null;
  }
}

function readCookie(request: Request, name: string): string | null {
  const header = request.headers.get("cookie");
  if (!header) return null;
  for (const part of header.split(";")) {
    const i = part.indexOf("=");
    if (i < 0) continue;
    if (part.slice(0, i).trim() === name) {
      try {
        return decodeURIComponent(part.slice(i + 1).trim());
      } catch {
        return null;
      }
    }
  }
  return null;
}

export function getSession(request: Request): SessionUser | null {
  const token = readCookie(request, SESSION_COOKIE);
  if (!token) return null;
  const p = decode(token);
  return p ? { email: p.email, name: p.name, role: p.role } : null;
}

const secureAttr = () => (process.env.NODE_ENV === "production" ? "; Secure" : "");

export function sessionCookie(user: SessionUser): string {
  const exp = Math.floor(Date.now() / 1000) + TTL_SECONDS;
  const token = encode({ ...user, exp });
  return `${SESSION_COOKIE}=${encodeURIComponent(token)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${TTL_SECONDS}${secureAttr()}`;
}

export function clearCookie(): string {
  return `${SESSION_COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0${secureAttr()}`;
}

export interface StoredUser extends SessionUser {
  passwordHash: string;
}

const BCRYPT_RE = /^\$2[aby]\$\d{2}\$.{53}$/;

/**
 * Parses DASHBOARD_USERS, tolerating the two common paste mistakes: the whole value
 * wrapped in quotes (copied from a .env line) and `\$` escaping (needed for Vite in
 * local .env files, but Vercel stores the value literally). Returns problems to log.
 */
export function parseDashboardUsers(value: string | undefined): {
  users: StoredUser[];
  problems: string[];
} {
  const problems: string[] = [];
  let v = (value ?? "").trim();
  if (!v) return { users: [], problems: ["DASHBOARD_USERS is not set"] };
  if (/^(['"]).*\1$/s.test(v)) v = v.slice(1, -1).trim();
  v = v.split("\\$").join("$");
  let raw: unknown;
  try {
    raw = JSON.parse(v);
  } catch {
    return { users: [], problems: ["DASHBOARD_USERS is not valid JSON"] };
  }
  if (!Array.isArray(raw)) return { users: [], problems: ["DASHBOARD_USERS must be a JSON array"] };
  const users = raw.filter((u): u is StoredUser => {
    const ok =
      !!u &&
      typeof u.email === "string" &&
      typeof u.passwordHash === "string" &&
      ROLES.includes(u.role);
    if (!ok)
      problems.push(
        `DASHBOARD_USERS entry ${JSON.stringify(u?.email ?? null)} is missing email, passwordHash or a valid role`,
      );
    else if (!BCRYPT_RE.test(u.passwordHash))
      // Shorter than 60 chars usually means a dotenv loader expanded "$..." (Vite does in local .env).
      problems.push(
        `passwordHash for ${u.email} is not a valid bcrypt hash (see docs/ENV_SETUP.md)`,
      );
    return ok;
  });
  return { users, problems };
}

function loadUsers(): StoredUser[] {
  const { users, problems } = parseDashboardUsers(process.env.DASHBOARD_USERS);
  for (const p of problems) console.error(`[session] ${p}`);
  return users;
}

// Compared against when the email is unknown, so timing does not reveal valid emails.
const DUMMY_HASH = bcrypt.hashSync("not-a-real-password", 10);

export async function verifyCredentials(
  email: string,
  password: string,
): Promise<SessionUser | null> {
  const e = email.trim().toLowerCase();
  const users = loadUsers();
  const u = users.find((x) => x.email.trim().toLowerCase() === e);
  const ok = await bcrypt.compare(password, u?.passwordHash ?? DUMMY_HASH).catch(() => false);
  if (!u || !ok) {
    // Server log only (never sent to the browser); helps diagnose env setup.
    console.warn(
      `[session] login failed: ${users.length} user(s) configured, email ${u ? "found, wrong password" : "not found"}`,
    );
    return null;
  }
  return { email: u.email, name: u.name || u.email, role: u.role };
}

const RANK: Record<Role, number> = { viewer: 0, agent: 1, admin: 2 };
export function hasRole(user: SessionUser | null, need: Role): boolean {
  return !!user && RANK[user.role] >= RANK[need];
}

export function json(
  body: unknown,
  status = 200,
  extraHeaders: Record<string, string> = {},
): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", "Cache-Control": "no-store", ...extraHeaders },
  });
}
