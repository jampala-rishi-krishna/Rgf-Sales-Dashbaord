# Rare Global Food Sales Dashboard — Project Detail

This document is a source-focused walkthrough of the project. It is based on the actual code in this repository and maps the main responsibilities to specific files and sections.

## 1) What the project is

This project is an internal sales/ops dashboard for Rare Global Food Trading Corp. It is not a full CRM or outbound platform. It is a read-mostly dashboard that surfaces outreach activity across the following channels:

- Email
- SMS
- WhatsApp
- Website chat
- Voice calls

The main purpose is to help operators see what was sent, which leads responded, whether a conversation was escalated, and which calls happened in the outbound flow.

The repository is built around a TanStack-based frontend with server-side routes for API proxying and private credentials.

## 2) Tech stack

Key technologies visible in the codebase:

- Frontend: React + TypeScript
- Routing: TanStack Router
- SSR framework: TanStack Start
- Data fetching: TanStack Query
- Styling: Tailwind CSS + custom CSS in [src/styles.css](./src/styles.css)
- Charts: Recharts
- Spreadsheet import: PapaParse
- UI primitives: Radix/shadcn-style components under [src/components/ui](./src/components/ui)
- Build tool: Vite

See:

- [package.json](./package.json)
- [vite.config.ts](./vite.config.ts)
- [src/router.tsx](./src/router.tsx)
- [src/start.ts](./src/start.ts)
- [src/server.ts](./src/server.ts)

## 3) Startup and boot flow

### [package.json](./package.json)

- `scripts.dev` -> `vite dev`
- `scripts.build` -> `vite build`
- `scripts.preview` -> `vite preview`
- `scripts.lint` -> `eslint .`
- `scripts.format` -> `prettier --write .`

This shows the app is a Vite-based project, not a backend server by itself.

### [vite.config.ts](./vite.config.ts)

- Specifies `nitro.preset = "vercel"`
- This means the project is expected to run in a Vercel-like hosting environment with SSR support

### [src/start.ts](./src/start.ts)

This file creates the TanStack Start instance and installs a request middleware that catches thrown errors and turns them into a 500 HTML error page when they are not handled as explicit status-coded errors.

### [src/server.ts](./src/server.ts)

This is the main server entry for the app. It:

- imports `@tanstack/react-start/server-entry`
- normalizes catastrophic SSR failures
- converts h3 swallowed HTTP errors into a proper HTML error page
- logs captured errors for debugging

### [src/router.tsx](./src/router.tsx)

This file builds the router and passes a React Query client into the app context. It configures:

- `scrollRestoration: true`
- `defaultPreloadStaleTime: 0`

### [src/routes/__root.tsx](./src/routes/__root.tsx)

This is the root app shell. It:

- sets the HTML `lang="en"`
- injects the stylesheet
- sets viewport metadata
- wraps the app in `QueryClientProvider`
- defines the global 404 and error UI
- reports critical errors to `reportLovableError()`

## 4) URL structure and routing

The application uses file-based routes in [src/routes](./src/routes).

Main route map:

- [src/routes/login.tsx](./src/routes/login.tsx) -> `/login`
- [src/routes/_app.tsx](./src/routes/_app.tsx) -> pathless layout (shared app chrome)
- [src/routes/_app.index.tsx](./src/routes/_app.index.tsx) -> `/`
- [src/routes/_app.email.tsx](./src/routes/_app.email.tsx) -> `/email`
- [src/routes/_app.sms.tsx](./src/routes/_app.sms.tsx) -> `/sms`
- [src/routes/_app.whatsapp.tsx](./src/routes/_app.whatsapp.tsx) -> `/whatsapp`
- [src/routes/_app.website.tsx](./src/routes/_app.website.tsx) -> `/website`
- [src/routes/_app.calls.tsx](./src/routes/_app.calls.tsx) -> `/calls`

API proxies under [src/routes/api](./src/routes/api):

- [src/routes/api/gmail-threads.ts](./src/routes/api/gmail-threads.ts)
- [src/routes/api/gmail-thread.ts](./src/routes/api/gmail-thread.ts)
- [src/routes/api/gmail-flag.ts](./src/routes/api/gmail-flag.ts)
- [src/routes/api/sms-conversations.ts](./src/routes/api/sms-conversations.ts)
- [src/routes/api/whatsapp-conversations.ts](./src/routes/api/whatsapp-conversations.ts)
- [src/routes/api/website-chat-sessions.ts](./src/routes/api/website-chat-sessions.ts)
- [src/routes/api/vapi-calls.ts](./src/routes/api/vapi-calls.ts)

## 5) Auth layer

### [src/lib/auth.ts](./src/lib/auth.ts)

This is a lightweight client-side authentication gate. It uses the browser `localStorage` key `rgf_isLoggedIn`.

Important points:

- credentials are read from `import.meta.env.VITE_LOGIN_EMAIL` and `import.meta.env.VITE_LOGIN_PASSWORD`
- `isLoggedIn()` returns `window.localStorage.getItem(AUTH_KEY) === "true"`
- `setLoggedIn(v)` writes or removes the key

This is not a secure multi-user auth system. It is a simple session gate for the dashboard UI.

### [src/routes/login.tsx](./src/routes/login.tsx)

This is the login page. It:

- checks if the user is already logged in and redirects to `/`
- shows a branded left panel with a food-image hero and sales stats
- validates email and password against env values
- stores the login state in localStorage if valid
- redirects to `/`

The sign-in logic is intentionally simple and compares trimmed lowercase email with the env email and raw password with the env password.

## 6) App shell and navigation

### [src/routes/_app.tsx](./src/routes/_app.tsx)

This is the persistent application layout.

It contains:

- top sticky white header
- logo + nav tabs
- search box (visual only, not wired to real filtering)
- reload button
- logout button
- inactivity timer with a 30-second warning
- global `Outlet` for child pages

The app logs out automatically if there is no activity for 5 minutes. It warns 30 seconds before the actual logout.

Key logic:

- `INACTIVITY_MS = 5 * 60 * 1000`
- `WARN_BEFORE_MS = 30 * 1000`
- reset timer on `mousemove`, `mousedown`, `keydown`, `touchstart`, `scroll`, `click`

## 7) Shared styling and branding

The brand and UI colors are defined in:

- [src/styles.css](./src/styles.css)
- [src/lib/brand.tsx](./src/lib/brand.tsx)

Brand colors used by the project include:

- rare red: `#86000B`
- beige background: `#FFEBCE`
- hunter green: `#33673B`
- near-black text: `#1B2419`
- cream chat background: `#FFF8F0`

The project uses a visual style that is tuned for a sales ops dashboard rather than a generic SaaS app.

## 8) Data source: Google Sheets

### [src/lib/sheets.ts](./src/lib/sheets.ts)

This file pulls CSV exports from Google Sheets.

Important behaviors:

- builds a Google Sheets CSV URL using the spreadsheet ID and tab name
- fetches CSV text with `fetch()`
- parses CSV using PapaParse
- normalizes column names by replacing spaces with underscores

The constants are:

- `EMAIL_SHEET_ID = import.meta.env.VITE_EMAIL_SHEET_ID`
- `SMS_SHEET_ID = import.meta.env.VITE_SMS_SHEET_ID`

This is the source for the home dashboard and email/sms summary metrics when the app reads sheet data.

## 9) Home dashboard

### [src/routes/_app.index.tsx](./src/routes/_app.index.tsx)

This is the main landing page `/`.

It creates 4 KPIs:

- Emails Sent
- SMS Sent
- WhatsApp Messages
- Calls Made

It also renders charts for:

- Email sends over time
- SMS sends over time
- WhatsApp activity
- Call activity

Key features:

- all data refreshes every 60 seconds via `refetchInterval: 60000`
- `isTestWA()` filters out conversations where `companyName` starts with `Test Dummy Company - `
- the dashboard excludes internal/test contacts from the home metrics to avoid noise

## 10) Email tab

### [src/routes/_app.email.tsx](./src/routes/_app.email.tsx)

This page implements the Gmail inbox view.

It does the following:

- calls `/api/gmail-threads?maxResults=40...`
- stores paginated thread data in local state
- supports search and flagged filter
- loads a single thread with `/api/gmail-thread?id=...`
- allows starring/flagging a Gmail thread using `/api/gmail-flag`

The Gmail backend is handled server-side in:

- [src/lib/gmail-server.ts](./src/lib/gmail-server.ts)
- [src/routes/api/gmail-threads.ts](./src/routes/api/gmail-threads.ts)
- [src/routes/api/gmail-thread.ts](./src/routes/api/gmail-thread.ts)
- [src/routes/api/gmail-flag.ts](./src/routes/api/gmail-flag.ts)

### [src/lib/gmail-server.ts](./src/lib/gmail-server.ts)

This file is the server-side Gmail helper layer.

It contains:

- OAuth token refresh using Gmail refresh token
- access token caching
- Gmail API fetch helper
- HTML-body extraction from message payloads
- Gmail header lookup helper

This file is intentionally written so it must not be imported by browser code; it relies on server environment secrets.

### [src/routes/api/gmail-threads.ts](./src/routes/api/gmail-threads.ts)

This is the route that lists Gmail threads.

It does several important things:

- creates a Gmail search query excluding drafts/chats
- filters out logistics-related aliases, labels, subject lines, and keywords
- uses rate-limit retry logic for `429` responses
- batches thread metadata requests to avoid Gmail API rate-limit failures
- sorts by thread date descending

This is a key security/logic protection file because it filters out non-sales-related email threads.

### [src/routes/api/gmail-thread.ts](./src/routes/api/gmail-thread.ts)

This route loads all messages from a given Gmail thread and returns them in chronological order.

### [src/routes/api/gmail-flag.ts](./src/routes/api/gmail-flag.ts)

This route toggles the Gmail `STARRED` label for a thread.

## 11) SMS tab

### [src/routes/_app.sms.tsx](./src/routes/_app.sms.tsx)

This page loads SMS conversation data from the backend route:

- [src/routes/api/sms-conversations.ts](./src/routes/api/sms-conversations.ts)

It displays:

- list of SMS conversations
- reply/not-replied filters
- search by phone, name, or company
- message thread detail on the right
- business metadata such as funnel state and brochure/price/form flags

The function `hasReplied()` checks whether a real lead response exists by looking for both customer and mar-tin messages in the same conversation.

This is important because the app intentionally avoids treating every bot auto-reply as a meaningful conversation response.

## 12) WhatsApp tab

### [src/routes/_app.whatsapp.tsx](./src/routes/_app.whatsapp.tsx)

This is effectively the same conversation pane pattern as SMS, but for WhatsApp conversations.

Key behaviors:

- calls `/api/whatsapp-conversations`
- supports search and “replied / not replied” filtering
- filters out test conversations by company prefix
- renders a chat thread with message metadata

### [src/routes/api/whatsapp-conversations.ts](./src/routes/api/whatsapp-conversations.ts)

This route proxies the n8n webhook for WhatsApp data. It passes through the response body from an external service.

## 13) Website chat tab

### [src/routes/_app.website.tsx](./src/routes/_app.website.tsx)

This page reads website chat sessions and shows:

- session list
- status badges (`AI Handling` or `Needs Human`)
- first seen and last message timestamps
- message count
- chat transcript details with PDF attachment metadata when available

The session status logic is based on `status: "ai" | "escalated"`.

### [src/routes/api/website-chat-sessions.ts](./src/routes/api/website-chat-sessions.ts)

This route calls a fixed n8n webhook at `https://rareglobalfood.app.n8n.cloud/webhook/martin-chat-dashboard-sessions` and proxies the result back to the frontend.

## 14) Calls tab

### [src/routes/_app.calls.tsx](./src/routes/_app.calls.tsx)

This page loads outbound call records from Vapi.

It includes:

- pagination by `createdAtLt` cursor
- deduping by call `id`
- search by phone number or id
- call status badges such as “Answered,” “No Answer,” or “Transferred”
- recording and transcript display using Vapi artifacts
- assistant label fallback to `Maara dulce` if no assistant name is returned

### [src/routes/api/vapi-calls.ts](./src/routes/api/vapi-calls.ts)

This route is the protected Vapi proxy. It:

- validates that `VAPI_PRIVATE_KEY` and `VAPI_ASSISTANT_ID` exist
- reads `limit` and optional `createdAtLt` from the URL
- builds the Vapi API request
- proxies the result to the frontend

## 15) Important logic quirks and business rules

There are several project-specific rules inside the UI code that are worth calling out:

1. Test accounts are excluded from Home KPIs.
   - implemented in [src/routes/_app.index.tsx](./src/routes/_app.index.tsx)
   - logic checks `companyName.startsWith("Test Dummy Company - ")`

2. The app defines “replied” as real two-way engagement.
   - implemented in [src/routes/_app.sms.tsx](./src/routes/_app.sms.tsx) and [src/routes/_app.whatsapp.tsx](./src/routes/_app.whatsapp.tsx)
   - it rejects the simplistic idea that a bot auto-reply equals a real customer response

3. Gmail thread filtering excludes logistics/internal mail.
   - implemented in [src/routes/api/gmail-threads.ts](./src/routes/api/gmail-threads.ts)
   - excludes certain senders, labels, subjects, and keywords

4. Auth is intentionally casual.
   - implemented in [src/lib/auth.ts](./src/lib/auth.ts) and [src/routes/login.tsx](./src/routes/login.tsx)
   - it relies on localStorage and env values, not a proper server session

5. The UI is read-mostly.
   - no compose/send feature exists for email, SMS, WhatsApp, or website chat
   - header search is also decorative only

## 16) File-by-file code map

This is the fastest code map if you want to understand the project quickly.

- [package.json](./package.json) — package metadata and scripts
- [vite.config.ts](./vite.config.ts) — Vite + Nitro setup
- [src/start.ts](./src/start.ts) — Start middleware and error handling
- [src/server.ts](./src/server.ts) — SSR server entry and catastrophic error normalization
- [src/router.tsx](./src/router.tsx) — Query client + router creation
- [src/routes/__root.tsx](./src/routes/__root.tsx) — root HTML shell and global error boundary
- [src/routes/_app.tsx](./src/routes/_app.tsx) — authenticated layout + inactivity logic
- [src/routes/login.tsx](./src/routes/login.tsx) — login page
- [src/lib/auth.ts](./src/lib/auth.ts) — client auth helpers
- [src/lib/sheets.ts](./src/lib/sheets.ts) — Google Sheets CSV fetch + normalization
- [src/routes/_app.index.tsx](./src/routes/_app.index.tsx) — leadership/home overview dashboard
- [src/routes/_app.email.tsx](./src/routes/_app.email.tsx) — Gmail inbox UI
- [src/routes/_app.sms.tsx](./src/routes/_app.sms.tsx) — SMS convo UI
- [src/routes/_app.whatsapp.tsx](./src/routes/_app.whatsapp.tsx) — WhatsApp convo UI
- [src/routes/_app.website.tsx](./src/routes/_app.website.tsx) — website chat UI
- [src/routes/_app.calls.tsx](./src/routes/_app.calls.tsx) — Vapi call UI
- [src/lib/gmail-server.ts](./src/lib/gmail-server.ts) — Gmail API + OAuth helper
- [src/routes/api/gmail-threads.ts](./src/routes/api/gmail-threads.ts) — Gmail thread listing and filtering
- [src/routes/api/gmail-thread.ts](./src/routes/api/gmail-thread.ts) — Gmail thread detail fetch
- [src/routes/api/gmail-flag.ts](./src/routes/api/gmail-flag.ts) — Gmail star flag mutation
- [src/routes/api/sms-conversations.ts](./src/routes/api/sms-conversations.ts) — SMS conversation proxy
- [src/routes/api/whatsapp-conversations.ts](./src/routes/api/whatsapp-conversations.ts) — WhatsApp proxy
- [src/routes/api/website-chat-sessions.ts](./src/routes/api/website-chat-sessions.ts) — website chat proxy
- [src/routes/api/vapi-calls.ts](./src/routes/api/vapi-calls.ts) — Vapi proxy
- [src/components/ui](./src/components/ui) — reusable UI building blocks

## 17) Short conclusion

This repository is a specialized internal dashboard for monitoring outbound sales conversations across multiple channels. It is not a generic app template; it is a data-aggregation and operations dashboard built around Google Sheets, Gmail, n8n webhooks, and Vapi.

The app’s practical patterns are:

- fetch data from external systems
- normalize it in the front end
- display list/detail split views
- keep a branded internal dashboard shell
- use a lightweight client-side login gate instead of real auth

If you want, the next step could be a second document that is even more source-precise, with line-by-line breakdowns of each major file’s functions and local state. 
