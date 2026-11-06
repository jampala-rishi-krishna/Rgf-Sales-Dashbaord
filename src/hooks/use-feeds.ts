// Shared feed hooks. Every tab/home/CRM/campaigns uses these so query keys are shared & cached once.
import { getJson, usePolling } from "@/hooks/use-polling";
import { isTestConversation, type Conversation } from "@/lib/channels";

export type Feed<T> = { connected: boolean; items: T[] };

async function convFeed(url: string): Promise<Feed<Conversation>> {
  const r = await fetch(url, { credentials: "include" });
  if (r.status === 404) return { connected: false, items: [] };
  if (!r.ok) throw new Error(`${url} failed (${r.status})`);
  const d = await r.json();
  const items = ((d.conversations ?? []) as Conversation[]).filter((c) => !isTestConversation(c));
  return { connected: d.connected !== false, items };
}

export const useWhatsAppFeed = (ms = 30_000) => usePolling(["whatsapp-conversations"], () => convFeed("/api/whatsapp-conversations"), ms);
export const useSmsFeed = (ms = 30_000) => usePolling(["sms-conversations"], () => convFeed("/api/sms-conversations"), ms);
export const useViberFeed = (ms = 30_000) => usePolling(["viber-conversations"], () => convFeed("/api/viber-conversations"), ms);

// Website + Vapi shapes are defined in their own route files; kept loose here.
export const useWebsiteFeed = (ms = 60_000) =>
  usePolling(["website-chat-sessions"], async () => ((await getJson<{ sessions?: unknown[] }>("/api/website-chat-sessions")).sessions ?? []) as Record<string, unknown>[], ms);
export const useVapiFeed = (ms = 60_000) =>
  usePolling(["vapi", 100], async () => (await getJson<unknown[]>("/api/vapi-calls?limit=100")) as Record<string, unknown>[], ms);
