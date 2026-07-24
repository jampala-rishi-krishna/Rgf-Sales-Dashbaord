// Client-side API fetch utilities replacing SSR server handlers for static SPA deployment

const VAPI_PRIVATE_KEY = import.meta.env.VITE_VAPI_PRIVATE_KEY;
const ASSISTANT_ID = import.meta.env.VITE_VAPI_ASSISTANT_ID;
const N8N_BASE_URL = import.meta.env.VITE_N8N_BASE_URL;

export async function fetchVapiCalls(limit = "100") {
  const target = `https://api.vapi.ai/call?assistantId=${ASSISTANT_ID}&limit=${limit}`;
  const res = await fetch(target, {
    headers: { Authorization: `Bearer ${VAPI_PRIVATE_KEY}` },
  });
  if (!res.ok) {
    const errText = await res.text();
    console.error("Vapi error:", errText);
    throw new Error(`Vapi fetch failed (${res.status})`);
  }
  const json = await res.json();
  return Array.isArray(json) ? json : (json.data ?? json.calls ?? []);
}

export async function fetchWhatsAppConversations() {
  const target = `${N8N_BASE_URL}/whatsapp-conversations`;
  const res = await fetch(target);
  if (!res.ok) throw new Error("WhatsApp fetch failed");
  const d = await res.json();
  return d.conversations ?? [];
}

export async function fetchGmailEmail(to: string) {
  const target = `${N8N_BASE_URL}/fetch-sent-email?to=${encodeURIComponent(to)}`;
  const res = await fetch(target);
  if (!res.ok) throw new Error("Gmail fetch failed");
  return await res.json();
}

export async function fetchEmailConversation(to: string) {
  const target = `${N8N_BASE_URL}/email-conversation-thread?email=${encodeURIComponent(to)}`;
  const res = await fetch(target);
  if (!res.ok) throw new Error("Email conversation fetch failed");
  return await res.json();
}
