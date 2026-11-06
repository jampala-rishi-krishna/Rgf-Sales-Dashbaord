import { toast } from "sonner";

export type ActionResult<T = unknown> = { ok: boolean; data?: T; error?: string; dryRun?: boolean };

/** Client wrapper for every POST /api/actions/* and /api/gmail-send call. Always toasts consistently. */
export async function postAction<T = unknown>(url: string, body: unknown, successMsg = "Sent"): Promise<ActionResult<T>> {
  try {
    const r = await fetch(url, { method: "POST", credentials: "include", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    const j = (await r.json().catch(() => ({ ok: false, error: `HTTP ${r.status}` }))) as ActionResult<T>;
    if (j.ok) toast.success(j.dryRun ? `Dry run: ${successMsg}` : successMsg);
    else toast.error(j.error ?? "Action failed");
    return j;
  } catch (e) {
    const error = e instanceof Error ? e.message : "Network error";
    toast.error(error);
    return { ok: false, error };
  }
}
