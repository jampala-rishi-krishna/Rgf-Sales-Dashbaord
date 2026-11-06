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

export function getHeader(
  headers: { name: string; value: string }[] | undefined,
  name: string,
): string {
  return (headers ?? []).find((h) => h.name.toLowerCase() === name.toLowerCase())?.value ?? "";
}

// ---------------------------------------------------------------------------
// Sending (requires the refresh token to carry gmail.send + gmail.modify scopes)
// ---------------------------------------------------------------------------

export const HUMAN_HANDLED_LABEL = "HUMAN-HANDLED";

export type GmailSendInput = {
  to: string;
  cc?: string;
  subject: string;
  html: string;
  threadId?: string;
  inReplyTo?: string;
};

async function gmailPost(path: string, token: string, body: unknown): Promise<any> {
  const res = await fetch(`https://gmail.googleapis.com/gmail/v1/users/me${path}`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`Gmail API POST ${path} failed: ${res.status} ${await res.text()}`);
  return res.json();
}

function encodeHeaderWord(value: string): string {
  // RFC 2047 encoded-word for non-ASCII header values (subjects with emoji / ñ etc.)
  // eslint-disable-next-line no-control-regex
  if (/^[\x00-\x7F]*$/.test(value)) return value;
  return `=?UTF-8?B?${Buffer.from(value, "utf-8").toString("base64")}?=`;
}

function stripCrlf(v: string): string {
  return v.replace(/[\r\n]+/g, " ").trim();
}

function toBase64Url(input: string): string {
  return Buffer.from(input, "utf-8")
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

/** Builds an RFC 2822 HTML message and returns it base64url-encoded for `users.messages.send`. */
export function buildRawMime(opts: {
  to: string;
  cc?: string;
  subject: string;
  html: string;
  inReplyTo?: string;
  references?: string;
}): string {
  const bodyB64 = Buffer.from(opts.html, "utf-8")
    .toString("base64")
    .replace(/.{1,76}/g, "$&\r\n");
  const headers = [
    `From: Martin Reyes <${GMAIL_BUSINESS_EMAIL}>`,
    `To: ${stripCrlf(opts.to)}`,
    opts.cc ? `Cc: ${stripCrlf(opts.cc)}` : null,
    `Subject: ${encodeHeaderWord(stripCrlf(opts.subject))}`,
    opts.inReplyTo ? `In-Reply-To: ${stripCrlf(opts.inReplyTo)}` : null,
    opts.references ? `References: ${stripCrlf(opts.references)}` : null,
    "MIME-Version: 1.0",
    'Content-Type: text/html; charset="UTF-8"',
    "Content-Transfer-Encoding: base64",
  ].filter(Boolean);
  return toBase64Url(`${headers.join("\r\n")}\r\n\r\n${bodyB64}`);
}

/** Returns the id of a user label, creating it if missing. */
export async function ensureGmailLabel(name: string, token: string): Promise<string> {
  const list = await gmailFetch("/labels", token);
  const found = (list.labels ?? []).find(
    (l: any) => String(l.name).toLowerCase() === name.toLowerCase(),
  );
  if (found) return found.id;
  const created = await gmailPost("/labels", token, {
    name,
    labelListVisibility: "labelShow",
    messageListVisibility: "show",
  });
  return created.id;
}

/**
 * Sends an HTML email (optionally as a reply in an existing thread) and tags the
 * thread with HUMAN-HANDLED. When replying without an explicit inReplyTo, the
 * last message's Message-ID/References are looked up so Gmail and the
 * recipient's client keep the conversation threaded.
 */
export async function sendGmailMessage(
  input: GmailSendInput,
): Promise<{ id: string; threadId: string; labeled: boolean }> {
  const token = await getGmailAccessToken();
  let inReplyTo = input.inReplyTo;
  let references = input.inReplyTo;

  if (input.threadId) {
    try {
      const meta = await gmailFetch(
        `/threads/${encodeURIComponent(input.threadId)}?format=metadata&metadataHeaders=Message-ID&metadataHeaders=References`,
        token,
      );
      const msgs: any[] = meta.messages ?? [];
      const last = msgs[msgs.length - 1];
      const lastId = getHeader(last?.payload?.headers, "Message-ID");
      const lastRefs = getHeader(last?.payload?.headers, "References");
      if (!inReplyTo) inReplyTo = lastId || undefined;
      const target = inReplyTo ?? lastId;
      references = [lastRefs, target].filter(Boolean).join(" ").trim() || undefined;
    } catch (err) {
      console.error("[gmail-send] could not read thread headers:", err);
    }
  }

  const raw = buildRawMime({ ...input, inReplyTo, references });
  const sent = await gmailPost(
    "/messages/send",
    token,
    input.threadId ? { raw, threadId: input.threadId } : { raw },
  );

  let labeled = false;
  try {
    const labelId = await ensureGmailLabel(HUMAN_HANDLED_LABEL, token);
    await gmailPost(`/threads/${encodeURIComponent(sent.threadId)}/modify`, token, {
      addLabelIds: [labelId],
    });
    labeled = true;
  } catch (err) {
    console.error("[gmail-send] failed to add HUMAN-HANDLED label:", err);
  }
  return { id: sent.id, threadId: sent.threadId, labeled };
}
