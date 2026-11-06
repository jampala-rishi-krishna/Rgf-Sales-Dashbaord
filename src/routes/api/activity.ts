import { createFileRoute } from "@tanstack/react-router";
import type { Conversation } from "@/lib/channels";
import {
  deriveCallEvents,
  deriveConversationEvents,
  deriveWebsiteEvents,
  finalizeEvents,
  type AgentEvent,
  type VapiCallLike,
  type WebsiteSessionLike,
} from "@/lib/events";

const WEBSITE_URL = "https://rareglobalfood.app.n8n.cloud/webhook/martin-chat-dashboard-sessions";

function n8nBase() {
  return (
    process.env.N8N_WEBHOOK_BASE_URL ||
    process.env.N8N_BASE ||
    "https://rareglobalfood.app.n8n.cloud/webhook"
  );
}

async function fetchJson(url: string, init?: RequestInit, timeoutMs = 12_000): Promise<unknown> {
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), timeoutMs);
  try {
    const r = await fetch(url, { ...init, signal: ctl.signal });
    if (!r.ok) throw Object.assign(new Error(`${url} → ${r.status}`), { status: r.status });
    return await r.json();
  } finally {
    clearTimeout(t);
  }
}

async function convs(path: string): Promise<Conversation[]> {
  const d = (await fetchJson(`${n8nBase()}${path}`)) as { conversations?: Conversation[] };
  return d.conversations ?? [];
}

async function vapi(): Promise<VapiCallLike[]> {
  const key = process.env.VAPI_PRIVATE_KEY;
  const assistantId = process.env.VAPI_ASSISTANT_ID;
  if (!key || !assistantId) throw new Error("Vapi not configured");
  const params = new URLSearchParams({ assistantId, limit: "50" });
  const d = await fetchJson(`https://api.vapi.ai/call?${params}`, {
    headers: { Authorization: `Bearer ${key}` },
  });
  return (Array.isArray(d) ? d : []) as VapiCallLike[];
}

export const Route = createFileRoute("/api/activity")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const since = new URL(request.url).searchParams.get("since") ?? undefined;
        const [wa, sms, viber, web, calls] = await Promise.allSettled([
          convs("/whatsapp-conversations"),
          convs("/lead-gen-sms-conversations"),
          convs("/lead-gen-viber-conversations"),
          fetchJson(WEBSITE_URL, { headers: { "Cache-Control": "no-cache" } }).then(
            (d) => (d as { sessions?: WebsiteSessionLike[] }).sessions ?? [],
          ),
          vapi(),
        ]);

        const events: AgentEvent[] = [];
        if (wa.status === "fulfilled")
          events.push(...deriveConversationEvents("whatsapp", wa.value));
        if (sms.status === "fulfilled") events.push(...deriveConversationEvents("sms", sms.value));
        if (viber.status === "fulfilled")
          events.push(...deriveConversationEvents("viber", viber.value));
        if (web.status === "fulfilled") events.push(...deriveWebsiteEvents(web.value));
        if (calls.status === "fulfilled") events.push(...deriveCallEvents(calls.value));

        for (const [name, r] of Object.entries({ wa, sms, viber, web, calls })) {
          if (r.status === "rejected")
            console.warn(`[activity] ${name} failed:`, (r.reason as Error)?.message);
        }

        const body = {
          events: finalizeEvents(events, 300, since),
          sources: {
            whatsapp: wa.status === "fulfilled",
            sms: sms.status === "fulfilled",
            viber: viber.status === "fulfilled",
            web: web.status === "fulfilled",
            voice: calls.status === "fulfilled",
          },
          generatedAt: new Date().toISOString(),
        };
        return new Response(JSON.stringify(body), {
          status: 200,
          headers: {
            "Content-Type": "application/json",
            "Cache-Control": "s-maxage=10, stale-while-revalidate=20",
          },
        });
      },
    },
  },
});
