# Email Section — Complete Line-by-Line Explanation

> **Scope:** Every file that touches the Email tab, from the Google Sheet data source all the way to the rendered HTML body fetched from Gmail via n8n.

---

## Table of Contents

1. [End-to-End Data Flow](#1-end-to-end-data-flow)
2. [File: `src/lib/sheets.ts`](#2-file-srclibsheetsts) — Google Sheet connection & row types
3. [File: `src/routes/api/gmail-email.ts`](#3-file-srcroutesapigmail-emailts) — Server-side Gmail proxy
4. [File: `src/routes/_app.email.tsx`](#4-file-srcroutesappemailtsx) — The Email Tab UI
5. [File: `src/lib/email-template.ts`](#5-file-srclibemail-templatets) — Fallback HTML template (legacy)
6. [How Emails Appear on the Home Dashboard](#6-how-emails-appear-on-the-home-dashboard)
7. [Key Technical Concepts](#7-key-technical-concepts)
8. [Common Questions](#8-common-questions)

---

## 1. End-to-End Data Flow

```
Google Sheets (Email "Sent Log" tab)
        │
        │  CSV over public gviz/tq URL
        ▼
fetchSheet() in sheets.ts
  • PapaParse converts CSV text → JS objects
  • Keys normalized: "Company Name" → "Company_Name"
        │
        │  array of EmailRow objects
        ▼
useQuery(["emails"]) in _app.email.tsx
  • TanStack Query caches result, re-fetches every 60 s
        │
        │  rows array passed to component state
        ▼
Left Panel — Email list (company, recipient, subject, date)
        │
        │  user clicks a row → "selected" state changes
        ▼
useEffect triggers fetch → /api/gmail-email?to=<email>
        │
        │  server route in api/gmail-email.ts
        │  proxies request to n8n webhook
        ▼
n8n Webhook  https://rareglobalfood.app.n8n.cloud/webhook/fetch-sent-email
  • n8n queries Gmail for messages sent to that address
  • returns { "htmlBody": "<html>…</html>" }
        │
        │  response relayed back to browser
        ▼
Right Panel — Renders real Gmail HTML body (dangerouslySetInnerHTML)
```

---

## 2. File: `src/lib/sheets.ts`

This file is the **single data access layer** for the whole dashboard. It handles
Google Sheets CSV fetching, key normalization, and TypeScript row interfaces.

```ts
// Line 1
import Papa from "papaparse";
```
`papaparse` is a CSV parsing library. It turns raw CSV text (with headers and rows)
into an array of JavaScript objects, using the first row as keys.

```ts
// Line 3
export const EMAIL_SHEET_ID = "167X8mfQSLCZU65XlMsGF1vG2qJdyeDY2rLvH_f9XMDk";
```
This is the Google Sheet ID taken from the sheet's URL:
`https://docs.google.com/spreadsheets/d/<THIS_PART>/edit`
It is the **Email Sent Log** sheet.

```ts
// Line 4
export const SMS_SHEET_ID = "1ofyEh14RUYOSFJzBJfAqc9FVlhp9eQn51BSTx_MKEgA";
```
Different sheet ID for SMS — kept here so all sheet IDs live in one place.

---

### `csvUrl()` — Build the Public CSV Export URL

```ts
// Lines 6-8
export function csvUrl(sheetId: string, tab: string) {
  return `https://docs.google.com/spreadsheets/d/${sheetId}/gviz/tq?tqx=out:csv&sheet=${encodeURIComponent(tab)}`;
}
```

Google Sheets exposes a **Visualization Query API** (`gviz/tq`).
- `tqx=out:csv` — tells Google to respond with plain CSV instead of JSON
- `sheet=Sent+Log` — selects the tab named "Sent Log"
- `encodeURIComponent(tab)` — URL-encodes spaces in the tab name (e.g. "Sent Log" → "Sent%20Log")

This URL works **without authentication** as long as the sheet is shared
("Anyone with the link can view"). No Google API key needed.

---

### `fetchSheet<T>()` — Fetch and Parse a Sheet Tab

```ts
// Lines 10-28
export async function fetchSheet<T = Record<string, string>>(sheetId: string, tab: string): Promise<T[]> {
```
A **generic** async function. `<T>` is the row interface you pass in (e.g. `EmailRow`).
TypeScript will type-check the returned rows against it.

```ts
  const res = await fetch(csvUrl(sheetId, tab));
```
Makes an HTTP GET request to the Google Sheets gviz URL.
`fetch` is the browser/Node built-in HTTP client. No third-party HTTP library needed.

```ts
  if (!res.ok) throw new Error(`Sheet fetch failed: ${res.status}`);
```
If Google returns a non-2xx status (e.g. 403 sheet is private, 404 wrong ID),
throw immediately. TanStack Query catches this and marks `isError = true`.

```ts
  const text = await res.text();
```
Read the response body as raw text — the CSV string, e.g.:
```
"Date Sent","Time Sent","Company Name","Email Sent To",...
"2024-12-01","09:00","Jollibee","buyer@jollibee.com",...
```

```ts
  const parsed = Papa.parse<Record<string, string>>(text, { header: true, skipEmptyLines: true });
```
- `header: true` — first CSV row becomes object keys: `{ "Date Sent": "2024-12-01", ... }`
- `skipEmptyLines: true` — ignore blank rows at end of sheet
- Returns `{ data: [...], errors: [...] }` — we only use `parsed.data`

```ts
  const normalized = parsed.data.map((row) => {
    const clean: Record<string, string> = {};
    for (const [key, val] of Object.entries(row)) {
      clean[key.trim().replace(/\s+/g, "_")] = val;
    }
    return clean;
  });
```
**This is a critical normalization step.** Google Sheets column headers often
have spaces: `"Company Name"`, `"Date Sent"`, `"Email Sent To"`.
But the code accesses row data with underscore keys: `r.Company_Name`, `r.Date_Sent`.

For every key:
- `.trim()` — strips leading/trailing spaces (invisible characters from copy-paste)
- `.replace(/\s+/g, "_")` — replaces **any whitespace** (single space, multiple spaces, tabs) with `_`

So `"Company Name"` → `"Company_Name"`, `"Email Sent To"` → `"Email_Sent_To"`.
Now the TypeScript interfaces match perfectly, regardless of how the sheet header is typed.

```ts
  return normalized as T[];
```
Cast the normalized rows to the generic type `T` that was passed in.
TypeScript trusts us here — we're asserting that the sheet's columns match the interface.

---

### `EmailRow` Interface — Shape of a Single Email Log Row

```ts
// Lines 30-42
export interface EmailRow {
  Date_Sent: string;       // "2024-12-01" — date the email was sent
  Time_Sent: string;       // "09:00:00"   — time of send
  Lead_ID: string;         // Internal lead reference ID
  Company_Name: string;    // "Jollibee Food Corp" — the target company
  Contact_Name: string;    // "Maria Santos" — the person who was emailed
  Email_Sent_To: string;   // "buyer@jollibee.com" — the recipient's email address
  Product_Offered: string; // "Premium Salmon, Tuna Belly" — what product was pitched
  Channel: string;         // "Email" — always "Email" in this sheet
  Email_Subject: string;   // "Special Offer on Premium Seafood"
  Status: string;          // "Sent", "Replied", "Bounced", etc.
  Gmail_Message_ID: string;// The unique Gmail thread/message ID (e.g. "18e3c5d2a12b...")
}
```

Every field maps directly to a Google Sheets column. The `Gmail_Message_ID` field
is especially important — it uniquely identifies the email in Gmail and is used
for tracking and could be used to thread replies.

---

## 3. File: `src/routes/api/gmail-email.ts`

This is a **TanStack Start server route** — code that runs only on the server (Node.js),
never in the browser. It acts as a secure **proxy** between the browser and the n8n webhook.

```ts
// Line 1
import { createFileRoute } from "@tanstack/react-router";
```
TanStack Router's file-based routing. Even API routes use this to declare themselves.
TanStack Start's Vite plugin reads every file in `src/routes/` at build time and
auto-generates `routeTree.gen.ts` to register all routes — including API routes.

```ts
// Line 3
const N8N_WEBHOOK_URL = "https://rareglobalfood.app.n8n.cloud/webhook/fetch-sent-email";
```
The n8n webhook URL for the "fetch sent email" workflow. This workflow:
1. Receives `?to=<email>` as a query parameter
2. Searches Gmail for emails sent to that address
3. Returns `{ "htmlBody": "<html>…the actual email body…</html>" }`

Keeping this URL server-side means if the webhook ever needs authentication headers,
they stay hidden from the browser's network tab.

```ts
// Lines 5-6
export const Route = createFileRoute("/api/gmail-email")({
  server: {
```
`server: { ... }` is the TanStack Start syntax for defining server-only handlers.
Code inside this block never ships to the browser bundle.
The route path `/api/gmail-email` is what the browser calls.

```ts
    handlers: {
      GET: async ({ request }) => {
```
`handlers.GET` — this function runs when the browser sends `GET /api/gmail-email?to=...`.
`request` is a standard Web API `Request` object — same API as `fetch`'s Request.

```ts
        const url = new URL(request.url);
        const to = url.searchParams.get("to");
```
Parse the incoming URL to extract the `to` query parameter.
`new URL(request.url)` gives access to `.searchParams`, `.pathname`, etc.
`url.searchParams.get("to")` reads the email address the client passed.

```ts
        if (!to) {
          return new Response(JSON.stringify({ error: "Missing ?to= param" }), {
            status: 400,
            headers: { "Content-Type": "application/json" },
          });
        }
```
Input validation. If no `to` param was provided, immediately return a
`400 Bad Request` with a JSON error body. This prevents a useless request to n8n.

```ts
        const n8nUrl = `${N8N_WEBHOOK_URL}?to=${encodeURIComponent(to)}`;
```
Build the n8n webhook URL. `encodeURIComponent(to)` ensures special characters in
email addresses (e.g. `+`, `@`) are percent-encoded properly:
`buyer+test@company.co.uk` → `buyer%2Btest%40company.co.uk`

```ts
        try {
          const res = await fetch(n8nUrl);
          const body = await res.text();
          console.log(`[gmail-email] to=${to} status=${res.status}`);
```
Calls the n8n webhook from the server. `await res.text()` reads the raw response body.
The `console.log` writes to the **server terminal** (not the browser console) —
useful for debugging when checking the dev server logs.

```ts
          return new Response(body, {
            status: res.status,
            headers: {
              "Content-Type": "application/json",
              "Cache-Control": "no-store",
            },
          });
```
**Relay** n8n's response directly back to the browser:
- `body` — the raw JSON string from n8n (e.g. `{"htmlBody":"<div>…</div>"}`)
- `status: res.status` — passes through n8n's HTTP status (200, 404, 500, etc.)
- `"Content-Type": "application/json"` — tells the browser to parse as JSON
- `"Cache-Control": "no-store"` — prevents browser from caching email bodies
  (important because the email content could change if n8n data updates)

```ts
        } catch (err) {
          console.error("[gmail-email] fetch error:", err);
          return new Response(JSON.stringify({ error: "Failed to fetch email" }), {
            status: 500,
            headers: { "Content-Type": "application/json" },
          });
        }
```
If the server-to-n8n request itself throws (network error, n8n is down, DNS failure),
catch it, log the error, and return a `500 Internal Server Error` to the browser.
The browser's `useEffect` then sets `emailError` state, showing a red error box.

---

## 4. File: `src/routes/_app.email.tsx`

The main Email tab component. This is where all the pieces come together into a
two-pane layout: email list on the left, email detail on the right.

---

### Imports

```tsx
// Lines 1-4
import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { fetchSheet, EMAIL_SHEET_ID, type EmailRow } from "@/lib/sheets";
```

- `createFileRoute` — registers this file as the `/_app/email` route
- `useQuery` — TanStack Query hook for data fetching with caching
- `useEffect` — React hook to run side effects (the Gmail fetch) after render
- `useMemo` — React hook to memoize expensive computations (sorting + filtering)
- `useState` — React hook for local component state
- `fetchSheet, EMAIL_SHEET_ID, EmailRow` — data fetching utilities from sheets.ts

---

### Route Declaration

```tsx
// Lines 6-8
export const Route = createFileRoute("/_app/email")({
  component: EmailTab,
});
```
Declares this file as the route `/_app/email`. The `_app` prefix means it renders
inside the `_app.tsx` layout (which includes the sidebar). So the full rendered path
is: Layout (sidebar + content area) → EmailTab component.

---

### EmailTab Component — Top Section

```tsx
// Lines 10-15
function EmailTab() {
  const { data, isLoading } = useQuery({
    queryKey: ["emails"],
    queryFn: () => fetchSheet<EmailRow>(EMAIL_SHEET_ID, "Sent Log"),
    refetchInterval: 60000,
  });
```

- `queryKey: ["emails"]` — the cache key. Any other component using `["emails"]` shares
  this same cached data (the Home page KPI uses this too — no duplicate fetch).
- `queryFn` — the function that fetches data. Calls `fetchSheet` with the Email Sheet ID
  and tab name `"Sent Log"`.
- `refetchInterval: 60000` — TanStack Query automatically re-runs `queryFn` every
  60,000 ms (60 seconds), keeping the list live without a manual refresh.
- `data` — the `EmailRow[]` array when loaded, `undefined` while loading
- `isLoading` — `true` during the very first fetch (no cached data yet)

---

### Search State

```tsx
// Lines 16-17
  const [search, setSearch] = useState("");
  const [selectedIdx, setSelectedIdx] = useState<number | null>(null);
```

- `search` — current text in the search box (empty string by default)
- `selectedIdx` — the index of the currently selected email row (`null` = nothing selected)
  Using an **index** rather than the row object itself ensures stability when rows change.

---

### Sorting and Filtering with `useMemo`

```tsx
// Lines 19-28
  const rows = useMemo(() => {
    const sorted = [...(data ?? [])].sort((a, b) =>
      (`${b.Date_Sent} ${b.Time_Sent}`).localeCompare(`${a.Date_Sent} ${a.Time_Sent}`)
    );
    const q = search.toLowerCase();
    if (!q) return sorted;
    return sorted.filter((r) =>
      [r.Company_Name, r.Email_Sent_To, r.Email_Subject, r.Contact_Name].join(" ").toLowerCase().includes(q)
    );
  }, [data, search]);
```

`useMemo` only re-runs when `data` or `search` changes — prevents unnecessary work on every render.

**Sorting step:**
- `[...(data ?? [])]` — copy the array (never mutate the cached TanStack Query data)
- `.sort((a, b) => ...)` — sorts newest-first by concatenating date + time strings
- `"2024-12-15 14:30"` vs `"2024-11-01 09:00"` — `localeCompare` works correctly
  because the date format `YYYY-MM-DD HH:MM` sorts lexicographically in the same order as chronologically

**Filtering step:**
- `q = search.toLowerCase()` — case-insensitive comparison
- `[...].join(" ").toLowerCase().includes(q)` — concatenates all searchable fields
  into one string, then checks if the search term appears anywhere in it
- Searchable fields: Company Name, Recipient Email, Subject, Contact Name

---

### Selected Row Derivation

```tsx
// Line 30
  const selected = selectedIdx !== null ? rows[selectedIdx] : null;
```

Derives the currently selected `EmailRow` from the index. If `selectedIdx` is `null`
(nothing clicked yet), `selected` is `null` and the right panel shows "Select an email to view".

---

### Gmail Fetch State

```tsx
// Lines 32-34
  const [realEmailHtml, setRealEmailHtml] = useState<string | null>(null);
  const [emailLoading, setEmailLoading] = useState(false);
  const [emailError, setEmailError] = useState<string | null>(null);
```

Three pieces of state for the Gmail body fetch:
- `realEmailHtml` — the actual HTML string returned by n8n (the real email body)
- `emailLoading` — `true` while waiting for n8n response (shows loading message)
- `emailError` — error message string if the fetch fails (shows red error box)

---

### `useEffect` — Fetch Gmail Body When Selection Changes

```tsx
// Lines 36-65
  useEffect(() => {
    if (!selected) {
      setRealEmailHtml(null);
      setEmailError(null);
      return;
    }
```
If no email is selected (user clicked away or list cleared), reset both state values
and return early — no fetch needed.

```tsx
    const to = selected.Email_Sent_To;
    if (!to) {
      setRealEmailHtml(null);
      setEmailError("No recipient email on record.");
      return;
    }
```
Read the recipient email address from the selected row. If the sheet row has an
empty `Email_Sent_To` column (shouldn't happen, but defensive), show an error
instead of making a fetch with an empty `to` parameter.

```tsx
    setEmailLoading(true);
    setRealEmailHtml(null);
    setEmailError(null);
```
Before starting the fetch:
- Show loading state
- Clear any previous email body (from the previously selected row)
- Clear any previous error

```tsx
    fetch(`/api/gmail-email?to=${encodeURIComponent(to)}`)
```
Calls the server-side proxy route at `/api/gmail-email`.
`encodeURIComponent(to)` ensures email addresses with `+` or `@` are safe in a URL.
For example: `buyer@jollibee.com` → `/api/gmail-email?to=buyer%40jollibee.com`

```tsx
      .then((r) => r.json())
```
Parse the response body as JSON. The server returns `{ "htmlBody": "..." }` on success,
`{ "error": "..." }` on failure.

```tsx
      .then((data) => {
        if (data.htmlBody) {
          setRealEmailHtml(data.htmlBody);
        } else {
          setEmailError("Email body not found in Gmail.");
        }
      })
```
Check if the response has a `htmlBody` field.
- If yes: store it in `realEmailHtml` → right panel renders the real email
- If no (n8n returned an empty/unexpected response): show "Email body not found in Gmail."
  This happens when Gmail has no record of an email to that address.

```tsx
      .catch(() => setEmailError("Failed to load email from Gmail."))
      .finally(() => setEmailLoading(false));
  }, [selected]);
```
- `.catch` — catches network errors (no internet, server crash, etc.)
- `.finally` — always runs after success or failure; turns off the loading spinner
- `[selected]` — the effect dependency array: re-runs every time `selected` changes
  (i.e., whenever the user clicks a different email in the left panel)

---

### JSX — Outer Layout

```tsx
// Lines 67-71
  return (
    <div
      className="bg-white rounded-xl shadow-sm overflow-hidden grid grid-cols-1 md:grid-cols-[35%_65%]"
      style={{ height: "calc(100vh - 7rem - 1rem)" }}
    >
```
The two-column grid container:
- `grid grid-cols-1` — single column on mobile
- `md:grid-cols-[35%_65%]` — on medium+ screens: left panel 35%, right panel 65%
- `height: calc(100vh - 7rem - 1rem)` — fills the full viewport height minus
  the top navigation bar (~7rem) and some margin (1rem)
- `overflow-hidden` — clips content at the rounded border edges

---

### Left Panel — Email List

```tsx
// Lines 72-105
      <div className="border-r flex flex-col overflow-hidden" style={{ backgroundColor: "#FFEBCE" }}>
```
Left panel: beige background (`#FFEBCE`), right border divider, flex column layout.
`overflow-hidden` ensures this panel doesn't grow beyond the grid cell.

```tsx
        <div className="p-3 border-b">
          <input
            value={search} onChange={(e) => setSearch(e.target.value)}
            placeholder="Search emails…"
            className="w-full px-3 py-2 text-sm rounded-md border border-gray-300 bg-white focus:outline-none"
          />
        </div>
```
Search bar at the top of the left panel. `value={search}` and `onChange={setSearch}`
make this a **controlled input** — React owns the value, not the DOM.
Every keystroke updates `search` state, which triggers `useMemo` to re-filter `rows`.

```tsx
        <div className="overflow-y-auto flex-1">
          {isLoading && <div className="p-4 text-sm text-gray-500">Loading…</div>}
          {!isLoading && rows.length === 0 && <div className="p-4 text-sm text-gray-500">No emails yet.</div>}
```
Scrollable email list:
- `overflow-y-auto flex-1` — takes remaining height, scrolls vertically when content overflows
- Shows "Loading…" during the first fetch
- Shows "No emails yet." when data loaded but no rows match (empty sheet or no search results)

```tsx
          {rows.map((r, i) => {
            const sel = selectedIdx === i;
            return (
              <button
                key={i}
                onClick={() => setSelectedIdx(i)}
```
Maps each `EmailRow` to a clickable button. `key={i}` uses the array index as key.
`onClick` sets `selectedIdx` to this row's index, which triggers the `useEffect`
Gmail fetch via the `selected` derivation.

```tsx
                style={{
                  backgroundColor: sel ? "#FFFFFF" : "transparent",
                  borderLeft: sel ? "3px solid #86000B" : "3px solid transparent",
                }}
```
Visual selection indicator:
- Selected row: white background + 3px rare-red left border
- Unselected: transparent (shows the beige panel background) + invisible border
  (transparent border keeps layout stable — no layout shift when selected)

```tsx
                <div className="font-bold text-sm truncate" style={{ color: "#1B2419" }}>
                  {r.Company_Name || r.Email_Sent_To || "Unknown"}
                </div>
                <div className="text-xs text-gray-600 truncate mt-0.5">{r.Email_Sent_To || "No recipient"}</div>
                <div className="text-[11px] truncate" style={{ color: "#86000B" }}>{r.Email_Subject || "No subject"}</div>
                <div className="text-[10px] text-gray-400 mt-0.5">{r.Date_Sent} {r.Time_Sent?.slice(0, 5)}</div>
```
Four lines of info per email item:
1. **Company name** (bold, dark green) — falls back to email address then "Unknown"
2. **Email address** (gray) — who it was sent to
3. **Subject line** (rare-red, small)
4. **Date + time** (light gray, tiny) — `Time_Sent?.slice(0,5)` shows only `HH:MM`
   (optional chaining `?.` guards against null/undefined Time_Sent)

---

### Right Panel — Email Detail View

```tsx
// Line 107
      <div className="overflow-y-auto bg-white h-full">
```
Right panel: white background, full height, vertically scrollable.

```tsx
        {!selected ? (
          <div className="h-full flex items-center justify-center text-gray-400 text-sm">Select an email to view</div>
        ) : (
          <div className="p-6 max-w-3xl">
```
If nothing is selected: centered placeholder text.
If something is selected: padded content box, max 3xl wide (readable line length).

```tsx
            <h2 className="text-lg font-bold mb-4" style={{ color: "#1B2419" }}>{selected.Email_Subject || "No Subject"}</h2>
```
Email subject as the page heading. Falls back to "No Subject" if field is empty.

---

#### Metadata Card

```tsx
// Lines 114-128
            <div
              className="rounded-lg p-4 mb-5 text-[13px] leading-relaxed"
              style={{ backgroundColor: "#f9f5ef", border: "1px solid #e0d6c8" }}
            >
              <div><span className="font-semibold">From:</span> rishi@rareglobalfood.com</div>
              <div><span className="font-semibold">To:</span> {selected.Email_Sent_To || "—"}</div>
              <div><span className="font-semibold">Company:</span> {selected.Company_Name || "—"}</div>
              <div><span className="font-semibold">Contact:</span> {selected.Contact_Name || "—"}</div>
              <div><span className="font-semibold">Date:</span> {selected.Date_Sent} {selected.Time_Sent}</div>
              <div><span className="font-semibold">Product:</span> {selected.Product_Offered || "—"}</div>
              <div>
                <span className="font-semibold">Status:</span>{" "}
                <span style={{ color: "#33673B", fontWeight: 600 }}>{selected.Status || "Sent"}</span>
              </div>
            </div>
```
A warm beige card (`#f9f5ef`) showing email metadata:
- **From:** always `rishi@rareglobalfood.com` (the sender account)
- **To:** recipient email from sheet
- **Company/Contact/Date/Product:** all from `EmailRow` sheet fields
- **Status:** shown in hunter green (`#33673B`) — "Sent", "Replied", "Bounced", etc.
  Falls back to "Sent" if the Status column is empty
- `{" "}` — React JSX needs explicit spaces between inline elements

---

#### Loading State

```tsx
// Lines 130-134
            {emailLoading && (
              <div className="py-8 text-center text-sm" style={{ color: "#86000B" }}>
                Loading email from Gmail…
              </div>
            )}
```
Shows while `emailLoading = true` (n8n fetch in progress).
Displayed in rare-red to match the brand. Centered with padding.

---

#### Error State

```tsx
// Lines 136-143
            {emailError && !emailLoading && (
              <div
                className="rounded-lg p-4 text-[13px]"
                style={{ backgroundColor: "#fff5f5", border: "1px solid #fcc", color: "#c00" }}
              >
                {emailError}
              </div>
            )}
```
Only shows when there IS an error AND loading has finished (prevents flicker).
Light red background with red border — visually distinct from content.
`emailError` holds the specific message: either "Email body not found in Gmail."
or "Failed to load email from Gmail." (network error) or "No recipient email on record."

---

#### Real Gmail Body

```tsx
// Lines 145-151
            {realEmailHtml && !emailLoading && (
              <div
                className="rounded-lg p-6 bg-white"
                style={{ border: "1px solid #e0d6c8" }}
                dangerouslySetInnerHTML={{ __html: realEmailHtml }}
              />
            )}
```
Only shows when `realEmailHtml` has content AND loading is done.
`dangerouslySetInnerHTML={{ __html: realEmailHtml }}` renders arbitrary HTML directly
into the DOM — this is how the real email body (which is an HTML string from Gmail)
gets displayed with its original formatting, fonts, links, and styling intact.

**Why "dangerous"?** React uses this name to make developers consciously acknowledge
that injecting raw HTML bypasses React's XSS protection. In this case it's safe
because the HTML comes from Gmail (your own sent emails via n8n), not from user input.

---

#### Gmail Message ID Footer

```tsx
// Lines 153-155
            {selected.Gmail_Message_ID && (
              <div className="mt-3 text-[11px] text-gray-400">Gmail ID: {selected.Gmail_Message_ID}</div>
            )}
```
Shows the Gmail message ID in tiny gray text below the email body.
Only rendered when the `Gmail_Message_ID` field in the sheet is non-empty.
Useful for debugging or manually looking up the message in Gmail.

---

## 5. File: `src/lib/email-template.ts`

This file is **no longer used in the main email tab** (it was the original approach
before real Gmail bodies were added). It still exists as a fallback.

```ts
// Line 1
import type { EmailRow } from "./sheets";
```
Imports the `EmailRow` type — it generates email HTML from a row's data.

```ts
// Lines 3-22
export function renderEmailHtml(row: EmailRow): string {
  const company = row.Company_Name || "your team";
  const contact = row.Contact_Name || "there";
  const product = row.Product_Offered || "premium food products";
  return `
  <div style="font-family: Arial, sans-serif; color:#1B2419; max-width:640px; line-height:1.55;">
    <p>Hi ${escapeHtml(contact)},</p>
    ...
  </div>`;
}
```
This function takes an `EmailRow` and constructs an HTML email body using the
company name, contact, and product offered as template variables.
It was used to **simulate** what the email looked like when we couldn't fetch
the real Gmail body. Now that n8n returns the real HTML, this is bypassed.

```ts
// Lines 24-26
function escapeHtml(s: string) {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!));
}
```
XSS prevention for the template. Converts dangerous HTML characters to HTML entities
so that if `Contact_Name` contains `<script>`, it renders as literal text, not code.
Not needed for the n8n real HTML path (that content comes from Gmail, not user-typed input).

---

## 6. How Emails Appear on the Home Dashboard

The Home tab (`src/routes/_app.index.tsx`) also consumes email data from Google Sheets
using the **same TanStack Query cache key** `["emails"]`.

### KPI Card

```tsx
// _app.index.tsx lines 20-22
function useEmails() {
  return useQuery({ queryKey: ["emails"], queryFn: () => fetchSheet<EmailRow>(EMAIL_SHEET_ID, "Sent Log"), refetchInterval: 60000 });
}
```
Because the query key `["emails"]` matches the one in `_app.email.tsx`, TanStack Query
deduplicates the request — if you're on the Home tab and already have emails cached,
navigating to the Email tab uses the same cache (no second HTTP request to Google Sheets).

```tsx
// _app.index.tsx lines 67-68
{ label: "Emails Sent", value: emails.data?.length ?? 0, Icon: Mail, isLoading: emails.isLoading, isError: emails.isError },
```
The KPI card shows the **total count** of rows in the Sent Log sheet:
- `emails.data?.length ?? 0` — length of the array, or 0 if not yet loaded
- `isLoading` → shows animated pulse skeleton instead of number
- `isError` → shows "Error" in red

### Activity Feed

```tsx
// _app.index.tsx lines 81-82
(emails.data ?? []).forEach((r) => activity.push({
  ts: `${r.Date_Sent} ${r.Time_Sent}`,
  channel: "email",
  icon: "📧",
  text: `Email sent to ${r.Company_Name} — ${r.Email_Subject}`
}));
```
Each email row becomes an activity item: `"📧 Email sent to Jollibee — Special Offer on Premium Seafood"`.
All channels (email, SMS, WhatsApp, calls) are merged and sorted by timestamp,
showing the 15 most recent actions across the whole dashboard.

### Chart

```tsx
// _app.index.tsx line 74
const emailChart = groupByDate(emails.data ?? [], (r) => r.Date_Sent);
```
The `groupByDate` helper groups emails by day and counts them, then the last 14 days
are rendered as a bar chart ("Email Sends Over Time").

---

## 7. Key Technical Concepts

### TanStack Start Server Routes
Files in `src/routes/api/` with a `server: { handlers: { GET: ... } }` block run
only on the server. The Vite plugin code-splits these away from the browser bundle.
This is what makes the proxy pattern safe — n8n URLs and credentials never reach the browser.

### TanStack Query Caching
`queryKey: ["emails"]` is a global cache key. Wherever this key appears in any component,
they all share one cached result. Cache is invalidated and re-fetched every 60s automatically.

### CSS Grid + Flex Scroll Architecture
```
<div style="height: calc(100vh - 8rem)"> ← fixed total height
  <div class="grid grid-cols-[35%_65%]">  ← two columns
    <div class="flex flex-col overflow-hidden"> ← left column, clips overflow
      <div class="shrink-0">search bar</div>  ← fixed height
      <div class="overflow-y-auto flex-1">list</div> ← scrollable, takes remaining
    </div>
    <div class="overflow-y-auto h-full">  ← right column, scrolls independently
      ... email detail ...
    </div>
  </div>
</div>
```
The key insight: the outer grid has a fixed height. Each panel is `overflow-hidden`
so content can't push the panel taller. Inside, the list div is `flex-1 overflow-y-auto`
so it fills remaining space and scrolls. Without `overflow-hidden` on the panel,
CSS Grid would grow the row to fit all content — defeating the scroll.

### Google Sheets as a Database
The sheet is read-only from the dashboard's perspective. Data is written to it
by other automation (n8n workflows that log each send). The dashboard just reads.
This means there's no back-end database to maintain — Google handles storage,
backup, and multi-user access for the sales team's logs.

---

## 8. Common Questions

**Q: Why use a server proxy instead of calling n8n from the browser directly?**
A: The browser would expose the n8n webhook URL in network requests (visible in DevTools).
Using a server proxy hides the URL and allows adding authentication headers in future
without changing the client code.

**Q: How does the Gmail body actually get into n8n?**
A: The n8n workflow uses a Gmail node (OAuth2 connected) that searches for emails
sent to the specified address. It returns the HTML body of the most recent match.
The workflow is hosted at `rareglobalfood.app.n8n.cloud`.

**Q: Why `dangerouslySetInnerHTML` and is it safe?**
A: React normally escapes all HTML to prevent XSS attacks. `dangerouslySetInnerHTML`
opts out of that escaping — necessary here because the email body IS HTML.
It's safe in this context because the content comes from Gmail (your own sent emails),
not from untrusted user input or external web sources.

**Q: What happens when n8n returns nothing (email not found in Gmail)?**
A: n8n returns a response without a `htmlBody` field. The `.then(data => ...)` block
detects this (`if (data.htmlBody)` is false) and sets `emailError` to
"Email body not found in Gmail." — showing the red error box in the right panel.

**Q: Why are emails sorted by date descending?**
A: Newest emails first is the standard expectation in any inbox UI.
The `localeCompare` sort on `"YYYY-MM-DD HH:MM"` strings works because
ISO date format sorts alphabetically in the same order as chronologically.

**Q: What does `refetchInterval: 60000` mean in practice?**
A: After the first successful fetch, TanStack Query sets a timer to re-call
`fetchSheet` every 60 seconds. This means if a new email row is added to the
Google Sheet, it appears in the dashboard within 1 minute — without the user
needing to manually refresh the page.

**Q: The sheet has "Company Name" (with a space) but the code uses `r.Company_Name`. How?**
A: `fetchSheet` normalizes every CSV header key by calling
`key.trim().replace(/\s+/g, "_")` — so `"Company Name"` → `"Company_Name"`.
This happens for every row before the data is returned. The interface and
the sheet header format don't need to match exactly.
