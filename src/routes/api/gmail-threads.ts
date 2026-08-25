import { createFileRoute } from "@tanstack/react-router";
import { getGmailAccessToken, gmailFetch, getHeader, GMAIL_BUSINESS_EMAIL } from "@/lib/gmail-server";

export const Route = createFileRoute("/api/gmail-threads")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const url = new URL(request.url);
        const maxResults = url.searchParams.get("maxResults") ?? "100";
        const pageToken = url.searchParams.get("pageToken") ?? undefined;

        try {
          const token = await getGmailAccessToken();

          const listQuery = new URLSearchParams({ maxResults, q: "-in:chats -in:draft" });
          if (pageToken) listQuery.set("pageToken", pageToken);

          const listData = await gmailFetch(`/threads?${listQuery.toString()}`, token);
          const threadStubs: { id: string }[] = listData.threads ?? [];

          const threads = await Promise.all(
            threadStubs.map(async (stub) => {
              const meta = await gmailFetch(
                `/threads/${stub.id}?format=metadata&metadataHeaders=Subject&metadataHeaders=From&metadataHeaders=To&metadataHeaders=Date`,
                token,
              );
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
