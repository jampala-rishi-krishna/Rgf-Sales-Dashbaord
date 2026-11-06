// Server-only n8n action caller. Never import from client code.
import { isDryRun } from "./flags.server";
import { getSession, hasRole, json, type Role, type SessionUser } from "./session.server";

export interface N8nResult<T = unknown> {
  ok: boolean;
  status: number;
  data?: T;
  error?: string;
  dryRun: boolean;
}
export interface N8nMeta {
  user: SessionUser;
  action: string;
  channel: string;
  count?: number;
  leadIds?: string[];
  /** Send `body` exactly as given (no triggeredBy). Used for bulk webhooks with a fixed contract. */
  exactBody?: boolean;
}

export function n8nBase(): string {
  return (process.env.N8N_BASE || process.env.N8N_WEBHOOK_BASE_URL || "").replace(/\/+$/, "");
}

/** POST to an n8n webhook. Short-circuits when ACTIONS_DRY_RUN is anything but "false". */
export async function callN8n<T = unknown>(
  path: string,
  body: Record<string, unknown>,
  meta: N8nMeta,
): Promise<N8nResult<T>> {
  const dryRun = isDryRun();
  const payload = meta.exactBody ? body : { ...body, triggeredBy: meta.user.email };
  console.log(
    "[action]",
    JSON.stringify({
      user: meta.user.email,
      action: meta.action,
      channel: meta.channel,
      count: meta.count ?? 1,
      leadIds: meta.leadIds ?? [],
      path,
      dryRun,
      ts: new Date().toISOString(),
    }),
  );
  if (dryRun) return { ok: true, status: 200, dryRun: true, data: { dryRun: true } as T };

  const base = n8nBase();
  if (!base) return { ok: false, status: 500, dryRun: false, error: "N8N_BASE is not configured" };

  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 20_000);
  try {
    const res = await fetch(`${base}${path.startsWith("/") ? path : `/${path}`}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: process.env.N8N_WEBHOOK_AUTH ?? "",
      },
      body: JSON.stringify(payload),
      signal: ctrl.signal,
    });
    const text = await res.text();
    let data: unknown = text;
    try {
      data = text ? JSON.parse(text) : null;
    } catch {
      /* plain text, e.g. "Workflow got started." */
    }
    if (!res.ok)
      return {
        ok: false,
        status: res.status,
        dryRun: false,
        data: data as T,
        error: `n8n responded ${res.status}`,
      };
    return { ok: true, status: res.status, dryRun: false, data: data as T };
  } catch (e) {
    const aborted = e instanceof Error && e.name === "AbortError";
    return {
      ok: false,
      status: aborted ? 504 : 502,
      dryRun: false,
      error: aborted ? "n8n timed out after 20s" : "Could not reach n8n",
    };
  } finally {
    clearTimeout(timer);
  }
}

/** GET an n8n read endpoint (no dry-run; reads are safe). */
export async function getN8n(
  path: string,
): Promise<{ ok: boolean; status: number; data?: unknown; error?: string }> {
  const base = n8nBase();
  if (!base) return { ok: false, status: 500, error: "N8N_BASE is not configured" };
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 20_000);
  try {
    const res = await fetch(`${base}${path}`, {
      headers: { Authorization: process.env.N8N_WEBHOOK_AUTH ?? "", Accept: "application/json" },
      signal: ctrl.signal,
    });
    const data = await res.json().catch(() => null);
    return res.ok
      ? { ok: true, status: res.status, data }
      : { ok: false, status: res.status, data, error: `n8n responded ${res.status}` };
  } catch {
    return { ok: false, status: 502, error: "Could not reach n8n" };
  } finally {
    clearTimeout(timer);
  }
}

/** Resolve session and enforce role. Returns the user or an error Response. */
export function requireRole(request: Request, need: Role): SessionUser | Response {
  const user = getSession(request);
  if (!user) return json({ ok: false, error: "Unauthorized" }, 401);
  if (!hasRole(user, need)) return json({ ok: false, error: `Requires ${need} role` }, 403);
  return user;
}

/** Convert an N8nResult to the standard {ok,data?,error?,dryRun?} response. */
export function toResponse(r: N8nResult): Response {
  return json(
    r.ok
      ? { ok: true, data: r.data, dryRun: r.dryRun || undefined }
      : { ok: false, error: r.error ?? "Action failed", data: r.data },
    r.ok ? 200 : r.status >= 400 ? r.status : 502,
  );
}

export async function readJson(request: Request): Promise<unknown> {
  return request.json().catch(() => null);
}
