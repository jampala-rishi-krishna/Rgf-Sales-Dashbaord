# WhatsApp Section — Complete Line-by-Line Explanation

> **Scope:** Every file that powers the WhatsApp tab — from the Twilio API server
> proxy all the way to the rendered chat bubbles, conversation grouping logic, and
> how WhatsApp data feeds the Home dashboard KPI card and activity feed.

---

## Table of Contents

1. [End-to-End Data Flow](#1-end-to-end-data-flow)
2. [File: `src/routes/api/twilio-messages.ts`](#2-file-srcroutesapitwilio-messagests) — Server-side Twilio proxy
3. [File: `src/routes/_app.whatsapp.tsx`](#3-file-srcroutesappwhatsapptsx) — The WhatsApp Tab UI
4. [How WhatsApp Data Appears on the Home Dashboard](#4-how-whatsapp-data-appears-on-the-home-dashboard)
5. [Key Technical Concepts](#5-key-technical-concepts)
6. [Common Questions](#6-common-questions)

---

## 1. End-to-End Data Flow

```
Twilio (cloud SMS/WhatsApp service)
  • Stores every message sent or received through the business number
  • Exposes a REST API: GET /Accounts/<SID>/Messages.json
        │
        │  HTTP request with Basic Auth (SID + Token)
        ▼
src/routes/api/twilio-messages.ts  (runs on SERVER only)
  • Keeps credentials secret — never reaches the browser
  • Forwards PageSize=200 to get up to 200 recent messages
  • Relays raw JSON response back to the browser
        │
        │  JSON: { messages: [ { sid, from, to, body, direction, ... }, ... ] }
        ▼
useTwilio() hook in _app.whatsapp.tsx
  • TanStack Query caches result, refetches every 30 s
        │
        │  raw flat array of TwilioMsg objects
        ▼
conversations useMemo()
  • Filters out non-WhatsApp messages (keeps only whatsapp: prefixed numbers)
  • Groups messages by the OTHER party's phone number (strips your business number)
  • Sorts each thread chronologically (oldest first)
  • Sorts thread list by most-recent message (newest thread first)
  • Applies search filter if the user has typed in the search box
        │
        │  array of { phone, msgs[], last } conversation objects
        ▼
Left Panel — conversation list (phone, last message preview, timestamp, unread dot)
        │
        │  user clicks a conversation → activePhone state changes
        ▼
Right Panel — chat view
  • Red header bar (phone number + avatar)
  • Scrollable message bubbles
    - outbound (your team's messages) → right-aligned, brand red bg
    - inbound (customer messages)    → left-aligned, white bg
  • Read receipts (double-tick icons) on outbound messages
```

---

## 2. File: `src/routes/api/twilio-messages.ts`

This is a **TanStack Start server route** — it runs only in Node.js on the server,
never in the browser. Its entire purpose is to keep the Twilio credentials safe while
forwarding requests to the Twilio REST API.

---

### Credentials

```ts
const TWILIO_SID = process.env.TWILIO_ACCOUNT_SID;
const TWILIO_TOKEN = process.env.TWILIO_AUTH_TOKEN;
```

- **`TWILIO_SID`** — The Twilio Account SID. This is a public-ish identifier that appears
  in the Twilio Console URL and in every API request path. It starts with `AC`.
- **`TWILIO_TOKEN`** — The Twilio Auth Token. This is a **secret** — anyone with this
  can read or send messages on your Twilio account. Keeping it here (server-only code)
  means it never appears in the browser's network tab.

> Both values are loaded from `process.env` (populated from the gitignored `.env` file —
> see `.env.example` for the variable names) so they never appear in source code.

---

### Route Declaration

```ts
// Lines 6-7
export const Route = createFileRoute("/api/twilio-messages")({
  server: {
```

`createFileRoute("/api/twilio-messages")` registers this file as the route path
`/api/twilio-messages`. The `server: { ... }` block marks everything inside as
**server-only code** — the TanStack Start Vite plugin strips this from the
browser JavaScript bundle at build time. The browser only ever sees the fetch call
from `useTwilio()`, not the credentials or the Twilio URL.

---

### GET Handler

```ts
// Lines 9-10
GET: async ({ request }) => {
  const url = new URL(request.url);
  const pageSize = url.searchParams.get("PageSize") ?? "200";
```

- `request` is a standard Web API `Request` object
- `new URL(request.url)` parses the incoming URL to access query params
- `url.searchParams.get("PageSize") ?? "200"` — reads the `PageSize` param from
  the browser's request (e.g. `/api/twilio-messages?PageSize=200`). Falls back to
  `"200"` if not provided. This controls how many messages Twilio returns.

```ts
// Lines 12-13
const target = `https://api.twilio.com/2010-04-01/Accounts/${TWILIO_SID}/Messages.json?PageSize=${pageSize}`;
const auth = "Basic " + Buffer.from(`${TWILIO_SID}:${TWILIO_TOKEN}`).toString("base64");
```

**Building the Twilio API URL:**
- `https://api.twilio.com/2010-04-01/` — Twilio REST API base, versioned by date (`2010-04-01`
  is just the API version string, not a date of use)
- `/Accounts/${TWILIO_SID}/Messages.json` — endpoint to list all messages for this account
- `?PageSize=${pageSize}` — asks Twilio to return up to 200 messages per page

**Building the Basic Auth header:**
- Twilio uses HTTP Basic Authentication: `Authorization: Basic <base64(SID:TOKEN)>`
- `Buffer.from("SID:TOKEN")` creates a Node.js binary buffer from the string
- `.toString("base64")` encodes it as base64 (e.g. `"QUM3Yj...OTJm"`)
- `"Basic " + ...` prepends the scheme — this is the standard HTTP Basic Auth format

```ts
// Line 14
const res = await fetch(target, { headers: { Authorization: auth } });
```

Makes the actual server-to-Twilio HTTP request with the Authorization header.
This is a server-side `fetch` call (Node.js), completely invisible to the browser.

```ts
// Lines 15-18
const body = await res.text();
if (!res.ok) {
  console.error(`Twilio API error ${res.status}:`, body);
}
```

- `res.text()` reads the response body as raw text (the JSON string from Twilio)
- If Twilio returns an error (401 bad credentials, 429 rate limit, 500 error):
  - `!res.ok` is true (any HTTP status >= 300)
  - `console.error` writes the error to the **server terminal** (not the browser)
  - The error body is still relayed back to the browser so the UI can show a failure state

```ts
// Lines 19-22
return new Response(body, {
  status: res.status,
  headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
});
```

**Relays Twilio's response to the browser:**
- `body` — the raw JSON string from Twilio
- `status: res.status` — passes through Twilio's HTTP status exactly (200, 401, 500, etc.)
- `"Content-Type": "application/json"` — tells the browser to parse as JSON
- `"Cache-Control": "no-store"` — prevents the browser from caching messages;
  critical because new messages arrive in real time and must always be fresh

---

### What Twilio Returns

The Twilio `Messages.json` endpoint returns:
```json
{
  "messages": [
    {
      "sid": "SMxxxxxxxxxxxxxx",
      "from": "whatsapp:+14155238886",
      "to": "whatsapp:+639171234567",
      "body": "Hello! We'd love to offer you our premium seafood...",
      "direction": "outbound-api",
      "date_created": "2024-12-15T09:30:00Z",
      "date_sent": "2024-12-15T09:30:01Z",
      "status": "delivered"
    },
    {
      "sid": "SMxxxxxxxxxxxxxy",
      "from": "whatsapp:+639171234567",
      "to": "whatsapp:+14155238886",
      "body": "Yes, interested! What's the price for salmon?",
      "direction": "inbound",
      "date_created": "2024-12-15T10:15:00Z",
      "date_sent": null,
      "status": "received"
    }
  ],
  "page": 0,
  "page_size": 200,
  "num_pages": 1,
  ...
}
```

The `direction` field is the most important:
- `"outbound-api"` — your system sent this message via the Twilio API
- `"outbound-reply"` — your system replied via the Twilio console or another tool
- `"inbound"` — the customer sent this message to your WhatsApp number

---

## 3. File: `src/routes/_app.whatsapp.tsx`

The main WhatsApp tab component. It fetches raw messages from Twilio (via the proxy),
groups them into per-contact conversation threads, and renders a WhatsApp-style
two-pane chat interface.

---

### Imports

```tsx
// Lines 1-4
import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { Check, CheckCheck } from "lucide-react";
```

- `createFileRoute` — registers `/_app/whatsapp` as a route
- `useQuery` — TanStack Query for data fetching with auto-refresh
- `useMemo` — memoizes the expensive message-grouping computation
- `useState` — local state for search text and selected conversation
- `Check, CheckCheck` — Lucide icons for single-tick and double-tick read receipts
  (WhatsApp-style delivery/read indicators on outbound messages)

---

### Route Declaration

```tsx
// Lines 6-8
export const Route = createFileRoute("/_app/whatsapp")({
  component: WhatsAppTab,
});
```

Registers this file as `/_app/whatsapp`. The `_app` prefix means it renders inside
the layout shell (`_app.tsx`) which provides the sidebar and content area.

---

### `TwilioMsg` Interface

```tsx
// Lines 10-19
interface TwilioMsg {
  sid: string;         // Unique message ID: "SM3f4c..." — Twilio's primary key for a message
  from: string;        // Sender: "whatsapp:+14155238886" or "whatsapp:+639171234567"
  to: string;          // Recipient: same format
  body: string;        // The text content of the WhatsApp message
  direction: string;   // "inbound" | "outbound-api" | "outbound-reply"
  date_created: string;// ISO timestamp when Twilio received/created the message
  date_sent: string;   // ISO timestamp when the message was actually delivered (can be null)
  status: string;      // "queued" | "sent" | "delivered" | "read" | "received" | "failed"
}
```

This mirrors the shape of each object inside Twilio's `messages[]` array. TypeScript
uses this to give autocomplete and type safety when accessing message fields throughout
the component.

---

### Business Number Constants

```tsx
// Lines 21-25
const BIZ_NUMBERS = ["whatsapp:+14155238886", "+14155238886"];

function normalizeNumber(s: string) {
  return s.replace(/^whatsapp:/, "");
}
```

**`BIZ_NUMBERS`** — your Twilio WhatsApp sandbox or registered business number.
`+14155238886` is the Twilio WhatsApp sandbox number (shared by all Twilio test accounts).
Two formats are stored because Twilio may return the same number with or without the
`whatsapp:` prefix in different API responses.

**`normalizeNumber(s)`** — strips the `whatsapp:` prefix from any number string:
- `"whatsapp:+639171234567"` → `"+639171234567"`
- `"+639171234567"` → `"+639171234567"` (already clean, no change)

This normalization is used as the **conversation map key**, ensuring the same customer
phone number is always grouped into one thread regardless of how Twilio formats it
in `from`/`to` fields.

---

### `isBiz()` — Identify Your Own Messages

```tsx
// Lines 27-30
function isBiz(num: string | undefined) {
  if (!num) return false;
  return BIZ_NUMBERS.some((b) => normalizeNumber(num) === normalizeNumber(b));
}
```

Returns `true` if the given number is your business number (in any format).

- `if (!num) return false` — safely handles `undefined`/`null` (optional chaining guard)
- `BIZ_NUMBERS.some(...)` — checks if the number matches ANY of the stored formats
- Both sides are normalized before comparison, so:
  - `"whatsapp:+14155238886"` matches `"+14155238886"` ✓
  - `"whatsapp:+14155238886"` matches `"whatsapp:+14155238886"` ✓

This is used in two places:
1. To determine the "other" party in a conversation (the non-business number)
2. To determine message direction in the chat bubble (`out` flag)

---

### `useTwilio()` — Data Fetching Hook

```tsx
// Lines 32-43
function useTwilio() {
  return useQuery({
    queryKey: ["twilio-messages"],
    queryFn: async () => {
      const r = await fetch("/api/twilio-messages?PageSize=200");
      if (!r.ok) throw new Error("Twilio fetch failed");
      const d = await r.json();
      return (d.messages ?? []) as TwilioMsg[];
    },
    refetchInterval: 30000,
  });
}
```

- `queryKey: ["twilio-messages"]` — the global cache key. The Home tab uses a different
  key `["twilio"]` for its own copy; they don't share cache to avoid key conflicts.
- `queryFn` — fetches from the server proxy (NOT directly from Twilio — credentials stay hidden)
- `?PageSize=200` — requests up to 200 recent messages
- `if (!r.ok) throw new Error(...)` — any non-2xx status causes TanStack Query to set
  `isError = true` and display the error state in the UI
- `d.messages ?? []` — extracts just the `messages` array from Twilio's response object;
  falls back to empty array if the field is missing
- `as TwilioMsg[]` — TypeScript assertion that the array matches our interface
- `refetchInterval: 30000` — **auto-refreshes every 30 seconds** (faster than the
  60s used by Email/SMS, because WhatsApp replies are more time-sensitive)

---

### `WhatsAppTab` Component

```tsx
// Lines 45-48
function WhatsAppTab() {
  const { data, isLoading, error } = useTwilio();
  const [search, setSearch] = useState("");
  const [activePhone, setActivePhone] = useState<string | null>(null);
```

- `data` — `TwilioMsg[]` when loaded, `undefined` while loading
- `isLoading` — `true` only on the very first fetch (no cached data)
- `error` — non-null when `queryFn` threw an error
- `search` — current text in the search input box
- `activePhone` — the normalized phone number (`"+639171234567"`) of the currently
  selected conversation. `null` means nothing is explicitly selected; the first
  conversation auto-selects instead (see `active` derivation below).

---

### `conversations` — Grouping Messages into Threads

This is the most complex piece of the component. It transforms a flat list of
`TwilioMsg` objects into an array of per-contact conversation objects.

```tsx
// Lines 50-68
const conversations = useMemo(() => {
```

`useMemo` caches the result and only re-runs when `data` or `search` changes.
Grouping 200 messages on every render would be wasteful without memoization.

---

#### Step 1: Filter and Group by Contact

```tsx
  const map = new Map<string, TwilioMsg[]>();
  for (const m of data ?? []) {
    if (!m.from?.startsWith("whatsapp:") && !m.to?.startsWith("whatsapp:")) continue;
```

Creates an empty `Map` where:
- **key** = normalized phone number of the other party (`"+639171234567"`)
- **value** = array of all messages with that contact

The `continue` skips any message where neither `from` nor `to` starts with `"whatsapp:"`.
Twilio accounts can also send regular SMS, and those would be in the same `Messages.json`
response. This filter ensures only WhatsApp messages appear in this tab.

```tsx
    const other = isBiz(m.from) ? m.to : m.from;
```

Determines who the "other party" is (the customer, not your business):
- If `m.from` IS your business number → message is outbound → `other = m.to` (the customer)
- If `m.from` is NOT your business number → message is inbound → `other = m.from` (the customer)

This correctly handles all four cases:
| `from` | `to` | Direction | `other` |
|--------|------|-----------|---------|
| `whatsapp:+14155238886` (biz) | `whatsapp:+6391...` | outbound | `whatsapp:+6391...` |
| `whatsapp:+6391...` | `whatsapp:+14155238886` (biz) | inbound | `whatsapp:+6391...` |

```tsx
    if (!other) continue;
    const key = normalizeNumber(other);
    if (!map.has(key)) map.set(key, []);
    map.get(key)!.push(m);
  }
```

- Skips the message if `other` is somehow `undefined` or empty (defensive guard)
- `key = normalizeNumber(other)` — strips `"whatsapp:"` prefix so both `"whatsapp:+6391..."` and
  `"+6391..."` formats produce the same map key, preventing duplicate conversation threads
- `map.get(key)!.push(m)` — the `!` is a TypeScript non-null assertion; we just guaranteed
  the key exists via `map.set(key, [])`, so this is safe

---

#### Step 2: Sort and Shape Each Conversation

```tsx
  const convs = [...map.entries()].map(([phone, msgs]) => {
    msgs.sort((a, b) => (a.date_created ?? "").localeCompare(b.date_created ?? ""));
    const last = msgs[msgs.length - 1];
    return { phone, msgs, last };
  });
```

- `[...map.entries()]` — converts the Map to an iterable array of `[key, value]` pairs
- `.map(([phone, msgs]) => ...)` — destructures each entry
- `msgs.sort(...)` — sorts messages **chronologically (oldest first)** using ISO timestamp
  string comparison. ISO format (`2024-12-15T09:30:00Z`) sorts lexicographically correctly
  because year/month/day/hour/minute all appear left-to-right.
- `const last = msgs[msgs.length - 1]` — the most recent message in this thread
- Returns an object `{ phone, msgs, last }`:
  - `phone` — the normalized customer number
  - `msgs` — all messages, oldest first (used to render the chat bubbles)
  - `last` — the most recent message (used for the preview line and timestamp in the list)

---

#### Step 3: Sort Conversations by Most Recent

```tsx
  convs.sort((a, b) => (b.last.date_created ?? "").localeCompare(a.last.date_created ?? ""));
```

Sorts the conversation list so the **most recently active conversation appears first**
(descending order — `b` before `a`).

---

#### Step 4: Apply Search Filter

```tsx
  const q = search.toLowerCase();
  return q ? convs.filter((c) => c.phone.toLowerCase().includes(q) || c.last.body?.toLowerCase().includes(q)) : convs;
}, [data, search]);
```

If `search` is non-empty:
- Matches on `c.phone` — find by phone number
- OR matches on `c.last.body` — find conversations whose last message contains the search term
- `?.toLowerCase()` — optional chaining because `body` could be `null` (Twilio media messages have no text body)

If `search` is empty, returns all conversations unfiltered.

---

### Active Conversation Selection

```tsx
// Line 70
const active = conversations.find((c) => c.phone === activePhone) ?? conversations[0];
```

- Finds the conversation matching the currently selected `activePhone`
- `?? conversations[0]` — if `activePhone` is `null` (nothing clicked yet) OR the selected
  phone no longer exists in the list (e.g. filtered out by search), fall back to the
  **first conversation in the list** (most recently active one)

This means when the tab first loads, the most recent conversation is automatically shown
in the right panel without requiring the user to click.

---

### JSX — Outer Layout

```tsx
// Line 73
<div className="bg-white rounded-xl shadow-sm overflow-hidden grid grid-cols-1 md:grid-cols-[35%_65%]"
     style={{ height: "calc(100vh - 7rem - 1rem)" }}>
```

Two-column grid layout, identical structure to the Email and SMS tabs:
- `height: calc(100vh - 7rem - 1rem)` — fills the full viewport minus the navigation bar
- `grid-cols-[35%_65%]` — 35% left panel, 65% right panel on medium+ screens
- `overflow-hidden` — clips content at the rounded corners

---

### Left Panel — Conversation List

```tsx
// Line 74
<div className="border-r flex flex-col min-h-0" style={{ backgroundColor: "#FFEBCE" }}>
```

- `min-h-0` — **critical CSS fix**. CSS Grid items default to `min-height: auto`,
  which means the grid row would grow to fit ALL content rather than constraining
  it. `min-h-0` overrides this, allowing the `overflow-y-auto` list inside to scroll.
- Beige background (`#FFEBCE`)

```tsx
// Lines 75-77
<div className="px-4 py-3 border-b shrink-0">
  <div className="font-black text-lg" style={{ color: "#86000B" }}>WhatsApp</div>
</div>
```

The "WhatsApp" section header in brand red. `shrink-0` prevents it from being compressed
when the list is long — it always keeps its natural height.

```tsx
// Lines 78-81
<div className="p-3 border-b shrink-0">
  <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search conversations…"
    className="w-full px-3 py-2 text-sm rounded-md border border-gray-300 bg-white focus:outline-none" />
</div>
```

Search input. `shrink-0` keeps it visible even when the list below is very long.
`value={search}` + `onChange={setSearch}` makes this a controlled React input — every
keystroke updates `search`, which triggers `useMemo` to re-filter conversations instantly.

---

#### Conversation List Items

```tsx
// Lines 82-85
<div className="overflow-y-auto flex-1">
  {isLoading && <div className="p-4 text-sm text-gray-500">Loading…</div>}
  {error && <div className="p-4 text-sm text-red-600">Failed to load conversations.</div>}
  {!isLoading && conversations.length === 0 && <div className="p-4 text-sm text-gray-500">No conversations yet.</div>}
```

- `overflow-y-auto flex-1` — scrollable list that takes all remaining space
- Three conditional states: loading, error, empty (all mutually exclusive in practice)
- Error state is red (distinct from the gray loading/empty states)

```tsx
// Lines 86-103
{conversations.map((c) => {
  const sel = active?.phone === c.phone;
  const unread = c.msgs.some((m) => m.direction === "inbound");
```

`sel` — whether this conversation is currently active (for highlighting).
`unread` — `true` if ANY message in this thread is inbound (customer sent something).
Note: "unread" here means "has received a customer message" — not a true unread tracking
system (Twilio doesn't expose a read state per message from the customer's perspective).

```tsx
  return (
    <button key={c.phone} onClick={() => setActivePhone(c.phone)}
      className="w-full text-left px-4 py-3 border-b hover:bg-white"
      style={{ backgroundColor: sel ? "#FFFFFF" : "transparent" }}>
```

`key={c.phone}` — uses the phone number as the React key (unique per conversation).
Unlike the Email tab which uses array index, this uses a **stable identity key**,
which is better — if conversations re-sort after a refresh, React correctly preserves
DOM state for each conversation rather than re-mounting them.

`onClick={() => setActivePhone(c.phone)}` — sets the active conversation to this phone.

No `borderLeft` selection indicator here (unlike Email/SMS) — the WhatsApp tab uses
full `backgroundColor: "#FFFFFF"` to indicate selection, mimicking how WhatsApp Web looks.

```tsx
    <div className="flex items-baseline gap-2">
      <div className="font-bold text-sm truncate flex-1" style={{ color: "#1B2419" }}>{c.phone}</div>
      <div className="text-[10px] text-gray-500">{(c.last.date_created ?? "").slice(0, 16).replace("T", " ")}</div>
    </div>
```

First row: phone number (bold, dark) on the left, timestamp on the right.
`(c.last.date_created ?? "").slice(0, 16).replace("T", " ")` — formats an ISO timestamp:
- `"2024-12-15T09:30:00Z"` → slice(0,16) → `"2024-12-15T09:30"` → replace("T", " ") → `"2024-12-15 09:30"`
- Simple string manipulation — no `Date` object or locale formatting needed here

```tsx
    <div className="flex items-center gap-2 mt-0.5">
      <div className="text-xs text-gray-600 truncate flex-1">{c.last.body || "—"}</div>
      {unread && <span className="w-2 h-2 rounded-full" style={{ backgroundColor: "#86000B" }} />}
    </div>
```

Second row: last message preview (gray, truncated to one line) + optional red dot.
The red dot appears when the thread has inbound messages, functioning as a visual
"this customer has replied" indicator.

---

### Right Panel — Chat View

```tsx
// Line 107
<div className="flex flex-col min-h-0" style={{ backgroundColor: "#FFF8F0" }}>
```

Right panel: warm off-white background (`#FFF8F0`), flex column, `min-h-0` (same
grid fix as the left panel — prevents the grid row from expanding to fit all messages).

```tsx
// Lines 108-110
{!active ? (
  <div className="h-full flex items-center justify-center text-gray-400 text-sm">Select a conversation</div>
) : (
```

Shows the empty state only when there are truly no conversations at all
(empty data after loading, or no results from search). Because of the `?? conversations[0]`
fallback in the `active` derivation, this empty state is rarely reached in practice —
the first conversation auto-selects.

---

#### Chat Header Bar

```tsx
// Lines 112-122
<div className="px-5 py-3 flex items-center gap-3 shrink-0" style={{ backgroundColor: "#86000B" }}>
  <div className="w-9 h-9 rounded-full bg-white/20 flex items-center justify-center text-white font-bold">
    {active.phone.slice(-2)}
  </div>
  <div>
    <div className="text-white font-bold leading-tight">{active.phone}</div>
    <div className="text-white/80 text-xs flex items-center gap-1.5">
      <span className="w-2 h-2 rounded-full bg-green-400" /> online
    </div>
  </div>
</div>
```

Red header bar (`#86000B`) that stays fixed at the top while messages scroll below
(`shrink-0` prevents it from being compressed by the flex container).

**Avatar circle:** `active.phone.slice(-2)` takes the **last 2 digits** of the phone
number as an avatar abbreviation:
- `"+639171234567"` → `"67"` — a simple, unique-per-contact visual identifier
- `bg-white/20` — semi-transparent white background (20% opacity)

**"online" indicator:** A hardcoded green dot + "online" text — not a real presence
status from Twilio (WhatsApp doesn't expose live presence via API). It's a UI affordance
to make the chat feel live, consistent with the real-time 30s refresh cadence.

---

#### Message Bubbles

```tsx
// Lines 123
<div className="flex-1 min-h-0 overflow-y-auto p-6 space-y-3">
```

The scrollable message area:
- `flex-1` — takes all remaining height in the flex column (below the red header)
- `min-h-0` — allows `overflow-y-auto` to actually scroll (flex children default to
  `min-height: auto` which prevents scrolling without this override)
- `overflow-y-auto` — shows a scrollbar when messages overflow the panel height
- `space-y-3` — 12px vertical gap between each message bubble

```tsx
// Lines 124-125
{active.msgs.map((m) => {
  const out = m.direction !== "inbound" || isBiz(m.from);
```

Iterates over all messages in the active conversation (already sorted oldest-first).

**`out` flag — direction logic:**
```
m.direction !== "inbound"    → any outbound-api or outbound-reply message
        OR
isBiz(m.from)                → message where your number is the sender
                               (defensive fallback if direction field is wrong)
```

The `|| isBiz(m.from)` guard handles an edge case where Twilio might return an
inconsistent `direction` value — we double-check by looking at the actual `from` address.

```tsx
  return (
    <div key={m.sid} className={`flex ${out ? "justify-end" : "justify-start"}`}>
```

`key={m.sid}` — stable React key using Twilio's unique message SID.
`justify-end` for outbound (right-aligned), `justify-start` for inbound (left-aligned).

```tsx
      <div className="max-w-[70%]">
        <div className={`rounded-2xl px-3.5 py-2 text-sm leading-relaxed shadow-sm
          ${out ? "rounded-br-sm text-white" : "rounded-bl-sm bg-white"}`}
             style={out ? { backgroundColor: "#86000B" } : { color: "#1B2419" }}>
          {m.body}
        </div>
```

**Bubble styling:**

| | Outbound (your team) | Inbound (customer) |
|---|---|---|
| Alignment | Right (`justify-end`) | Left (`justify-start`) |
| Background | `#86000B` (brand red) | `white` |
| Text color | `white` | `#1B2419` (near-black) |
| Corner | `rounded-br-sm` (bottom-right sharp) | `rounded-bl-sm` (bottom-left sharp) |

The "sharp corner on the tail side" is the classic speech-bubble visual convention
used in WhatsApp, iMessage, etc. — it indicates who sent the message.

`max-w-[70%]` — bubbles never exceed 70% of the panel width, matching WhatsApp's
visual style and keeping long messages readable.

---

#### Read Receipt Icons

```tsx
// Lines 133-135
<div className={`text-[10px] text-gray-500 mt-0.5 flex items-center gap-1
  ${out ? "justify-end" : "justify-start"}`}>
  <span>{(m.date_created ?? "").slice(11, 16)}</span>
  {out && (m.status === "read"
    ? <CheckCheck className="w-3 h-3 text-blue-500" />
    : <CheckCheck className="w-3 h-3" />)}
</div>
```

Below each bubble, on the same side as the bubble:

**Timestamp:**
`m.date_created.slice(11, 16)` — extracts just the time portion from the ISO string:
- `"2024-12-15T09:30:00Z"` → slice(11, 16) → `"09:30"` — just `HH:MM`

**Read receipt (outbound only — `{out && ...}`):**
- `m.status === "read"` → `<CheckCheck>` in `text-blue-500` (blue ticks = read, like WhatsApp)
- Any other status (sent, delivered, etc.) → `<CheckCheck>` in default gray (delivered but not read)
- Inbound messages don't show ticks (customers don't see our read status)
- `Check` (single tick) is imported but not currently used — could indicate "sent" vs "delivered"

---

## 4. How WhatsApp Data Appears on the Home Dashboard

The Home tab (`src/routes/_app.index.tsx`) makes its own separate `useQuery` call
for WhatsApp data with a **different query key** (`["twilio"]` vs `["twilio-messages"]`).
These are two separate caches — intentional, since the Home tab and WhatsApp tab
may need to refresh at different times.

### KPI Card

```tsx
// _app.index.tsx lines 26-37
function useTwilio() {
  return useQuery({
    queryKey: ["twilio"],
    queryFn: async () => {
      const r = await fetch("/api/twilio-messages?PageSize=200");
      if (!r.ok) throw new Error("twilio");
      const d = await r.json();
      return (d.messages ?? []) as TwilioMsg[];
    },
    refetchInterval: 60000,   // Home tab refreshes every 60s (less urgent)
  });
}
```

```tsx
// _app.index.tsx line 70
{ label: "WhatsApp Messages", value: twilio.data?.length ?? 0, Icon: MessageCircle, ... }
```

The KPI card shows the **total raw message count** (not conversation count) — every
individual message sent or received across all conversations. Includes both inbound
and outbound messages.

### Activity Feed

```tsx
// _app.index.tsx lines 83-88
(twilio.data ?? []).forEach((m) => activity.push({
  ts: m.date_created,
  channel: "wa",
  icon: "📱",
  text: `WhatsApp ${m.direction.includes("inbound") ? "from" : "to"} ${normalizeNumber(m.from === BIZ_WA ? m.to : m.from)}`,
}));
```

Each WhatsApp message becomes an activity entry:
- `m.direction.includes("inbound") ? "from" : "to"` — `"from"` for customer messages, `"to"` for outbound
- `normalizeNumber(m.from === BIZ_WA ? m.to : m.from)` — extracts the customer number
  (same logic as `other` in the WhatsApp tab's conversation grouping, just inline)

### Chart

```tsx
// _app.index.tsx line 76
const waChart = groupByDate(twilio.data ?? [], (r) => r.date_created || r.date_sent);
```

Groups all WhatsApp messages by day, counting messages per day over the last 14 days.
Uses `date_created || date_sent` because inbound messages may have `date_sent = null`
while outbound messages reliably have both.

---

## 5. Key Technical Concepts

### Twilio Basic Auth
Twilio's REST API uses HTTP Basic Authentication with your Account SID as the
username and your Auth Token as the password:
```
Authorization: Basic base64("SID:TOKEN")
```
The server proxy handles this encoding via Node's `Buffer.from(...).toString("base64")`.
This never reaches the browser.

### CSS Grid + `min-h-0` Fix
Both panels (`left` and `right`) in the WhatsApp layout have `min-h-0`:
```
Grid container (fixed height via calc)
  ├── Left panel: flex flex-col min-h-0
  │     ├── Header: shrink-0
  │     ├── Search: shrink-0
  │     └── List: overflow-y-auto flex-1   ← scrolls
  └── Right panel: flex flex-col min-h-0
        ├── Header: shrink-0               ← stays fixed
        └── Messages: flex-1 min-h-0 overflow-y-auto  ← scrolls independently
```
Without `min-h-0` on the grid children, CSS Grid's default `min-height: auto` causes
each panel to grow to its natural content height, overflowing the page instead of scrolling.

### Message Grouping Key Stability
Using `normalizeNumber(other)` as the Map key (instead of the raw `other` string) is
the fix for a bug where the same customer might appear as two conversations — one keyed
by `"whatsapp:+6391..."` and one by `"+6391..."`. After normalization both produce the
same key `"+6391..."` and merge into one thread.

### Auto-Select First Conversation
```tsx
const active = conversations.find((c) => c.phone === activePhone) ?? conversations[0];
```
The `?? conversations[0]` fallback creates a "most recent conversation always shown"
behavior on first load, without requiring the user to click anything. This is the same
UX pattern as email clients (first unread is auto-opened).

### 30s vs 60s Refresh
WhatsApp uses `refetchInterval: 30000` (30 seconds) rather than the 60s used by
Email and SMS. The reasoning: a customer might send a WhatsApp reply within minutes
of receiving the outbound message, and a sales rep looking at the dashboard should see
the reply appear quickly without manually refreshing.

---

## 6. Common Questions

**Q: Why is a server proxy needed — can't the browser call Twilio directly?**
A: Twilio's API requires your Auth Token for every request. If the browser called
Twilio directly, the Auth Token would appear in the browser's network tab (visible to
anyone using DevTools), allowing anyone to read or send messages on your Twilio account.
The server proxy keeps the token server-side only.

**Q: What does `PageSize=200` mean — what happens if there are more than 200 messages?**
A: Twilio paginates results. `PageSize=200` fetches the 200 most recent messages in
one request. If there are more than 200, older messages won't appear in the dashboard.
The dashboard was designed for an active but not massive campaign — 200 messages covers
weeks of outreach for a small sales team. Pagination support could be added if needed.

**Q: Why does `useTwilio()` use `queryKey: ["twilio-messages"]` but the Home tab uses `["twilio"]`?**
A: They are deliberately separate caches. The WhatsApp tab refreshes every 30s; the
Home tab refreshes every 60s. If they shared a cache, the slower 60s interval would win
(TanStack Query uses the lowest `refetchInterval` when the same key is mounted in multiple
components), causing the WhatsApp tab's live-chat feel to be slower than intended.

**Q: What does `isBiz(m.from)` guard in `const out = m.direction !== "inbound" || isBiz(m.from)` actually protect against?**
A: Twilio's `direction` field can occasionally be wrong or missing — for example,
when a message is in `"queued"` state or when using certain Twilio features. The
`|| isBiz(m.from)` checks the actual `from` address as a fallback: if the sender IS
your business number, the message must be outbound regardless of what `direction` says.
This prevents a customer's message from ever being rendered as a red (outbound) bubble.

**Q: What's the `unread` indicator — does it mean the message was truly unread?**
A: No. `c.msgs.some((m) => m.direction === "inbound")` just means "this conversation
has received at least one inbound message from the customer." It's a "has reply" indicator,
not a true read/unread tracker. Twilio doesn't expose whether the dashboard operator
has seen a message.

**Q: Why does the right panel show "online" even though it's not real?**
A: WhatsApp's API (accessed via Twilio) doesn't expose a customer's presence/online
status — that information is private within WhatsApp's infrastructure. The "online"
label is a static UI label to give the chat panel a live, conversational feel. It
reflects the dashboard's refresh cadence (30s auto-fetch) rather than the customer's
actual WhatsApp status.

**Q: Why use `active.phone.slice(-2)` for the avatar?**
A: It's a simple, zero-dependency way to generate a unique-per-contact avatar abbreviation
without needing the customer's name. The last 2 digits of a Philippine mobile number
(e.g. `"67"` from `+639171234567`) visually distinguish contacts at a glance.
The Email tab has contact names available from the Google Sheet; the WhatsApp tab only
has phone numbers from Twilio, so this is the best available identifier.
