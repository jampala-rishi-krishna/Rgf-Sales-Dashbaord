// Server-only Gmail API helpers. Never import this from client-side code
// (it reads process.env secrets and has no business being in the browser bundle).

const CLIENT_ID = process.env.GMAIL_CLIENT_ID!;
const CLIENT_SECRET = process.env.GMAIL_CLIENT_SECRET!;
const REFRESH_TOKEN = process.env.GMAIL_REFRESH_TOKEN!;
export const GMAIL_BUSINESS_EMAIL = "martin@rareglobalfood.com";

let cachedToken: { token: string; expiresAt: number } | null = null;

export async function getGmailAccessToken(): Promise<string> {
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
    throw new Error(`Gmail token refresh failed: ${res.status} ${await res.text()}`);
  }
  const data = (await res.json()) as { access_token: string; expires_in: number };
  cachedToken = { token: data.access_token, expiresAt: Date.now() + data.expires_in * 1000 };
  return data.access_token;
}

export async function gmailFetch(path: string, token: string): Promise<any> {
  const res = await fetch(`https://gmail.googleapis.com/gmail/v1/users/me${path}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) {
    throw new Error(`Gmail API ${path} failed: ${res.status} ${await res.text()}`);
  }
  return res.json();
}

export function decodeBase64Url(input: string): string {
  const normalized = input.replace(/-/g, "+").replace(/_/g, "/");
  return Buffer.from(normalized, "base64").toString("utf-8");
}

export function extractHtmlBody(payload: any): string {
  if (!payload) return "";
  if (payload.mimeType === "text/html" && payload.body?.data) {
    return decodeBase64Url(payload.body.data);
  }
  if (payload.parts) {
    for (const part of payload.parts) {
      if (part.mimeType === "text/html") {
        const html = extractHtmlBody(part);
        if (html) return html;
      }
    }
    for (const part of payload.parts) {
      const nested = extractHtmlBody(part);
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

export function getHeader(headers: { name: string; value: string }[] | undefined, name: string): string {
  return (headers ?? []).find((h) => h.name.toLowerCase() === name.toLowerCase())?.value ?? "";
}
