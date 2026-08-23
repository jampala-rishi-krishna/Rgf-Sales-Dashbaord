import { createFileRoute } from "@tanstack/react-router";

const CLIENT_ID = process.env.GMAIL_CLIENT_ID!;
const CLIENT_SECRET = process.env.GMAIL_CLIENT_SECRET!;
const REFRESH_TOKEN = process.env.GMAIL_REFRESH_TOKEN!;
const BUSINESS_EMAIL = "martin@rareglobalfood.com";

let cachedToken: { token: string; expiresAt: number } | null = null;

async function getAccessToken(): Promise<string> {
  if (cachedToken && cachedToken.expiresAt > Date.now() + 30_000) {
    return cachedToken.token;
  }
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: CLIENT_ID,
      client_secret: CLIENT_SECRET,
      refresh_token: REFRESH_TOKEN,
      grant_type: "refresh_token",
    }),
  });
  if (!res.ok) {
    throw new Error(`Token refresh failed: ${res.status} ${await res.text()}`);
  }
  const data = (await res.json()) as { access_token: string; expires_in: number };
  cachedToken = { token: data.access_token, expiresAt: Date.now() + data.expires_in * 1000 };
  return data.access_token;
}

function decodeBase64Url(input: string): string {
  const normalized = input.replace(/-/g, "+").replace(/_/g, "/");
  return Buffer.from(normalized, "base64").toString("utf-8");
}

function extractBody(payload: any): string {
  if (!payload) return "";
  if (payload.mimeType === "text/html" && payload.body?.data) {
    return decodeBase64Url(payload.body.data);
  }
  if (payload.parts) {
    for (const part of payload.parts) {
      if (part.mimeType === "text/html") {
        const html = extractBody(part);
        if (html) return html;
      }
    }
    for (const part of payload.parts) {
      const nested = extractBody(part);
      if (nested) return nested;
    }
  }
  if (payload.mimeType === "text/plain" && payload.body?.data) {
    const text = decodeBase64Url(payload.body.data);
    const esc = text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
    return `<pre style="white-space:pre-wrap;font-family:inherit;">${esc}</pre>`;
  }
  return "";
}

function getHeader(headers: { name: string; value: string }[], name: string): string {
  return headers.find((h) => h.name.toLowerCase() === name.toLowerCase())?.value ?? "";
}

export const Route = createFileRoute("/api/gmail-thread")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const url = new URL(request.url);
        const to = url.searchParams.get("to");
        if (!to) {
          return new Response(JSON.stringify({ error: "Missing ?to= param" }), {
            status: 400,
            headers: { "Content-Type": "application/json" },
          });
        }

        try {
          const token = await getAccessToken();
          const authHeaders = { Authorization: `Bearer ${token}` };

          const q = encodeURIComponent(`{to:${to} from:${to}}`);
          const listRes = await fetch(
            `https://gmail.googleapis.com/gmail/v1/users/me/threads?q=${q}&maxResults=1`,
            { headers: authHeaders },
          );
          if (!listRes.ok) {
            throw new Error(`Thread search failed: ${listRes.status} ${await listRes.text()}`);
          }
          const listData = (await listRes.json()) as { threads?: { id: string }[] };
          const threadId = listData.threads?.[0]?.id;

          if (!threadId) {
            return new Response(JSON.stringify({ threadId: null, messages: [] }), {
              status: 200,
              headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
            });
          }

          const threadRes = await fetch(
            `https://gmail.googleapis.com/gmail/v1/users/me/threads/${threadId}?format=full`,
            { headers: authHeaders },
          );
          if (!threadRes.ok) {
            throw new Error(`Thread fetch failed: ${threadRes.status} ${await threadRes.text()}`);
          }
          const threadData = (await threadRes.json()) as { id: string; messages: any[] };

          const messages = (threadData.messages ?? []).map((m) => {
            const headers = m.payload?.headers ?? [];
            const from = getHeader(headers, "From");
            const toHeader = getHeader(headers, "To");
            const date = getHeader(headers, "Date");
            const subject = getHeader(headers, "Subject");
            const direction = from.toLowerCase().includes(BUSINESS_EMAIL) ? "outbound" : "inbound";
            return {
              id: m.id,
              from,
              to: toHeader,
              subject,
              date,
              direction,
              htmlBody: extractBody(m.payload),
              snippet: m.snippet ?? "",
            };
          });

          messages.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

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
