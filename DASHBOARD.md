# Rare Global Food — Sales Dashboard (full explanation)

This is the **Lead Gen Command Center** for Rare Global Food Trading Corp. It is an internal sales operations dashboard. Staff sign in, then watch live outreach across **email, SMS, WhatsApp, website chat, and voice calls**. The app does not send campaigns itself. It **reads** logs and inboxes from Google Sheets, Gmail, n8n, and Vapi, and displays them in one branded UI.

Martin Reyes is the named sales persona in outbound email HTML and Gmail “outbound” labels. The assistant name shown on calls defaults to **Maara dulce** when Vapi does not return an assistant name.

---

## 1. Product purpose

Sales and ops need one screen for:

- How much outreach happened (Home KPIs and charts)
- What was emailed and what replies look like (Gmail inbox)
- What SMS was sent (Google Sheet “Sent Log”)
- WhatsApp AI conversations, reply state, and deal-stage flags
- Website visitor chat (AI vs human escalation, PDF attachments)
- Outbound/inbound Vapi calls with recording, summary, and transcript

The dashboard is a **read-mostly observer**. Mutations that exist today:

- Login / logout / inactivity logout
- Gmail star (flag) add/remove via Gmail `STARRED` label
- Manual page reload
- “Load more” pagination on Gmail and Calls

There is **no compose/send** UI for email, SMS, WhatsApp, or website chat. The header search box is visual only (not wired). `src/lib/email-template.ts` can render a sample outreach HTML from a sheet row but **no page imports it**.

---

## 2. Tech stack

| Layer | Choice |
| --- | --- |
| UI | React 19, TypeScript |
| Routing + SSR/API | TanStack Router + TanStack Start (file-based routes) |
| Data fetching (client) | TanStack React Query |
| Styling | Tailwind CSS 4, brand colors in `src/styles.css` |
| Charts | Recharts (Home) |
| CSV parsing | PapaParse (Google Sheets CSV export) |
| UI kit | shadcn-style Radix primitives under `src/components/ui/` (mostly unused by feature pages) |
| Icons | lucide-react |
| Build | Vite 8 via `@lovable.dev/vite-tanstack-config` |
| Nitro preset | `vercel` (`vite.config.ts`) |
| Optional static hosting | `firebase.json` rewrites all paths to `index.html` (SPA-style; API routes need a Node/SSR host) |

Scripts (`package.json`): `dev` = `vite dev`, `build` = `vite build`, `preview`, `lint`, `format`.

---

## 3. How the app boots

1. **`src/start.ts`** — TanStack Start instance with server middleware. Uncaught handler errors (except objects with `statusCode`) become an HTML 500 from `renderErrorPage()`.
2. **`src/server.ts`** — Default `fetch` entry. Loads `@tanstack/react-start/server-entry`. If the framework returns a JSON 500 with `"unhandled":true` / `"message":"HTTPError"` (h3 swallowing throws), it replaces the body with the same HTML error page. `src/lib/error-capture.ts` stores the last error for ~5 seconds so the stack can be logged.
3. **`src/router.tsx`** — Creates a React Query `QueryClient` and TanStack Router from auto-generated `src/routeTree.gen.ts`. Scroll restoration is on. `defaultPreloadStaleTime` is `0`.
4. **`src/routes/__root.tsx`** — HTML shell: `lang="en"`, stylesheet from `src/styles.css`, viewport meta, `QueryClientProvider`, `<Outlet />`. Custom **404** and **error** screens. Errors also call `reportLovableError` (`src/lib/lovable-error-reporting.ts`).

**Do not edit `src/routeTree.gen.ts`.** TanStack regenerates it from files in `src/routes/`.

### URL map

| File | URL | Role |
| --- | --- | --- |
| `__root.tsx` | (all) | HTML + QueryClient + 404/error |
| `login.tsx` | `/login` | Credential gate |
| `_app.tsx` | layout (no extra path) | Auth, header, inactivity, `<Outlet />` |
| `_app.index.tsx` | `/` | Home / command center |
| `_app.email.tsx` | `/email` | Gmail inbox |
| `_app.sms.tsx` | `/sms` | SMS sent log |
| `_app.whatsapp.tsx` | `/whatsapp` | WhatsApp conversations |
| `_app.website.tsx` | `/website` | Website chat sessions |
| `_app.calls.tsx` | `/calls` | Vapi calls |
| `api/*.ts` | `/api/...` | Server proxies (see §8) |

`_app` is a **pathless layout**: children inherit the chrome but the layout is not a URL of its own.

---

## 4. Brand, layout, and global UX

### Colors (`src/styles.css` and inline styles)

- Rare red `#86000B` — primary, active nav, outbound bubbles, KPIs
- Beige `#FFEBCE` — page background, list panes
- Hunter green `#33673B` — “sent / AI handling / answered” badges
- Near black `#1B2419` — text
- Cream chat pane `#FFF8F0` (WhatsApp / Website)

Font: Arial / Helvetica. Mobile inputs forced to 16px to avoid iOS zoom. `.email-body-content` rules constrain Gmail HTML tables/images (class is defined; the Email tab currently injects HTML without that wrapper class).

### Logo (`src/lib/brand.tsx`)

Wordmark: **RARE** / **GLOBAL FOOD** in rare red. Used on login and header.

### Authenticated chrome (`src/routes/_app.tsx`)

Sticky white header with 2px rare-red bottom border.

**Tabs:** Home, Email, SMS, WhatsApp, Website, Calls. Active tab is white on `#86000B`. Home is active only when pathname is exactly `/`; other tabs use `pathname.startsWith`.

**Right side:**

- Search input placeholder “Search…” — **not connected** to any filter or route.
- Reload button — `window.location.reload()`.
- Logout — clears `localStorage` key `rgf_isLoggedIn`, navigates to `/login`.

**Main:** padded `<Outlet />` on beige background.

**Inactivity:** after 5 minutes with no `mousemove`, `mousedown`, `keydown`, `touchstart`, `scroll`, or `click`, user is logged out. At 4 minutes 30 seconds a bottom banner appears: “You'll be signed out in 30 seconds due to inactivity.” **Stay signed in** resets the timers.

Until `isLoggedIn()` is true, the layout shows an empty beige full-screen (avoids flashing protected UI). If not logged in, it redirects to `/login`.

---

## 5. Authentication

**Not real multi-user auth.** It is a client-side gate.

`src/lib/auth.ts`:

- `AUTH_KEY = "rgf_isLoggedIn"`
- `LOGIN_EMAIL` / `LOGIN_PASSWORD` from `VITE_LOGIN_EMAIL` and `VITE_LOGIN_PASSWORD` (bundled into the client)
- `isLoggedIn()` — `localStorage` === `"true"` (false on the server)
- `setLoggedIn(true|false)` — set or remove the key

**Login page (`/login`):**

- If already logged in, redirect to `/`.
- Left panel (md+): rare-red overlay, Unsplash food photo, copy about nationwide Philippines supply, stats 2,000+ B2B / 99% timely / 20K+ kg.
- Right: logo, “Welcome Back”, email + password form.
- Submit: email trimmed lowercased must equal `LOGIN_EMAIL`, password must equal `LOGIN_PASSWORD`. Else “Invalid email or password.”
- Document title: “Sign in — Rare Global Food”.

Anyone who can read the built JS can see the expected email/password. Treat this as a **casual lock**, not security for Gmail/Vapi secrets. Those secrets stay on the **server** (`process.env`), except sheet IDs and login which are `VITE_` client vars.

---

## 6. Feature pages (every behavior)

Shared pattern on Email / SMS / WhatsApp / Website / Calls:

- Card filling `height: calc(100vh - 7rem - 1rem)`
- From `md` up: **35% list / 65% detail**
- List pane beige; selected row white with 3px rare-red left border
- Loading, empty, and error copy in the list

Timestamps on Email, WhatsApp, and Website use `en-PH` locale (Philippines).

### 6.1 Home — `/` (`_app.index.tsx`)

Title: **Lead Gen Command Center**. Subtitle: live snapshot, auto-refresh every **60 seconds**.

**Queries (all refetchInterval 60000):**

| Hook | Source | Query key |
| --- | --- | --- |
| `useEmails` | Google Sheet `EMAIL_SHEET_ID`, tab `Sent Log` | `["emails"]` |
| `useSms` | Google Sheet `SMS_SHEET_ID`, tab `Sent Log` | `["sms"]` |
| `useWhatsApp` | `GET /api/whatsapp-conversations` | `["whatsapp-conversations"]` |
| `useVapi` | `GET /api/vapi-calls?limit=100` | `["vapi"]` |

**WhatsApp test filter:** conversations whose `companyName` starts with `"Test Dummy Company - "` are **excluded** from Home KPIs and the WhatsApp chart. The WhatsApp **page** still shows them with a **TEST** badge.

**KPI cards:**

1. Emails Sent — count of email sheet rows
2. SMS Sent — count of SMS sheet rows
3. WhatsApp Messages — sum of `messages.length` on non-test conversations (not conversation count)
4. Calls Made — length of Vapi array (first 100 calls only; not full history)

Loading: gray pulse skeleton. Error: red “Error” text. Success: locale-formatted number in rare red + icon in a beige circle.

**Charts (last 14 calendar days with data):** `groupByDate` takes first 10 characters of a date string as the day key, sorts ISO-ish keys, slices last 14.

- Email Sends Over Time — bar — `Date_Sent`
- SMS Sends Over Time — bar — `Date_Sent`
- WhatsApp Activity — **line** — each message `ts` from real conversations
- Call Activity — bar — `createdAt`

Grid: 4 KPIs (1/2/4 columns by breakpoint), then 2×2 charts.

---

### 6.2 Email — `/email` (`_app.email.tsx`)

Live **Gmail inbox** for the OAuth user (business mailbox `martin@rareglobalfood.com` used only to classify outbound vs inbound).

**List load:** `GET /api/gmail-threads?maxResults=40` plus optional `pageToken`. First page refetches every **60s**. Later pages do not auto-refetch.

Threads accumulate in `allThreads` and are **deduped by `threadId`**. `nextPageToken` from Gmail drives **Load more emails**. If `nextPageToken === pageToken` (failed page), **Load more** calls `refetch()` instead of a no-op `setState`.

**Filters:**

- Search (client): subject, from, to, snippet
- All vs **Flagged** (`isFlagged` = Gmail STARRED on any message in the thread)

**List row:** unread red dot, subject or “(no subject)”, relative-style timestamp, star button (stops click so it does not select), sender (for outbound shows **To**, else **From**), snippet.

**Flag:** `POST /api/gmail-flag` `{ threadId, flagged }`. Optimistic local list update + invalidate `["gmail-threads"]`.

**Detail:** empty state “Select an email to view”. Header: subject, message count, star, refresh (re-sets selected id to retrigger fetch). `GET /api/gmail-thread?id=` loads full messages. Empty thread → “No messages found…”. Fetch fail → “Failed to load thread from Gmail.”

Each message: inbound cream background, outbound white; outbound label forced to **Martin Reyes (Rare Global Food)**; inbound uses parsed name. Body is `dangerouslySetInnerHTML` of `htmlBody`.

`parseSender` handles `"Name" <email@x>` or a bare email.

---

### 6.3 SMS — `/sms` (`_app.sms.tsx`)

**Source:** same SMS Google Sheet as Home (`Sent Log`), query key `["sms"]`, 60s refresh. **Not** `/api/twilio-messages` (that API exists but **no UI uses it**).

Rows sorted newest first by `Date_Sent` + `Time_Sent`. Search: company name, phone, message body.

Empty: “No SMS sent yet” / “SMS campaign hasn't been triggered.”

**Detail** looks like a dark phone: header rare red with company + phone; bubble is the **single** `Message_Sent` string (not a two-way thread); footer Product, Channel, Status (default “Sent”, green pill).

---

### 6.4 WhatsApp — `/whatsapp` (`_app.whatsapp.tsx`)

**Source:** `GET /api/whatsapp-conversations` → `{ conversations: [...] }`. Refetch **every 30 seconds** (faster than Home).

n8n is expected to return **one object per lead**, already de-duplicated and newest-first. The UI **does not re-sort**.

**Filters:** search phone / leadName / companyName. Reply chips:

- **All**
- **Replied** — thread has **both** a `customer` and a `martin` message
- **Not Replied** — missing one of those roles (typical cold outbound: Martin only)

Comment in code: the bot often replies instantly, so “bot replied” is a weak signal. “Did the lead ever write back?” is the real split.

**TEST** badge if `companyName` starts with `"Test Dummy Company - "`.

List title: lead name or company or phone. Subline company · phone. Preview: `lastMessagePreview`.

**Chat header:** avatar initials, names, phone, last active.

**Status pills** (only if any flag/stage is set):

- `conversationStage` (underscores → spaces)
- Brochure Sent, Price Sent, Form Sent
- Meeting Booked ✓
- Escalated to Human
- N Discount Attempt(s)

**Bubbles:** `martin` right, rare red, white text; `customer` left, white bubble. `whiteSpace: pre-wrap`. Timestamps under bubbles.

Selecting a conversation: `activePhone`; if none selected, **first conversation in the filtered list** is shown.

---

### 6.5 Website — `/website` (`_app.website.tsx`)

**Source:** `GET /api/website-chat-sessions` → `{ sessions }`. Refetch 60s.

Sessions sorted by `lastMessageAt` descending. Search: visitorName, visitorEmail, businessType, sessionId.

List title: `visitorName` or `Visitor · {last 8 of sessionId}`.

**Status badge:** `escalated` → “Needs Human” red; else “AI Handling” green.

Secondary line: businessType, or city+country, or pageUrl. Also first seen, message count, last message time.

**Chat:** same bubble layout as WhatsApp (`agent` = outbound). Optional attachment: `attachmentUrl` + `attachmentType` `price_list_pdf` | `catalog_pdf` → labeled PDF link “Price List.pdf” or “Product Catalog.pdf”, new tab.

Default selection: first session in the filtered list.

---

### 6.6 Calls — `/calls` (`_app.calls.tsx`)

**Source:** `GET /api/vapi-calls?limit=100` and later `createdAtLt={oldest createdAt}` for pagination. First page refetch 60s. Page size 100. Results merged and **deduped by `id`**. `hasMore` if last fetch returned ≥ 100 calls.

Search: customer number, call id, status.

**List badge from `endedReason`:**

- contains no-answer / noanswer / busy → **No Answer** gray
- contains transfer → **Transferred** rare red
- else → **Answered** green

Shows duration (`startedAt`–`endedAt` as `Xm Ys`), created time, raw `endedReason`.

**Detail:** number or name, created, duration, assistant name or **Maara dulce**.

1. **Recording** — `<audio>` `src=/api/vapi-recording?callId={id}&type=stereo`. On error: “No recording available.” Reset failed state when call id changes.
2. **Call Summary** — `analysis.summary` or “No summary generated.”
3. **Full Transcript** — collapsed; `artifact.transcript` or “No transcript available.”
4. Meta grid: Started, Ended, Duration, Ended Reason.

Selecting a call resets transcript collapsed.

---

## 7. Data layer (client helpers)

### Google Sheets (`src/lib/sheets.ts`)

`csvUrl(sheetId, tab)` →  
`https://docs.google.com/spreadsheets/d/{id}/gviz/tq?tqx=out:csv&sheet={tab}`

The spreadsheet must be **readable as CSV** (typically anyone-with-link or published). `fetchSheet` uses PapaParse with headers, skips empty lines, then **normalizes keys**: trim + spaces → underscores so “Company Name” and `Company_Name` both work.

**EmailRow:** Date_Sent, Time_Sent, Lead_ID, Company_Name, Contact_Name, Email_Sent_To, Product_Offered, Channel, Email_Subject, Status, Gmail_Message_ID.

**SmsRow:** Date_Sent, Time_Sent, Lead_ID, Company_Name, Contact_Name, Phone, Product_Offered, Channel, Message_Sent, Status, API_Response.

IDs: `VITE_EMAIL_SHEET_ID`, `VITE_SMS_SHEET_ID`.

### Gmail server (`src/lib/gmail-server.ts`) — **server only**

OAuth refresh: `GMAIL_CLIENT_ID`, `GMAIL_CLIENT_SECRET`, `GMAIL_REFRESH_TOKEN` → `https://oauth2.googleapis.com/token`. Access token cached until ~30s before expiry.

- `gmailFetch(path, token)` — `users/me` Gmail API
- `extractHtmlBody` — prefers text/html parts, walks nested MIME, falls back to escaped text/plain in `<pre>`
- `getHeader`
- `GMAIL_BUSINESS_EMAIL = "martin@rareglobalfood.com"` — if From contains this, direction is outbound

### Email HTML helper (`src/lib/email-template.ts`)

`renderEmailHtml(EmailRow)` — Martin Reyes outreach letter with escaped contact/company/product. **Unused by routes.**

### Client API leftovers (`src/lib/api-client.ts`)

Direct browser calls to Vapi and n8n using `VITE_VAPI_*` and `VITE_N8N_BASE_URL`. **Not imported** by current pages (pages use `/api/*` proxies). Kept from an earlier static-SPA idea. Putting Vapi private keys in `VITE_` would leak them; do not wire this file back without a proxy.

### Other libs

- `src/lib/utils.ts` — typical `cn()` class merge
- `src/hooks/use-mobile.tsx` — 768px breakpoint; **not used** by feature pages
- `src/lib/error-page.ts` — HTML 500 document
- `src/lib/lovable-error-reporting.ts` — Lovable platform error reporting

---

## 8. Server API routes

All are TanStack Start `server.handlers`. JSON APIs use `Cache-Control: no-store` except recordings (`private, max-age=3600`).

### `GET /api/gmail-threads`

Query: `maxResults` (default 40), `pageToken`.

Gmail list: `q=-in:chats -in:draft`. Then metadata per thread in chunks of **15**, with **up to 2 retries** on HTTP 429 (500ms, then 1000ms). Failed threads are skipped, not fatal.

Last message headers → subject, from, to, date, snippet, messageCount. Unread if any message has `UNREAD`. Flagged if any has `STARRED`. Direction from From vs business email. Sorted by date descending. Returns `{ threads, nextPageToken }`.

### `GET /api/gmail-thread?id=`

Full thread, each message with `extractHtmlBody`, sorted oldest first. 400 if missing id.

### `POST /api/gmail-flag`

JSON `{ threadId, flagged }`. Gmail `threads/{id}/modify` add or remove `STARRED`.

### `GET /api/whatsapp-conversations`

Proxies `GET {N8N_WEBHOOK_BASE_URL}/whatsapp-conversations`. Passes status and body through. 500 JSON on network failure.

Expected conversation shape (from the WhatsApp page TypeScript):

- phone, leadName, companyName, channel
- conversationStage, brochureSent, priceSent, formSent, meetingScheduled, humanEscalated, discountAttempts, duplicateRowCount
- lastUpdated, lastMessageAt, lastMessagePreview
- messages: `{ role: "customer"|"martin", content, ts }[]`

### `GET /api/website-chat-sessions`

Hardcoded n8n URL:  
`https://rareglobalfood.app.n8n.cloud/webhook/martin-chat-dashboard-sessions`  
(does **not** use `N8N_WEBHOOK_BASE_URL`). Request `Cache-Control: no-cache`.

Expected session shape: sessionId, visitor fields (name, email, phone, business type/segment, city/region/country, pageUrl), status `ai` | `escalated`, conversationStage, firstSeenAt, lastMessageAt, messageCount, messages `{ sender: "visitor"|"agent", text, timestamp, attachmentUrl?, attachmentType? }`.

### `GET /api/vapi-calls`

Requires `VAPI_PRIVATE_KEY` and `VAPI_ASSISTANT_ID`. Forwards to `https://api.vapi.ai/call?assistantId=&limit=&createdAtLt=`. Default limit 100.

### `GET /api/vapi-recording`

Query `callId` (required), `type` `stereo` (default) or `mono`. Fetches `https://api.vapi.ai/call/{id}/stereo-recording` or `mono-recording` with redirect follow. Returns audio bytes.

### `GET /api/twilio-messages`

Twilio `Messages.json` with Basic auth (`TWILIO_ACCOUNT_SID` / `TWILIO_AUTH_TOKEN`), `PageSize` default 200. **No dashboard page calls this.** SMS UI is sheet-based.

---

## 9. Environment variables

From `.env.example` (copy to `.env`; never commit secrets):

**Server**

- `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN` — unused by UI
- `VAPI_PRIVATE_KEY`, `VAPI_ASSISTANT_ID`
- `GMAIL_CLIENT_ID`, `GMAIL_CLIENT_SECRET`, `GMAIL_REFRESH_TOKEN`
- `N8N_WEBHOOK_BASE_URL` — default in example `https://rareglobalfood.app.n8n.cloud/webhook`

**Client (`VITE_`)**

- `VITE_EMAIL_SHEET_ID`, `VITE_SMS_SHEET_ID`
- `VITE_LOGIN_EMAIL`, `VITE_LOGIN_PASSWORD`

Website chat n8n URL is **hardcoded** in `website-chat-sessions.ts`. WhatsApp uses the env base URL.

---

## 10. Refresh intervals (summary)

| Surface | Interval |
| --- | --- |
| Home all four sources | 60s |
| Email thread list (first page only) | 60s |
| SMS sheet | 60s |
| WhatsApp list | 30s |
| Website sessions | 60s |
| Calls first page | 60s |
| Email later pages / Calls later pages | no auto refetch |

---

## 11. File map (what matters vs scaffolding)

**Product code (read this to change behavior):**

- `src/routes/_app*.tsx`, `login.tsx`, `__root.tsx`
- `src/routes/api/*`
- `src/lib/auth.ts`, `sheets.ts`, `gmail-server.ts`, `brand.tsx`
- `src/styles.css`, `src/start.ts`, `src/server.ts`, `src/router.tsx`

**Scaffold / unused by current screens:**

- Almost all of `src/components/ui/*` (Radix/shadcn library)
- `src/lib/api-client.ts`, `src/lib/email-template.ts`
- `src/hooks/use-mobile.tsx`
- `src/routes/api/twilio-messages.ts` (API only)
- `firebase.json` SPA hosting (conflicts with server APIs unless APIs live elsewhere)

---

## 12. Known limits and pitfalls

1. Login credentials are in the frontend bundle.
2. Header search does nothing.
3. Home call count is capped at 100 (same as first Vapi page).
4. Home WhatsApp KPI counts **messages**, not threads; test dummy companies are omitted.
5. Email HTML is unsanitized (`dangerouslySetInnerHTML`).
6. Gmail list can omit threads that keep 429-ing.
7. Sheets must be publicly fetchable as CSV or the browser fetch fails (CORS/auth).
8. WhatsApp list order is entirely n8n’s responsibility.
9. Website webhook URL is hardcoded; WhatsApp is env-based.
10. `api-client.ts` would expose secrets if used with `VITE_VAPI_PRIVATE_KEY`.
11. Firebase rewrite hosting will not run `/api/*` unless a separate backend is deployed (Vite/Nitro/Vercel is the intended API host).

---

## 13. End-to-end data flow (one picture)

```
Staff browser
  → /login (localStorage gate)
  → /_app chrome (5 min idle logout)
      → Home: Sheets CSV + /api/whatsapp-conversations + /api/vapi-calls
      → Email: /api/gmail-threads|thread|flag → Gmail API (OAuth refresh)
      → SMS: Sheets CSV only
      → WhatsApp: /api/whatsapp-conversations → n8n webhook
      → Website: /api/website-chat-sessions → n8n webhook (fixed URL)
      → Calls: /api/vapi-calls + /api/vapi-recording → api.vapi.ai
```

Campaign sending, WhatsApp AI, website widget, and Vapi dialing live **outside** this repo (n8n, Gmail, Twilio/sheets, Vapi). This dashboard is the **operator console** for that pipeline.
