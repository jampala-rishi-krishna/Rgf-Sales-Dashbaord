// Client call for POST /api/actions/convert-lead. No toasts here: callers (dialog, bulk) decide.
import type { ConvertLeadRequest, ConvertLeadResult } from "@/lib/conversion";

export async function convertLead(body: ConvertLeadRequest): Promise<ConvertLeadResult> {
  try {
    const r = await fetch("/api/actions/convert-lead", {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const j = (await r.json().catch(() => null)) as ConvertLeadResult | null;
    if (j && typeof j === "object" && "ok" in j) return j;
    return { ok: false, error: `Convert failed (HTTP ${r.status})` };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Network error" };
  }
}
