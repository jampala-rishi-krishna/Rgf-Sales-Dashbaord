import { createFileRoute } from "@tanstack/react-router";
import { mergeCalls, vapiAssistantIds } from "@/lib/vapi.server";

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
  });

export const Route = createFileRoute("/api/vapi-calls")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const key = process.env.VAPI_PRIVATE_KEY;
        if (!key) return json({ error: "Vapi credentials not configured" }, 500);
        const url = new URL(request.url);
        const limit = Math.min(
          Math.max(Number(url.searchParams.get("limit") ?? 100) || 100, 1),
          1000,
        );
        const createdAtLt = url.searchParams.get("createdAtLt");
        const ids = vapiAssistantIds();
        const results = await Promise.all(
          ids.map(async (assistantId) => {
            const params = new URLSearchParams({ assistantId, limit: String(limit) });
            if (createdAtLt) params.set("createdAtLt", createdAtLt);
            const res = await fetch(`https://api.vapi.ai/call?${params}`, {
              headers: { Authorization: `Bearer ${key}` },
              signal: AbortSignal.timeout(20_000),
            }).catch(() => null);
            if (!res?.ok) {
              console.warn(
                `[vapi-calls] assistant=${assistantId} status=${res?.status ?? "network"}`,
              );
              return { ok: false, status: res?.status ?? 502, calls: [] as unknown[] };
            }
            const d = (await res.json().catch(() => [])) as unknown;
            const calls = Array.isArray(d) ? d : ((d as { data?: unknown[] })?.data ?? []);
            return { ok: true, status: 200, calls };
          }),
        );
        if (!results.some((r) => r.ok))
          return json({ error: "Vapi request failed" }, results[0]?.status ?? 502);
        const calls = mergeCalls(
          results.map((r) => r.calls),
          limit,
        );
        console.log(`[vapi-calls] assistants=${ids.length} calls=${calls.length}`);
        return json(calls);
      },
    },
  },
});
