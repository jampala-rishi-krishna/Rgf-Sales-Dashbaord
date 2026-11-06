# RGF Sales Dashboard — Full Redesign Brief ("Mission Control")

## 0. Ground rules
1. Read before writing. Reuse existing fetch/normalize logic (`hasReplied()`, `isTest`, Gmail logistics filters, Vapi pagination). Do not rewrite business rules, restyle around them. Shared helpers now live in `src/lib/channels.ts`, `src/lib/phone.ts`, `src/hooks/use-polling.ts`, `src/lib/action-client.ts`.
2. Never send real messages while developing. Every "send" route must check `process.env.ACTIONS_DRY_RUN === "true"` and, when true, return a fake success payload without calling n8n/Gmail/Vapi. Default `ACTIONS_DRY_RUN=true` in `.env.example`.
3. No secrets in the browser. Anything that sends, calls, or reads CRM goes through a server route in `src/routes/api/`. No `VITE_` prefix on any secret.
4. Keep TanStack Start + Router + Query, Tailwind, shadcn/Radix, Recharts. Deploys on Vercel, so no long-lived WebSockets; use polling.
5. Respect `prefers-reduced-motion` everywhere (`useReducedMotion()` from `motion/react`).
6. Feature-flag anything that depends on an n8n endpoint that doesn't exist yet. Render the UI, disable the button with tooltip "Backend not connected yet".

Deps installed: `motion` (import from `motion/react`), `@tanstack/react-table`, `@tanstack/react-virtual`, `cmdk`, `sonner`, `react-icons` (`react-icons/si`: SiWhatsapp, SiViber, SiGmail, SiZoho), `wavesurfer.js`, `zod`, `date-fns`, `date-fns-tz`, `bcryptjs`. All times shown in `Asia/Manila`.

## 1. Vision
Agentic command center: watch every AI agent (Martin on WhatsApp/SMS/Viber/Email/Website, Mara on Voice, Scout the lead scraper) live with animation; act (launch campaigns, call, text, Viber, email, single or bulk, like Zoho Cliq slash commands); browse ~8,000 Zoho CRM Pre_Leads with a fast grid + Lead 360 drawer; each channel UI looks like the native platform (WhatsApp Web, Viber Desktop, Google Messages, Gmail, phone dialer). Quality bar: Linear, Vercel dashboard, Intercom inbox.

## 2. Information architecture
```
/          Mission Control (animated live ops home)
/inbox     Unified "Needs Human" + all-channel inbox
/whatsapp  WhatsApp Web clone
/viber     Viber clone (NEW)
/sms       Google Messages clone
/email     Gmail clone
/calls     Voice (Mara) dialer/recordings
/website   Website chat (RGF-branded)
/crm       Zoho CRM Pre-Leads grid + Lead 360 (NEW)
/campaigns Action Center (NEW)
/settings  Agent health (later)
```
Shell: collapsible left sidebar (icons + labels, brand-colored dot + live count badge per channel), slim top bar with ⌘K search, "Live" pulse (green when last poll < 30s), bell, user menu. Mobile < 768px: bottom tab bar (Home, Inbox, CRM, Campaigns, More), list → detail push nav in every channel. Shell uses RGF brand; each channel route container sets `data-channel="whatsapp|viber|sms|email|voice|web|crm"` to swap CSS variables.

## 3. Backend contract (n8n `rareglobalfood.app.n8n.cloud`)
All POST webhooks require header `Authorization: <N8N_WEBHOOK_AUTH>` (server only). Base `N8N_BASE=https://rareglobalfood.app.n8n.cloud/webhook` (existing read routes use `N8N_WEBHOOK_BASE_URL`; fall back to it).

### 3.1 Read feeds
- WhatsApp / SMS conversations: existing `/api/whatsapp-conversations`, `/api/sms-conversations` — keep.
- Viber: `GET /lead-gen-viber-conversations` (NOT published yet). Same shape as SMS + `openerDeliveryStatus`, `smsFallbackSent`, `duplicateRowCount`. Response `{ count, duplicateRowsMerged, conversations: [...] }` (see `Conversation` in `src/lib/channels.ts`). Create `src/routes/api/viber-conversations.ts` mirroring SMS proxy; return `{ connected:false, conversations:[] }` gracefully on 404.
- Website: `GET /martin-chat-dashboard-sessions` — keep.
- Vapi calls: existing `api/vapi-calls.ts`; poll for `in-progress`/`ringing`/`queued` for live-call animation.
- Gmail: existing server helpers; keep filters.

### 3.2 Action endpoints (exist)
| Action | path | Body |
|---|---|---|
| Bulk WhatsApp openers | `POST /whatsapp-bulk-trigger` | `{ limit, sort_order }` |
| Bulk SMS openers | `POST /5630e167-fd05-44f9-88b4-aed5a72f3622` | `{ limit: N }` — 0/empty = ALL eligible, UI/server must NEVER send 0 |
| Bulk Viber openers | `POST /b3e9d0a6-7c41-4f2e-9a85-viber-bulk-leadgen` | `{ limit: N }` (not published) |
| Bulk email | `POST /email-outreach-trigger` | `{ limit, sort_order }` |
| Single WhatsApp opener | `POST /zoho-prelead-webhook` | `{ leadId, leadName, companyName, phone, product, channel }` |
| Single SMS opener | `POST /zoho-prelead-sms-webhook` | same, phone `+63…` |
| Single Viber opener | `POST /zoho-prelead-viber-webhook` | same (not published) |
| Mara batch call | `POST /vapi-outbound-call` | Calls the 3 newest Pre-Leads. NEVER use for single-lead calling. Expose only in /campaigns labeled "Calls the 3 newest Pre-Leads". |

Bulk triggers reply "Workflow got started." Progress shown by diffing the channel feed since run start.

### 3.3 Future n8n endpoints (feature-flagged)
Flags: `FEATURE_MANUAL_REPLY`, `FEATURE_SINGLE_CALL`, `FEATURE_CAMPAIGN_RUNS`, `FEATURE_AGENT_EVENTS`, `FEATURE_CRM`.
1. `POST /dashboard-manual-reply` `{ channel, phone|sessionId, text, agentName }` — human reply, AI pauses.
2. `POST /dashboard-single-call` `{ leadId, phone, companyName, leadName, product, channel }` → `{ callId }`.
3. `GET /dashboard-campaign-runs` → `{ runId, channel, requested, sent, skipped, failed, status, startedAt, finishedAt, triggeredBy }[]`.
4. `GET /dashboard-agent-events?since=ISO`.
5. `GET /dashboard-agent-health`.
Render `role:"human"` messages now as "Sales rep" bubble with person avatar, distinct from Martin.

### 3.4 Zoho CRM Pre_Leads (~8k)
Preferred: n8n `GET /dashboard-pre-leads` returns compact array. `src/routes/api/crm/pre-leads.ts` proxies it with `Cache-Control: s-maxage=600, stale-while-revalidate=1800`. Fallback: Zoho self-client (`ZOHO_CLIENT_ID`, `ZOHO_CLIENT_SECRET`, `ZOHO_REFRESH_TOKEN`, `ZOHO_API_DOMAIN`) paginating `GET /crm/v8/Pre_Leads?per_page=200&page_token=…` with token caching like `gmail-server.ts`. If neither configured, return `{ connected:false, leads:[] }`. Single record: `GET /api/crm/pre-lead?id=`. Known fields: `id, First_Name, Last_Name, Name (company), Lead_Phone, Associated_Products, Channel, Created_Time, Modified_Time` (+ email/province/source/website if present; don't guess others).

### 3.5 Gmail sending
`POST /api/gmail-send` (zod: to, cc, subject, html, threadId?, inReplyTo?) via Gmail `users.messages.send` with threadId + In-Reply-To/References. Needs gmail.send/modify scope. Add `HUMAN-HANDLED` label on replied threads.

## 4. Design system
### 4.1 Shell (RGF brand)
```css
:root { --rgf-red:#86000B; --rgf-red-600:#A3101C; --rgf-green:#33673B; --rgf-ink:#1B2419; --rgf-beige:#FFEBCE; --rgf-cream:#FFF8F0; --surface:#FFFFFF; --border:#EDE6DC; --muted:#6B6F68; --radius:14px; --shadow-card:0 1px 2px rgba(27,36,25,.06),0 8px 24px rgba(27,36,25,.06); }
.dark { --surface:#151A14; --rgf-cream:#0E120D; --rgf-ink:#F2EEE7; --border:#262D24; --muted:#9AA096; }
```
Inter (UI) + JetBrains Mono (IDs, phones, timers). Tabular numerals for KPIs.

### 4.2 Channel tokens
```css
[data-channel="whatsapp"]{--ch:#25D366;--ch-primary:#00A884;--ch-header:#008069;--ch-app-bg:#F0F2F5;--ch-panel:#FFFFFF;--ch-chat-bg:#EFEAE2;--ch-out:#D9FDD3;--ch-in:#FFFFFF;--ch-text:#111B21;--ch-text-2:#667781;--ch-divider:#E9EDEF;--ch-tick-read:#53BDEB;}
.dark [data-channel="whatsapp"]{--ch-app-bg:#111B21;--ch-panel:#111B21;--ch-header:#202C33;--ch-chat-bg:#0B141A;--ch-out:#005C4B;--ch-in:#202C33;--ch-text:#E9EDEF;--ch-text-2:#8696A0;--ch-divider:#2A3942;}
[data-channel="viber"]{--ch:#7360F2;--ch-primary:#7360F2;--ch-deep:#59267C;--ch-soft:#8F5DB7;--ch-app-bg:#F7F6FB;--ch-panel:#FFFFFF;--ch-chat-bg:#FFFFFF;--ch-out:#E8E4FD;--ch-in:#F1F0F5;--ch-text:#1E1B2E;--ch-text-2:#7A7790;--ch-divider:#ECEAF3;}
[data-channel="sms"]{--ch:#1A73E8;--ch-primary:#0B57D0;--ch-app-bg:#F8FAFD;--ch-panel:#FFFFFF;--ch-chat-bg:#FFFFFF;--ch-out:#D3E3FD;--ch-out-text:#041E49;--ch-in:#E9EEF6;--ch-text:#1F1F1F;--ch-text-2:#5E5E5E;}
[data-channel="email"]{--ch:#EA4335;--ch-red-dark:#C5221F;--ch-blue:#4285F4;--ch-yellow:#FBBC04;--ch-green:#34A853;--ch-app-bg:#F6F8FC;--ch-panel:#FFFFFF;--ch-compose:#C2E7FF;--ch-nav-active:#D3E3FD;--ch-row-read:#F2F6FC;--ch-row-selected:#C2DBFF;--ch-link:#0B57D0;--ch-star:#F4B400;--ch-text:#1F1F1F;--ch-text-2:#444746;}
[data-channel="voice"]{--ch:#F97316;--ch-accept:#34C759;--ch-hangup:#FF3B30;--ch-app-bg:#0F1412;--ch-panel:#161C19;--ch-text:#F2F4F3;--ch-text-2:#9BA6A0;}
[data-channel="web"]{--ch:#86000B;} [data-channel="crm"]{--ch:#226DB4;} [data-channel="scout"]{--ch:#0EA5A4;}
```
Draw our own chat wallpaper pattern (no WhatsApp doodle asset). White text on #25D366 fails contrast; use --ch-header/--ch-primary for text-bearing surfaces.

### 4.3 Motion
150–250ms UI, 600–1200ms travel effects, spring `{ stiffness: 380, damping: 32 }` for panels. New list items slide/fade from top + brief flash in channel color at 12%. KPI count-up. Typing indicator (3 dots) when agent message < 8s ago. Live call: pulsing ring + waveform bars + mm:ss. Reduced motion → static.

## 5. Phases (summary)
**Phase 1 Foundations/security:** server login `POST /api/auth/login` against `DASHBOARD_USERS` env JSON `[{email,name,role,passwordHash(bcrypt)}]`, httpOnly Secure SameSite=Lax HMAC-signed session cookie (`SESSION_SECRET`); middleware rejects `/api/*` (except auth) without session; roles viewer/agent/admin; `triggeredBy` on every action. `src/lib/n8n-actions.server.ts` `callN8n(path, body)` with auth header, 20s timeout, zod input, dry-run short-circuit, `{ok,status,data,error}`. Bulk = admin + typed confirmation. Inactivity logout 5 min, except Live Wall `/?wall=1` (no logout, hides actions). `usePolling` (done).

**Phase 2 Mission Control `/`:** A) Live Ops SVG canvas: Scout lead sources → Zoho CRM Pre-Leads counter → six Agent Pods (WhatsApp/SMS/Viber/Email Martin, Voice Mara, Website Martin) → Outcomes (Replied, Price/brochure sent, Meeting booked, Escalated). Curved paths; glowing dots travel per event (lead_created Scout→CRM, opener_sent CRM→pod, reply_in reverse, meeting/escalated pod→Outcomes), cap 30 concurrent. Pod: glyph + avatar, status chip Idle|Sending|Conversing|On call|Paused|Offline, today counters, typewriter ticker (company name only, 60 chars). On call: pulsing ring + waveform + timer. Click pod → channel tab. Scout pod: "Next run Fri 9:00 AM" countdown. B) KPI strip (6 StatCards, count-up + sparkline): Leads in CRM, Contacted today, Replies today (hasReplied), Reply rate %, Meetings (7d), Escalations open. C) Funnel per channel. D) Live Activity Feed (virtualized, filter chips, animate in). E) Needs Human queue (humanEscalated/website escalated/call Transferred, sorted by wait, red pulse > 15 min). F) Channel performance (response rate, median time-to-first-reply, best-hour heatmap Manila, top products). Mobile: vertical pods.

**Phase 3 Channel tabs:** shared: left list (search, chips All/Replied/Not replied/Escalated/Meeting booked, sort by last activity), right thread, info drawer (lead details, flags, meeting link, Zoho link from leadId, product, discount attempts), keyboard j/k, `/` search, deep link `?phone=`.
- WhatsApp: WhatsApp Web layout, initials avatars, green badges, own wallpaper pattern, tails on first bubble of group, timestamp + ticks bottom-right, date pills, system pills ("Price list sent", "Meeting booked …" with Meet link). Martin = outgoing with "AI" tag; human = outgoing with rep name. Composer enabled when FEATURE_MANUAL_REPLY.
- Viber: purple, rounded-rect bubbles, delivery chip from openerDeliveryStatus, amber "Fell back to SMS" chip linking to SMS thread, duplicateRowCount>1 warning in drawer. Clean "not connected" empty state until feed live; works with zero code changes once live.
- SMS: Google Messages look, "Sent via Telerivet" footnote, gateway-offline banner from agent-health.
- Email: Gmail clone — Compose pill, nav (Inbox, Starred, Sent, AI Replied, Needs Human, Campaign Openers), rounded search, filter chips, rows (checkbox, star via `/api/gmail-flag`, bold unread, subject — snippet, date), pagination "1–40 of N", thread view as collapsible cards with "Martin (AI)" chip, sanitized HTML in sandboxed iframe auto-height, Reply/Reply all/Forward inline composer, floating bottom-right Compose window. Send via `/api/gmail-send`.
- Calls: dark dialer, cards with outcome chip, duration, cost; detail: wavesurfer orange waveform, transcript bubbles synced to playback (`secondsFromStart`), summary, tool-call chips, live call banner (poll 5s). "Call this lead" flagged FEATURE_SINGLE_CALL.
- Website: RGF chat, chips AI Handling / Needs Human, visitor info, PDF file cards, composer behind FEATURE_MANUAL_REPLY.

**Phase 4 CRM `/crm`:** TanStack Table + Virtual, sticky header, column resize/hide (localStorage), density toggle. Columns: Company, Contact, Phone (mono, copy), Email, Channel segment, Products chips, Province/City, Source, Created, Modified, Outreach dots (filled contacted / ring replied / star meeting), Stage, Owner. Client-side join by normalized phone|leadId|email from feeds. Filters: fuzzy search, facets, saved views ("Never contacted", "Replied no meeting", "Industrial accounts"), in URL search params. Bulk select → Send WhatsApp/SMS/Viber opener, Export CSV; sequential 3–6s gap, progress toast, confirm dialog, cap 50. Lead 360 drawer (480px): header, contact actions (disabled with reason), cross-channel timeline, flags, raw fields. Header stats.

**Phase 5 Campaigns `/campaigns`:** cards per channel (WhatsApp, SMS, Viber, Email, Voice batch) — limit (min 1, default 10, max per role), sort order, eligible-count preview, Launch. ConfirmSendDialog: channel, count, first 5 companies, type the number to confirm; 0/blank blocked. Runs list with queued→running→done animation; counters from FEATURE_CAMPAIGN_RUNS or fallback diffing feed since startedAt. "View N replies from this run".

**Phase 6 Polish:** ⌘K palette (jump to lead/thread, run actions, toggle dark), notifications (toast + bell on diffs), dark mode, skeletons, empty/error states, a11y, code splitting, refreshed login page (split layout, animated pods).

## 6. Event model
```ts
type AgentEvent = { id: string; ts: string; channel: "whatsapp"|"sms"|"viber"|"email"|"voice"|"web"|"scout"|"crm"; agent: "Martin"|"Mara"|"Scout";
  kind: "lead_created"|"opener_sent"|"reply_in"|"reply_out"|"price_sent"|"brochure_sent"|"form_sent"|"meeting_booked"|"escalated"|"call_started"|"call_ended"|"call_transferred"|"human_reply";
  leadId?: string; phone?: string; email?: string; company?: string; leadName?: string; preview?: string; meta?: Record<string, unknown>; };
```
`GET /api/activity?since=` fetches all feeds in parallel, flattens to events (first Martin msg = opener_sent, customer = reply_in, later Martin = reply_out, flags = price/brochure/meeting/escalated, Vapi = call events), dedupe, latest 300, `s-maxage=10`. Client polls 10s on `/`, 30s elsewhere, animates only unseen ids. Live calls: poll Vapi 5s on `/` and `/calls`.

## 7. Server routes
```
POST /api/auth/login | POST /api/auth/logout | GET /api/auth/me   (me returns {user, flags, dryRun})
GET  /api/viber-conversations
GET  /api/activity?since=
GET  /api/crm/pre-leads | GET /api/crm/pre-lead?id=
POST /api/actions/opener  { channel: "whatsapp"|"sms"|"viber", lead:{leadId,leadName,companyName,phone,product,channel} }
POST /api/actions/bulk    { channel: "whatsapp"|"sms"|"viber"|"email"|"voice_batch", limit, sortOrder?, runId }
POST /api/actions/call    (FEATURE_SINGLE_CALL)
POST /api/actions/reply   (FEATURE_MANUAL_REPLY) { channel, phone?, sessionId?, text }
POST /api/gmail-send
GET  /api/campaign-runs   (FEATURE_CAMPAIGN_RUNS)
GET  /api/agent-health
```
Every action logs `{ user, action, channel, count, leadIds, ts }`; response always `{ ok, data?, error?, dryRun? }`.

### Env (`.env.example`)
```
SESSION_SECRET=
DASHBOARD_USERS=[{"email":"","name":"","role":"admin","passwordHash":""}]
ACTIONS_DRY_RUN=true
N8N_BASE=https://rareglobalfood.app.n8n.cloud/webhook
N8N_WEBHOOK_AUTH=
FEATURE_MANUAL_REPLY=false
FEATURE_SINGLE_CALL=false
FEATURE_CAMPAIGN_RUNS=false
FEATURE_AGENT_EVENTS=false
FEATURE_CRM=false
ZOHO_CLIENT_ID= ZOHO_CLIENT_SECRET= ZOHO_REFRESH_TOKEN= ZOHO_API_DOMAIN=https://www.zohoapis.com
```

## 8. Acceptance
- No secret reachable from browser bundle.
- ACTIONS_DRY_RUN=true → every send completes with "Dry run" toast and no network call to n8n/Gmail/Vapi.
- Mission Control animates new events within one poll; calm with reduced motion.
- Channel tabs recognisable; identity colours consistent everywhere.
- CRM grid scrolls 8k rows smoothly, filters < 100ms, URL reproduces view.
- Viber shows "not connected" until feed live.
- Single-lead call disabled until FEATURE_SINGLE_CALL=true.
- Usable at 375px.
- Preserve: test-company exclusion, real-reply logic, Gmail logistics filter, Vapi recording proxy.
