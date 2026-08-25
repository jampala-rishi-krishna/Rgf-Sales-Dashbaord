import { createFileRoute } from "@tanstack/react-router";
import { getGmailAccessToken, gmailFetch, getHeader, GMAIL_BUSINESS_EMAIL } from "@/lib/gmail-server";

const GMAIL_API_BASE = "https://gmail.googleapis.com/gmail/v1/users/me";
const THREAD_META_CHUNK_SIZE = 15;
const MAX_RETRIES_ON_429 = 2;

function chunk<T>(items: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < items.length; i += size) chunks.push(items.slice(i, i + size));
  return chunks;
}

// Fetches one thread's metadata, retrying with backoff on Gmail's 429 rate-limit
// response. Returns null (instead of throwing) if it never succeeds, so one
// rate-limited thread doesn't take down the whole batch.
async function fetchThreadMetaWithRetry(threadId: string, token: string): Promise<any | null> {
  const url = `${GMAIL_API_BASE}/threads/${threadId}?format=metadata&metadataHeaders=Subject&metadataHeaders=From&metadataHeaders=To&metadataHeaders=Date`;
  for (let attempt = 0; attempt <= MAX_RETRIES_ON_429; attempt++) {
    const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
    if (res.ok) return res.json();
    if (res.status === 429 && attempt < MAX_RETRIES_ON_429) {
      await new Promise((resolve) => setTimeout(resolve, 500 * (attempt + 1)));
      continue;
    }
    console.error(`[gmail-threads] giving up on thread ${threadId}: ${res.status} ${await res.text()}`);
    return null;
  }
  return null;
}

export const Route = createFileRoute("/api/gmail-threads")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const url = new URL(request.url);
        const maxResults = url.searchParams.get("maxResults") ?? "40";
        const pageToken = url.searchParams.get("pageToken") ?? undefined;

        try {
          const token = await getGmailAccessToken();

          const listQuery = new URLSearchParams({ maxResults, q: "-in:chats -in:draft" });
          if (pageToken) listQuery.set("pageToken", pageToken);

          const listData = await gmailFetch(`/threads?${listQuery.toString()}`, token);
          const threadStubs: { id: string }[] = listData.threads ?? [];

          // Fetch per-thread metadata in small concurrent batches rather than all at
          // once — Gmail's per-user rate limit rejects a single Promise.all over 100
          // simultaneous requests with 429s, which used to fail the entire response.
          const threads: any[] = [];
          for (const batch of chunk(threadStubs, THREAD_META_CHUNK_SIZE)) {
            const batchResults = await Promise.all(
              batch.map(async (stub) => {
                const meta = await fetchThreadMetaWithRetry(stub.id, token);
                if (!meta) return null;

                const messages: any[] = meta.messages ?? [];
                const last = messages[messages.length - 1];
                const headers = last?.payload?.headers;
                const from = getHeader(headers, "From");
                const to = getHeader(headers, "To");
                const subject = getHeader(headers, "Subject") || "(no subject)";
                const date = getHeader(headers, "Date");
                const direction = from.toLowerCase().includes(GMAIL_BUSINESS_EMAIL) ? "outbound" : "inbound";
                const isUnread = messages.some((m) => (m.labelIds ?? []).includes("UNREAD"));
                const isFlagged = messages.some((m: any) => (m.labelIds ?? []).includes("STARRED"));

                return {
                  threadId: stub.id,
                  subject,
                  from,
                  to,
                  date,
                  direction,
                  snippet: last?.snippet ?? "",
                  messageCount: messages.length,
                  isUnread,
                  isFlagged,
                };
              }),
            );
            threads.push(...batchResults.filter((t) => t !== null));
          }

          threads.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

          return new Response(
            JSON.stringify({ threads, nextPageToken: listData.nextPageToken ?? null }),
            { status: 200, headers: { "Content-Type": "application/json", "Cache-Control": "no-store" } },
          );
        } catch (err) {
          console.error("[gmail-threads] error:", err);
          return new Response(JSON.stringify({ error: "Failed to list Gmail threads" }), {
            status: 500,
            headers: { "Content-Type": "application/json" },
          });
        }
      },
    },
  },
});
