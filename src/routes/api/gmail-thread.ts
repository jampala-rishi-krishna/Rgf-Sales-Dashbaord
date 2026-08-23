import { createFileRoute } from "@tanstack/react-router";
import { getGmailAccessToken, gmailFetch, extractHtmlBody, getHeader, GMAIL_BUSINESS_EMAIL } from "@/lib/gmail-server";

export const Route = createFileRoute("/api/gmail-thread")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const url = new URL(request.url);
        const threadId = url.searchParams.get("id");
        if (!threadId) {
          return new Response(JSON.stringify({ error: "Missing ?id= param" }), {
            status: 400,
            headers: { "Content-Type": "application/json" },
          });
        }

        try {
          const token = await getGmailAccessToken();
          const threadData = await gmailFetch(`/threads/${threadId}?format=full`, token);

          const messages = (threadData.messages ?? []).map((m: any) => {
            const headers = m.payload?.headers ?? [];
            const from = getHeader(headers, "From");
            const to = getHeader(headers, "To");
            const date = getHeader(headers, "Date");
            const subject = getHeader(headers, "Subject");
            const direction = from.toLowerCase().includes(GMAIL_BUSINESS_EMAIL) ? "outbound" : "inbound";
            return {
              id: m.id,
              from,
              to,
              subject,
              date,
              direction,
              htmlBody: extractHtmlBody(m.payload),
              snippet: m.snippet ?? "",
            };
          });

          messages.sort((a: any, b: any) => new Date(a.date).getTime() - new Date(b.date).getTime());

          return new Response(JSON.stringify({ threadId, messages }), {
            status: 200,
            headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
          });
        } catch (err) {
          console.error("[gmail-thread] error:", err);
          return new Response(JSON.stringify({ error: "Failed to fetch Gmail thread" }), {
            status: 500,
            headers: { "Content-Type": "application/json" },
          });
        }
      },
    },
  },
});
