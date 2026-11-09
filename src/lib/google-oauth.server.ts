// Server-only Google OAuth (OpenID Connect authorization-code flow) for staff sign-in.
// Only verified @rareglobalfood.com accounts that map to a role are accepted.
import { randomBytes, timingSafeEqual } from "node:crypto";
import { parseDashboardUsers, type Role, type SessionUser } from "./session.server";

export const ALLOWED_DOMAIN = "rareglobalfood.com";
export const STATE_COOKIE = "rgf_oauth_state";
const STATE_TTL_SECONDS = 600;
const ROLES: Role[] = ["viewer", "agent", "admin"];

const on = (v: string | undefined) => v === "true" || v === "1";

export function googleConfig() {
  const clientId = process.env.GOOGLE_CLIENT_ID?.trim();
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET?.trim();
  return clientId && clientSecret ? { clientId, clientSecret } : null;
}

/** True when FEATURE_GOOGLE_SSO is on and the OAuth client is configured. */
export function googleSsoEnabled(): boolean {
  return on(process.env.FEATURE_GOOGLE_SSO) && !!googleConfig();
}

export function redirectUri(request: Request): string {
  const fixed = process.env.GOOGLE_REDIRECT_URI?.trim();
  if (fixed) return fixed;
  return `${new URL(request.url).origin}/api/auth/google/callback`;
}

const secureAttr = () => (process.env.NODE_ENV === "production" ? "; Secure" : "");

export function newState(): { state: string; cookie: string } {
  const state = randomBytes(24).toString("base64url");
  return {
    state,
    cookie: `${STATE_COOKIE}=${state}; Path=/api/auth/google; HttpOnly; SameSite=Lax; Max-Age=${STATE_TTL_SECONDS}${secureAttr()}`,
  };
}

export const clearStateCookie = () =>
  `${STATE_COOKIE}=; Path=/api/auth/google; HttpOnly; SameSite=Lax; Max-Age=0${secureAttr()}`;

export function stateMatches(request: Request, given: string | null): boolean {
  if (!given) return false;
  const header = request.headers.get("cookie") ?? "";
  const stored = header
    .split(";")
    .map((p) => p.trim())
    .find((p) => p.startsWith(`${STATE_COOKIE}=`))
    ?.slice(STATE_COOKIE.length + 1);
  if (!stored) return false;
  const a = Buffer.from(stored);
  const b = Buffer.from(given);
  return a.length === b.length && timingSafeEqual(a, b);
}

export function authorizeUrl(request: Request, state: string, clientId: string): string {
  const u = new URL("https://accounts.google.com/o/oauth2/v2/auth");
  u.search = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri(request),
    response_type: "code",
    scope: "openid email profile",
    state,
    hd: ALLOWED_DOMAIN, // account-chooser hint only; enforced again below
    prompt: "select_account",
  }).toString();
  return u.toString();
}

export interface GoogleIdentity {
  email: string;
  name: string;
}

export class SsoError extends Error {
  constructor(public code: "exchange" | "domain" | "unverified" | "not_provisioned") {
    super(code);
  }
}

/**
 * Validates ID token claims. The token comes straight from Google's token endpoint over
 * TLS, so (per OIDC Core 3.1.3.7) the signature check may be skipped, but the claims are not.
 */
export function identityFromClaims(
  claims: Record<string, unknown>,
  clientId: string,
  now = Date.now(),
): GoogleIdentity {
  const iss = claims.iss;
  if (iss !== "https://accounts.google.com" && iss !== "accounts.google.com")
    throw new SsoError("exchange");
  if (claims.aud !== clientId) throw new SsoError("exchange");
  if (typeof claims.exp !== "number" || claims.exp * 1000 < now) throw new SsoError("exchange");
  const email = typeof claims.email === "string" ? claims.email.trim().toLowerCase() : "";
  if (claims.email_verified !== true) throw new SsoError("unverified");
  if (!email.endsWith(`@${ALLOWED_DOMAIN}`) || claims.hd !== ALLOWED_DOMAIN)
    throw new SsoError("domain");
  const name = typeof claims.name === "string" && claims.name ? claims.name : email;
  return { email, name };
}

export async function exchangeCode(request: Request, code: string): Promise<GoogleIdentity> {
  const cfg = googleConfig();
  if (!cfg) throw new SsoError("exchange");
  const r = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: cfg.clientId,
      client_secret: cfg.clientSecret,
      redirect_uri: redirectUri(request),
      grant_type: "authorization_code",
    }),
  });
  if (!r.ok) {
    console.error(`[sso] token exchange failed: ${r.status} ${await r.text().catch(() => "")}`);
    throw new SsoError("exchange");
  }
  const { id_token } = (await r.json()) as { id_token?: string };
  const payload = id_token?.split(".")[1];
  if (!payload) throw new SsoError("exchange");
  let claims: Record<string, unknown>;
  try {
    claims = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
  } catch {
    throw new SsoError("exchange");
  }
  return identityFromClaims(claims, cfg.clientId);
}

/**
 * Maps a Google identity to a dashboard role: DASHBOARD_USERS first (same role as the
 * password account), then DASHBOARD_ROLES ({"email": "role", "*": "viewer"}). Unmapped
 * accounts are refused.
 */
export function resolveSsoUser(id: GoogleIdentity): SessionUser {
  const { users } = parseDashboardUsers(process.env.DASHBOARD_USERS);
  const known = users.find((u) => u.email.trim().toLowerCase() === id.email);
  if (known) return { email: id.email, name: known.name || id.name, role: known.role };

  let map: Record<string, unknown> = {};
  const raw = process.env.DASHBOARD_ROLES?.trim();
  if (raw) {
    try {
      const parsed: unknown = JSON.parse(raw);
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed))
        map = Object.fromEntries(
          Object.entries(parsed).map(([k, v]) => [k.trim().toLowerCase(), v]),
        );
      else console.error("[sso] DASHBOARD_ROLES must be a JSON object");
    } catch {
      console.error("[sso] DASHBOARD_ROLES is not valid JSON");
    }
  }
  const role = map[id.email] ?? map["*"];
  if (typeof role === "string" && ROLES.includes(role as Role))
    return { email: id.email, name: id.name, role: role as Role };
  throw new SsoError("not_provisioned");
}
