# Rare Global Food — Lead Gen Dashboard: Full Codebase Walkthrough

This single document explains **every file in `src/`**, line by line, in plain English. It's organized into three parts:

1. **Security flags** — sensitive findings you should know about first.
2. **Application code** — the custom logic that makes this app what it is (routing, pages, lib helpers, server).
3. **UI component library** (`src/components/ui/`) — the shadcn/ui primitive components used to build the pages.

Tech stack: **React 18 + TanStack Start/Router (file-based routing, SSR) + TanStack Query + Tailwind CSS v4 + shadcn/ui (Radix UI primitives) + Recharts + react-hook-form**.

---

## 0. Security flags (read this first)

Secrets that used to be hardcoded directly in source (Twilio SID/Token, Vapi private key, the login email/password) have since been moved into environment variables (`.env`, gitignored — see `.env.example` for the variable names). The code samples below are kept as historical documentation of the file structure, with secret values redacted.

| File | What's read from env |
|---|---|
| `src/lib/auth.ts` | `VITE_LOGIN_EMAIL` / `VITE_LOGIN_PASSWORD` — still a client-side-only check, not real auth security. |
| `src/routes/api/twilio-messages.ts` | `TWILIO_ACCOUNT_SID` / `TWILIO_AUTH_TOKEN` (server-only). |
| `src/routes/api/vapi-calls.ts` | `VAPI_PRIVATE_KEY` / `VAPI_ASSISTANT_ID` (server-only). |

---

## 1. Application code

### 1.1 `src/lib/auth.ts` — login/session helper

```ts
export const AUTH_KEY = "rgf_isLoggedIn";
export const LOGIN_EMAIL = import.meta.env.VITE_LOGIN_EMAIL;
export const LOGIN_PASSWORD = import.meta.env.VITE_LOGIN_PASSWORD;
```
Three module-level constants. `AUTH_KEY` is the `localStorage` key used to remember whether the user is logged in. `LOGIN_EMAIL`/`LOGIN_PASSWORD` are the one and only valid credential pair, read from `.env` — there is no backend user database; this is the entire "auth system."

```ts
export function isLoggedIn(): boolean {
  if (typeof window === "undefined") return false;
  return window.localStorage.getItem(AUTH_KEY) === "true";
}
```
Reads login state. The `typeof window === "undefined"` guard makes this safe to call during server-side rendering (TanStack Start renders on the server first, where `window` doesn't exist) — it just reports "not logged in" on the server, and the real check happens after hydration in the browser.

```ts
export function setLoggedIn(v: boolean) {
  if (typeof window === "undefined") return;
  if (v) window.localStorage.setItem(AUTH_KEY, "true");
  else window.localStorage.removeItem(AUTH_KEY);
}
```
Writes login state: setting `true` stores the string `"true"` in `localStorage`; setting `false` deletes the key entirely (used for logout).

---

### 1.2 `src/lib/brand.tsx` — logo component

```tsx
export function Logo({ className = "" }: { className?: string }) {
  return (
    <div className={`leading-none select-none ${className}`} style={{ color: "#86000B" }}>
      <div className="text-2xl font-black tracking-tight">RARE</div>
      <div className="text-[9px] font-bold tracking-[0.2em]">GLOBAL FOOD</div>
    </div>
  );
}
```
A single stateless component rendering the two-line wordmark "RARE / GLOBAL FOOD" in the brand red (`#86000B`). Accepts an optional `className` for layout placement (used in the login page and the app header). `select-none` prevents users from accidentally text-selecting the logo; `leading-none` tightens line height so the two stacked lines sit close together.

---

### 1.3 `src/lib/email-template.ts` — HTML email renderer

```ts
import type { EmailRow } from "./sheets";

export function renderEmailHtml(row: EmailRow): string {
  const company = row.Company_Name || "your team";
  const contact = row.Contact_Name || "there";
  const product = row.Product_Offered || "premium food products";
  return `...`;
}
```
Takes one row of email-log data (from the Google Sheet) and returns an HTML string reproducing the actual outreach email that was sent — a templated sales pitch from "Martin Reyes" introducing Rare Global Food Trading Corp. Falls back to generic placeholders (`"your team"`, `"there"`, `"premium food products"`) when a field is blank. The HTML uses inline styles (required since this is rendered via `dangerouslySetInnerHTML` in the Email tab, where no external stylesheet applies) and the brand red `#86000B` for links/accents.

```ts
function escapeHtml(s: string) {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!));
}
```
A small HTML-escaping helper applied to every interpolated value (`company`, `contact`, `product`) before they're inserted into the template string. This prevents stored XSS: since the data comes from a public Google Sheet and is rendered via `dangerouslySetInnerHTML`, any `<script>` or HTML tags typed into a sheet cell would otherwise execute in the dashboard. Each of the five special characters is mapped to its HTML entity via a lookup object.

---

### 1.4 `src/lib/error-capture.ts` — out-of-band error capture for SSR

```ts
let lastCapturedError: { error: unknown; at: number } | undefined;
const TTL_MS = 5_000;

function record(error: unknown) {
  lastCapturedError = { error, at: Date.now() };
}
```
Module-level mutable state holding the most recent uncaught error plus a timestamp. `TTL_MS` (5 seconds) bounds how "fresh" a captured error must be to be considered relevant — this prevents a stale, unrelated error from a previous request being misreported for the current one in a server process.

```ts
if (typeof globalThis.addEventListener === "function") {
  globalThis.addEventListener("error", (event) => record((event as ErrorEvent).error ?? event));
  globalThis.addEventListener("unhandledrejection", (event) =>
    record((event as PromiseRejectionEvent).reason),
  );
}
```
On module load, if the runtime supports global event listeners (true in both browsers and most server runtimes), it subscribes to the two ways JS can fail silently: uncaught synchronous errors (`"error"`) and unhandled promise rejections (`"unhandledrejection"`). Both handlers funnel into `record()`.

```ts
export function consumeLastCapturedError(): unknown {
  if (!lastCapturedError) return undefined;
  if (Date.now() - lastCapturedError.at > TTL_MS) {
    lastCapturedError = undefined;
    return undefined;
  }
  const { error } = lastCapturedError;
  lastCapturedError = undefined;
  return error;
}
```
A "consume once" getter: returns the captured error only if it's still within the 5-second TTL, then immediately clears the stored state either way (so the same error is never reported twice and stale state doesn't leak across requests). The code comment in the file explains *why* this exists: TanStack Start's underlying server (h3) sometimes swallows an in-handler `throw` into a generic JSON 500 response before `server.ts`'s own try/catch can see the real error — this module lets `server.ts` recover the original error for logging even though it can no longer catch it directly.

---

### 1.5 `src/lib/error-page.ts` — fallback HTML error page

```ts
export function renderErrorPage(): string {
  return `<!doctype html> ... </html>`;
}
```
Returns a complete, self-contained HTML document (inline `<style>`, no external assets) shown whenever the server can't render the real React app due to an unrecoverable SSR error. It has a heading ("This page didn't load"), an explanation, and two actions: a "Try again" button that calls `location.reload()` and a "Go home" link to `/`. Being fully self-contained matters because at the point this is used, the normal React/CSS pipeline has already failed.

---

### 1.6 `src/lib/lovable-error-reporting.ts` — client error telemetry bridge

```ts
type LovableErrorOptions = { mechanism?: ...; handled?: boolean; severity?: ... };
type LovableEvents = { captureException?: (...) => void };
declare global { interface Window { __lovableEvents?: LovableEvents; } }
```
Type declarations describing an external error-reporting hook (`window.__lovableEvents.captureException`) that's expected to be injected into the page by the hosting/build platform (Lovable) at runtime — this file doesn't define it, just describes its shape so TypeScript is happy when calling it.

```ts
export function reportLovableError(error: unknown, context: Record<string, unknown> = {}) {
  if (typeof window === "undefined") return;
  window.__lovableEvents?.captureException?.(
    error,
    { source: "react_error_boundary", route: window.location.pathname, ...context },
    { mechanism: "react_error_boundary", handled: false, severity: "error" },
  );
}
```
A safe wrapper for reporting a caught React error to that external hook. Guards against SSR (`window` undefined) and against the hook not existing (`?.` optional chaining), so calling this function is always safe even outside the Lovable platform. Automatically tags every report with the current route and marks it as an unhandled, error-severity event coming from a React error boundary. Called from `__root.tsx`'s `ErrorComponent`.

---

### 1.7 `src/lib/sheets.ts` — Google Sheets data source

```ts
import Papa from "papaparse";

export const EMAIL_SHEET_ID = "167X8mfQSLCZU65XlMsGF1vG2qJdyeDY2rLvH_f9XMDk";
export const SMS_SHEET_ID = "1ofyEh14RUYOSFJzBJfAqc9FVlhp9eQn51BSTx_MKEgA";
```
The two Google Sheets that back this dashboard: one logging sent emails, one logging sent SMS messages. The IDs are the spreadsheet IDs from each sheet's URL (not secret credentials — these sheets are presumably published/public, since they're fetched directly from the browser with no auth header).

```ts
export function csvUrl(sheetId: string, tab: string) {
  return `https://docs.google.com/spreadsheets/d/${sheetId}/gviz/tq?tqx=out:csv&sheet=${encodeURIComponent(tab)}`;
}
```
Builds the special Google Sheets "visualization query" URL that exports a single named tab/sheet as CSV, without needing the Sheets API or an API key. `encodeURIComponent` escapes the tab name (e.g. `"Sent Log"`) for safe inclusion in the URL.

```ts
export async function fetchSheet<T = Record<string, string>>(sheetId: string, tab: string): Promise<T[]> {
  const res = await fetch(csvUrl(sheetId, tab));
  if (!res.ok) throw new Error(`Sheet fetch failed: ${res.status}`);
  const text = await res.text();
  const parsed = Papa.parse<T>(text, { header: true, skipEmptyLines: true });
  return parsed.data;
}
```
Generic fetch-and-parse helper: downloads the CSV export, throws if the HTTP request failed, then parses it with PapaParse using `header: true` (so the first CSV row becomes object keys) and `skipEmptyLines: true`. The generic type parameter `T` lets callers specify the expected row shape (`EmailRow` or `SmsRow`) for type-safe access. This is the single function every dashboard tab uses to pull live data.

```ts
export interface EmailRow { Date_Sent: string; Time_Sent: string; Lead_ID: string; ... }
export interface SmsRow { Date_Sent: string; Time_Sent: string; Lead_ID: string; ... }
```
Two TypeScript interfaces describing the exact column names expected in each sheet's "Sent Log" tab — these must match the spreadsheet's header row exactly, since PapaParse uses the header row as object keys.

---

### 1.8 `src/lib/utils.ts` — className merge helper

```ts
import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
```
The ubiquitous shadcn/ui `cn()` helper, used in essentially every component in `src/components/ui/`. `clsx(inputs)` conditionally joins class name fragments (handling `undefined`/`false`/objects/arrays gracefully). `twMerge(...)` then resolves conflicting Tailwind utility classes (e.g. if both `"p-2"` and `"p-4"` end up in the string, `twMerge` keeps only the last one instead of leaving both, which would otherwise cause unpredictable CSS specificity issues). This is what lets every UI primitive accept a `className` prop that can override its own default styling.

---

### 1.9 `src/hooks/use-mobile.tsx` — responsive breakpoint hook

```tsx
const MOBILE_BREAKPOINT = 768;

export function useIsMobile() {
  const [isMobile, setIsMobile] = React.useState<boolean | undefined>(undefined);

  React.useEffect(() => {
    const mql = window.matchMedia(`(max-width: ${MOBILE_BREAKPOINT - 1}px)`);
    const onChange = () => {
      setIsMobile(window.innerWidth < MOBILE_BREAKPOINT);
    };
    mql.addEventListener("change", onChange);
    setIsMobile(window.innerWidth < MOBILE_BREAKPOINT);
    return () => mql.removeEventListener("change", onChange);
  }, []);

  return !!isMobile;
}
```
A hook that tracks whether the viewport is narrower than 768px. Starts as `undefined` (unknown, since `window` isn't available during SSR) and is set synchronously on mount, then kept up to date via a `matchMedia` `"change"` listener whenever the viewport crosses the breakpoint (e.g. window resize, device rotation). The listener is cleaned up on unmount. `!!isMobile` coerces the `undefined` initial state to `false` for callers, since `undefined` would be a meaningless third state to consumers. Used by `Sidebar` (`components/ui/sidebar.tsx`) to switch between a permanent sidebar and an off-canvas sheet on mobile.

---

### 1.10 `src/router.tsx` — TanStack Router factory

```tsx
import { QueryClient } from "@tanstack/react-query";
import { createRouter } from "@tanstack/react-router";
import { routeTree } from "./routeTree.gen";

export const getRouter = () => {
  const queryClient = new QueryClient();

  const router = createRouter({
    routeTree,
    context: { queryClient },
    scrollRestoration: true,
    defaultPreloadStaleTime: 0,
  });

  return router;
};
```
A factory function (not a singleton) that builds a fresh router + QueryClient pair every time it's called. This matters for SSR: each server request needs its own isolated `QueryClient` so cached data from one user's request can never leak into another's response. `routeTree` is the auto-generated route graph (see §1.16). `scrollRestoration: true` makes the router restore scroll position on back/forward navigation. `defaultPreloadStaleTime: 0` disables the router's own preload-data caching window so route loaders always treat preloaded data as immediately stale (letting React Query's own cache/staleness rules be the source of truth instead).

---

### 1.11 `src/start.ts` — TanStack Start server instance + error middleware

```ts
import { createStart, createMiddleware } from "@tanstack/react-start";
import { renderErrorPage } from "./lib/error-page";

const errorMiddleware = createMiddleware().server(async ({ next }) => {
  try {
    return await next();
  } catch (error) {
    if (error != null && typeof error === "object" && "statusCode" in error) {
      throw error;
    }
    console.error(error);
    return new Response(renderErrorPage(), {
      status: 500,
      headers: { "content-type": "text/html; charset=utf-8" },
    });
  }
});

export const startInstance = createStart(() => ({
  requestMiddleware: [errorMiddleware],
}));
```
Defines a server-side request middleware that wraps every request handled by TanStack Start. It calls `next()` to continue the request pipeline; if that throws, it re-throws known HTTP errors unchanged (objects with a `statusCode` property — these are intentional, structured errors like 404s that the framework needs to handle natively), but for any *other* (unexpected) error, it logs it and returns the friendly fallback HTML page from `error-page.ts` with a 500 status instead of letting a raw stack trace or generic error leak to the user. `createStart(() => ({...}))` registers this middleware as part of the app's server configuration, consumed by `routeTree.gen.ts`'s type registration and the build tooling.

---

### 1.12 `src/server.ts` — Cloudflare/edge fetch entrypoint with crash recovery

```ts
import "./lib/error-capture";
import { consumeLastCapturedError } from "./lib/error-capture";
import { renderErrorPage } from "./lib/error-page";

type ServerEntry = { fetch: (request: Request, env: unknown, ctx: unknown) => Promise<Response> | Response };

let serverEntryPromise: Promise<ServerEntry> | undefined;

async function getServerEntry(): Promise<ServerEntry> {
  if (!serverEntryPromise) {
    serverEntryPromise = import("@tanstack/react-start/server-entry").then(
      (m) => (m.default ?? m) as ServerEntry,
    );
  }
  return serverEntryPromise;
}
```
The actual `fetch`-style entrypoint for the deployed server (this shape — a default-exported object with a `fetch(request, env, ctx)` method — matches the Cloudflare Workers / edge-runtime convention). `import "./lib/error-capture"` runs that module purely for its side effect of registering the global error listeners. `getServerEntry()` lazily imports TanStack Start's generated server handler exactly once and caches the resulting promise, since dynamic `import()` is relatively expensive and this entrypoint may be invoked per-request.

```ts
async function normalizeCatastrophicSsrResponse(response: Response): Promise<Response> {
  if (response.status < 500) return response;
  const contentType = response.headers.get("content-type") ?? "";
  if (!contentType.includes("application/json")) return response;

  const body = await response.clone().text();
  if (!body.includes('"unhandled":true') || !body.includes('"message":"HTTPError"')) {
    return response;
  }

  console.error(consumeLastCapturedError() ?? new Error(`h3 swallowed SSR error: ${body}`));
  return new Response(renderErrorPage(), {
    status: 500,
    headers: { "content-type": "text/html; charset=utf-8" },
  });
}
```
Inspects the response *after* the framework has already produced it, looking specifically for the signature of h3's generic catch-all error response: status ≥ 500, JSON content type, and a body containing `"unhandled":true` and `"message":"HTTPError"`. If detected, it logs the real underlying error (recovered via `consumeLastCapturedError()`, falling back to a generic error built from the JSON body if nothing was captured) and replaces the raw JSON error with the friendly HTML error page. `response.clone()` is required because a `Response` body can only be read once, and the original (untouched) response still needs to be returned in the non-matching branches.

```ts
export default {
  async fetch(request: Request, env: unknown, ctx: unknown) {
    try {
      const handler = await getServerEntry();
      const response = await handler.fetch(request, env, ctx);
      return await normalizeCatastrophicSsrResponse(response);
    } catch (error) {
      console.error(error);
      return new Response(renderErrorPage(), {
        status: 500,
        headers: { "content-type": "text/html; charset=utf-8" },
      });
    }
  },
};
```
The exported handler: gets the real TanStack Start handler, runs the request through it, and post-processes the response to catch the h3-swallowed-error case. A second outer `try/catch` is a last line of defense for errors thrown *before* a response is even produced (e.g. the dynamic import itself failing) — those are logged and also converted to the friendly error page.

---

### 1.13 `src/routes/__root.tsx` — root route: HTML shell, providers, 404/error boundaries

```tsx
function NotFoundComponent() {
  return ( /* "404 — Page not found" card with a "Go home" Link */ );
}
```
Rendered by the router whenever no route matches the URL. Centered card with a 404 heading and a link back to `/`.

```tsx
function ErrorComponent({ error, reset }: { error: Error; reset: () => void }) {
  console.error(error);
  const router = useRouter();
  useEffect(() => {
    reportLovableError(error, { boundary: "tanstack_root_error_component" });
  }, [error]);

  return ( /* "This page didn't load" card with "Try again" and "Go home" */ );
}
```
The router's top-level error boundary component, invoked whenever a route's component throws during render. Logs the error to the console, then in a `useEffect` reports it to the external Lovable error-tracking hook (tagged with which boundary caught it). Provides a "Try again" button that calls `router.invalidate()` (forces TanStack Router to refetch/recompute route data) followed by the boundary's own `reset()` (clears the error state so the component tree re-renders), plus a plain `<a href="/">` escape hatch.

```tsx
export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()({
  head: () => ({ meta: [...], links: [{ rel: "stylesheet", href: appCss }] }),
  shellComponent: RootShell,
  component: RootComponent,
  notFoundComponent: NotFoundComponent,
  errorComponent: ErrorComponent,
});
```
Defines the root of the entire route tree, typed so every nested route's context includes a `queryClient`. `head()` declares document `<meta>` tags (charset, viewport, title "Rare Global Food — Lead Gen Dashboard", description, Open Graph tags) and links in the compiled `styles.css` stylesheet (`appCss`, imported as a URL via Vite's `?url` suffix). `shellComponent` controls the outer HTML document shape (used only during SSR's initial document render); `component` is the actual React tree rendered inside that shell on every navigation.

```tsx
function RootShell({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <head><HeadContent /></head>
      <body>
        {children}
        <Scripts />
      </body>
    </html>
  );
}
```
The literal `<html>`/`<head>`/`<body>` wrapper emitted during SSR. `<HeadContent />` is TanStack Router's component that renders all the `head()` meta/link tags collected from every matched route. `<Scripts />` injects the necessary `<script>` tags for client-side hydration, placed at the end of `<body>` so it doesn't block initial HTML parsing.

```tsx
function RootComponent() {
  const { queryClient } = Route.useRouteContext();
  return (
    <QueryClientProvider client={queryClient}>
      <Outlet />
    </QueryClientProvider>
  );
}
```
The actual app root rendered inside the shell. Pulls the per-request `queryClient` out of the route context (the same one created in `router.tsx`) and wraps the entire app in React Query's provider so every page can call `useQuery`. `<Outlet />` is where the matched child route (`_app.tsx` or `login.tsx`) renders.

---

### 1.14 `src/routes/_app.tsx` — authenticated app shell (header + nav + auth guard)

```tsx
export const Route = createFileRoute("/_app")({
  component: AppLayout,
});
```
A **pathless layout route** (the `_` prefix in `_app` means it contributes no URL segment of its own) that wraps every authenticated page (`/`, `/email`, `/sms`, `/whatsapp`, `/calls`) with a shared header/nav and an auth check.

```tsx
const TABS = [
  { to: "/", label: "Home" },
  { to: "/email", label: "Email" },
  { to: "/sms", label: "SMS" },
  { to: "/whatsapp", label: "WhatsApp" },
  { to: "/calls", label: "Calls" },
] as const;
```
The five top-nav tabs, each mapping a route path to a display label.

```tsx
function AppLayout() {
  const navigate = useNavigate();
  const [ready, setReady] = useState(false);
  const pathname = useRouterState({ select: (s) => s.location.pathname });

  useEffect(() => {
    if (!isLoggedIn()) {
      navigate({ to: "/login" });
    } else {
      setReady(true);
    }
  }, [navigate]);

  if (!ready) return <div className="min-h-screen" style={{ backgroundColor: "#FFEBCE" }} />;
  ...
}
```
This is the **entire auth guard** for the app. On mount, it checks `isLoggedIn()` (a `localStorage` read — see §1.1); if not logged in, it redirects to `/login` and never sets `ready`, so the real layout never renders (just a blank beige placeholder, avoiding a flash of authenticated content). If logged in, `ready` becomes `true` and the full layout renders. `useRouterState` with a `select` extracts just `location.pathname` so this component re-renders only when the path actually changes, used to highlight the active nav tab.

```tsx
<nav className="flex gap-1">
  {TABS.map((t) => {
    const active = t.to === "/" ? pathname === "/" : pathname.startsWith(t.to);
    return (
      <Link key={t.to} to={t.to} ... style={{ color: active ? "#FFFFFF" : "#1B2419", backgroundColor: active ? "#86000B" : "transparent" }}>
        {t.label}
      </Link>
    );
  })}
</nav>
```
Renders each tab as a `Link`. The home tab (`/`) is matched with strict equality (otherwise it would always match, since every path starts with `/`); every other tab uses `startsWith` so sub-paths still highlight the right tab. Active tabs get a solid brand-red background with white text; inactive tabs are transparent with near-black text.

```tsx
<button onClick={() => window.location.reload()} ...><RotateCw .../></button>
<button onClick={() => { setLoggedIn(false); navigate({ to: "/login" }); }} ...><LogOut .../> Logout</button>
```
A hard page reload button, and the logout button which clears the `localStorage` flag and navigates to `/login`. There's also a non-functional search `<input>` in the header (no `onChange` wired to any search logic — purely decorative/placeholder at this point).

```tsx
<main className="p-6"><Outlet /></main>
```
Renders the active child route (Home/Email/SMS/WhatsApp/Calls) below the header.

---

### 1.15 `src/routes/login.tsx` — login page

```tsx
export const Route = createFileRoute("/login")({
  head: () => ({ meta: [{ title: "Sign in — Rare Global Food" }, ...] }),
  component: LoginPage,
});
```
Defines the `/login` route with its own page `<title>`/meta description.

```tsx
function LoginPage() {
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    if (isLoggedIn()) navigate({ to: "/" });
  }, [navigate]);
```
Three pieces of local form state, plus an effect that immediately bounces an already-logged-in user back to `/` (mirrors the guard in `_app.tsx`, just in the opposite direction).

```tsx
  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (email.trim().toLowerCase() === LOGIN_EMAIL && password === LOGIN_PASSWORD) {
      setLoggedIn(true);
      navigate({ to: "/" });
    } else {
      setError("Invalid email or password.");
    }
  }
```
The entire authentication logic: prevents the default form POST, normalizes the entered email (trim + lowercase) and compares it and the raw password string against the two constants imported from `src/lib/auth.ts`. **This check happens entirely client-side in the browser** — there is no server endpoint involved, no hashing, and the correct credentials are visible to anyone who reads the shipped JavaScript bundle. On success it sets the `localStorage` flag and navigates home; on failure it sets a visible error string.

```tsx
<div className="hidden md:flex md:w-1/2 ..." style={{ backgroundColor: "#86000B" }}>
  {/* background image overlay + "2,000+ B2B Clients / 99% Timely Delivery / 20K+ kg Each Month" stats */}
</div>
<div className="flex-1 flex items-center justify-center p-6" style={{ backgroundColor: "#FFEBCE" }}>
  {/* Logo + "Welcome Back" + the actual <form onSubmit={submit}> with email/password inputs and an error message */}
</div>
```
A two-column layout: a marketing/branding panel (hidden on small screens via `hidden md:flex`) on the left showcasing company stats over a background photo, and the actual login form card on the right. The form has controlled `email`/`password` inputs (`value`/`onChange` wired to state), both `required`, and conditionally renders the `error` string in red text right above the red "Sign In" submit button.

---

### 1.16 `src/routeTree.gen.ts` — auto-generated route tree (do not hand-edit)

> ⚠️ This file is generated automatically by the **TanStack Router Vite plugin** by scanning `src/routes/`. The file itself begins with `/* eslint-disable */`, `// @ts-nocheck`, and an explicit comment warning not to edit it — any manual changes are overwritten the next time the dev server or build runs.

What it encodes, structurally:
- Imports the `Route` export from every file in `src/routes/` (`__root`, `login`, `_app`, `_app.index`, `api/vapi-calls`, `api/twilio-messages`, `_app.whatsapp`, `_app.sms`, `_app.email`, `_app.calls`).
- Calls `.update({ id, path, getParentRoute })` on each route import to wire up the parent/child relationships implied by the file-naming convention — e.g. `_app.calls` becomes a child of `_app`, and `_app` itself is `/_app` with the empty path `''` (since it's a pathless layout route, it doesn't add a URL segment but still nests under root).
- Generates a stack of TypeScript interfaces (`FileRoutesByFullPath`, `FileRoutesByTo`, `FileRoutesById`, `FileRouteTypes`) that give the router (and `Link to="..."`, `navigate({ to: "..." })` calls throughout the app) full autocomplete and type-checking against the real set of valid paths.
- Builds `AppRouteChildren` / `rootRouteChildren` objects and calls `._addFileChildren(...)` to attach each route's children, finally exporting `routeTree` — the single object `router.tsx` passes into `createRouter({ routeTree })`.
- At the bottom, augments `@tanstack/react-start`'s `Register` interface with concrete types for `router` (from `getRouter`) and `config` (from `startInstance.getOptions`), which is how the rest of the app gets fully-typed `Route.useRouteContext()`, etc.

In short: this file is the compiled map between URL paths and the actual route modules — every time you add/rename/move a file under `src/routes/`, this file regenerates to reflect it.

---

### 1.17 `src/styles.css` — global Tailwind v4 theme

```css
@import "tailwindcss" source(none);
@source "../src";
@import "tw-animate-css";
@custom-variant dark (&:is(.dark *));
```
Tailwind CSS v4's new CSS-first configuration syntax (no `tailwind.config.js` needed). `@import "tailwindcss" source(none)` pulls in Tailwind's base/utilities without it auto-scanning for content (since `@source "../src"` explicitly declares where to scan for class usage instead). `tw-animate-css` adds extra animation utility classes (used heavily by the Radix-based components for open/close transitions, e.g. `animate-in`, `fade-out-0`, `zoom-in-95`). `@custom-variant dark` defines how the `dark:` variant is triggered — here, by an ancestor element having a `.dark` class (rather than the OS-level `prefers-color-scheme`).

```css
@theme inline {
  --radius-sm: calc(var(--radius) - 4px);
  ...
  --color-primary: var(--primary);
  ...
  --font-sans: Arial, Helvetica, sans-serif;
}
```
Maps semantic design-token CSS variables (defined in `:root` below) onto Tailwind's theme namespace, which is what makes utility classes like `bg-primary`, `text-foreground`, `rounded-lg` resolve to the brand colors/radii instead of Tailwind's defaults. `inline` means these are computed at build time into the generated utility classes.

```css
:root {
  --radius: 0.5rem;
  --rare-red: #86000B;
  --beige: #FFEBCE;
  --hunter: #33673B;
  --near-black: #1B2419;

  --background: #FFFFFF;
  --foreground: #1B2419;
  --primary: #86000B;
  --primary-foreground: #FFFFFF;
  --secondary: #FFEBCE;
  ...
  --destructive: #86000B;
  --border: #E8E2D5;
  --ring: #86000B;
}
```
The actual brand palette: a deep red (`#86000B`, "rare-red"), a warm beige (`#FFEBCE`), a hunter green (`#33673B`, used sparingly e.g. for "Sent" status badges), and a near-black (`#1B2419`) used as the primary text color instead of pure black. Every shadcn semantic token (`--primary`, `--destructive`, `--ring`, etc.) is pinned to one of these brand colors, which is why every shadcn/ui component below automatically looks "on brand" without per-component overrides — `--destructive` and `--primary` are both the same red, and `--ring` (focus outline color) is also that red.

```css
@layer base {
  * { border-color: var(--color-border); }
  body {
    background-color: var(--color-background);
    color: var(--color-foreground);
    font-family: Arial, Helvetica, sans-serif;
  }
}
```
Global resets: every element's default border color is the theme border token, and the page body uses the theme background/foreground colors with a plain Arial/Helvetica sans-serif stack (no custom web font is loaded).

---

### 1.18 Route pages (the four data tabs)

All four tabs (`_app.index.tsx` = Home, `_app.email.tsx`, `_app.sms.tsx`, `_app.whatsapp.tsx`, `_app.calls.tsx`) follow the same shape: a `createFileRoute(...)` export, a `useQuery` (or several) that fetches live data, local `useState` for search/selection, a `useMemo` that filters/sorts the fetched rows, and a two-pane "list on the left, detail on the right" layout. Below is the per-file breakdown.

#### `src/routes/_app.index.tsx` — Home / overview dashboard

```tsx
export const Route = createFileRoute("/_app/")({ component: Overview });

interface VapiCall { id: string; createdAt: string; endedAt?: string; status?: string; }
interface TwilioMsg { sid: string; from: string; to: string; date_sent: string; date_created: string; body: string; direction: string; }
```
The index route under the `_app` layout — this is what renders at the bare `/` path. Two local interfaces describe the shapes returned by the Vapi and Twilio APIs (a subset of fields actually used on this page).

```tsx
function useEmails() {
  return useQuery({ queryKey: ["emails"], queryFn: () => fetchSheet<EmailRow>(EMAIL_SHEET_ID, "Sent Log"), refetchInterval: 60000 });
}
function useSms() { /* same pattern, SMS_SHEET_ID */ }
function useTwilio() {
  return useQuery({
    queryKey: ["twilio"],
    queryFn: async () => {
      const r = await fetch("/api/twilio-messages?PageSize=200");
      if (!r.ok) throw new Error("twilio");
      const d = await r.json();
      return (d.messages ?? []) as TwilioMsg[];
    },
    refetchInterval: 60000,
  });
}
function useVapi() { /* same pattern, hits /api/vapi-calls?limit=100 */ }
```
Four small wrapper hooks, each a thin `useQuery` call. Emails/SMS go straight to Google Sheets via `fetchSheet`; WhatsApp (Twilio) and Calls (Vapi) go through this app's own server API routes (so the Twilio/Vapi secret keys stay server-side — see §1.19/1.20). All four **auto-refetch every 60 seconds**, which is what makes the dashboard "live."

```tsx
function groupByDate<T>(items: T[], getDate: (x: T) => string): { date: string; count: number }[] {
  const m = new Map<string, number>();
  items.forEach((it) => {
    const d = getDate(it);
    if (!d) return;
    const key = d.slice(0, 10);
    m.set(key, (m.get(key) ?? 0) + 1);
  });
  return [...m.entries()].sort(([a], [b]) => a.localeCompare(b)).slice(-14).map(([date, count]) => ({ date, count }));
}
```
A generic helper that buckets any array of items into daily counts: extracts a date string per item via the caller-supplied `getDate`, truncates it to just the `YYYY-MM-DD` portion (`.slice(0, 10)`), tallies counts in a `Map`, sorts chronologically, and keeps only the most recent 14 days — this directly feeds the four bar/line charts on this page.

```tsx
function Overview() {
  const emails = useEmails();
  const sms = useSms();
  const twilio = useTwilio();
  const vapi = useVapi();

  const kpis = [
    { label: "Emails Sent", value: emails.data?.length ?? 0, Icon: Mail },
    ...
  ];

  const emailChart = groupByDate(emails.data ?? [], (r) => r.Date_Sent);
  ...
```
Calls all four data hooks, then derives four KPI counters (total rows per channel) and four 14-day chart datasets from the same data, with no extra network calls.

```tsx
  const activity: { ts: string; channel: string; icon: string; text: string }[] = [];
  (emails.data ?? []).forEach((r) => activity.push({ ts: `${r.Date_Sent} ${r.Time_Sent}`, channel: "email", icon: "📧", text: `Email sent to ${r.Company_Name} — ${r.Email_Subject}` }));
  (sms.data ?? []).forEach((r) => activity.push({ ... }));
  (twilio.data ?? []).forEach((m) => activity.push({ ts: m.date_created, channel: "wa", icon: "📱", text: `WhatsApp ${m.direction.includes("inbound") ? "from" : "to"} ${...}` }));
  (vapi.data ?? []).forEach((c) => activity.push({ ts: c.createdAt, channel: "call", icon: "📞", text: `Call ${c.status ?? ""}` }));
  activity.sort((a, b) => (b.ts ?? "").localeCompare(a.ts ?? ""));
  const recent = activity.slice(0, 15);
```
Builds a unified, cross-channel activity feed by mapping every data source into a common `{ ts, channel, icon, text }` shape, concatenating them all, sorting by timestamp string descending (string comparison works here because all timestamps are in sortable `YYYY-MM-DD...` format), and keeping the top 15 most recent events.

```tsx
return (
  <div className="space-y-6">
    {/* heading */}
    <div className="grid ... lg:grid-cols-4 gap-4">{kpis.map(...) /* 4 KPI cards */}</div>
    <div className="grid ... lg:grid-cols-2 gap-4">
      <ChartCard title="Email Sends Over Time" data={emailChart} type="bar" />
      <ChartCard title="SMS Sends Over Time" data={smsChart} type="bar" />
      <ChartCard title="WhatsApp Activity" data={waChart} type="line" />
      <ChartCard title="Call Activity" data={callChart} type="bar" />
    </div>
    <div className="bg-white rounded-xl shadow-sm">{/* "Recent Activity" feed, mapped from `recent` */}</div>
  </div>
);
```
The render: a KPI row, a 2x2 chart grid, then a recent-activity list. Each KPI card shows a big number + label + a circular icon badge in beige with a red icon.

```tsx
function ChartCard({ title, data, type }: { title: string; data: {...}[]; type: "bar" | "line" }) {
  return (
    <div className="bg-white rounded-xl shadow-sm p-4">
      <div className="font-bold mb-3 text-sm">{title}</div>
      <div style={{ width: "100%", height: 220 }}>
        <ResponsiveContainer>
          {type === "bar" ? (<BarChart data={data}>...<Bar dataKey="count" fill="#86000B" .../></BarChart>)
                           : (<LineChart data={data}>...<Line dataKey="count" stroke="#86000B" .../></LineChart>)}
        </ResponsiveContainer>
      </div>
    </div>
  );
}
```
A reusable Recharts wrapper that renders either a bar or line chart of `{date, count}` pairs, always in the brand red, inside a fixed 220px-tall responsive container.

#### `src/routes/_app.email.tsx` — Email tab

```tsx
export const Route = createFileRoute("/_app/email")({ component: EmailTab });

function EmailTab() {
  const { data, isLoading } = useQuery({ queryKey: ["emails"], queryFn: () => fetchSheet<EmailRow>(EMAIL_SHEET_ID, "Sent Log"), refetchInterval: 60000 });
  const [search, setSearch] = useState("");
  const [selectedIdx, setSelectedIdx] = useState<number | null>(null);
```
Fetches the same email sheet data as the Home tab (React Query dedupes this under the `["emails"]` cache key, so it's not a redundant network call if Home was already visited). Local state tracks the search box text and which row index is currently selected.

```tsx
  const rows = useMemo(() => {
    const sorted = [...(data ?? [])].sort((a, b) => (`${b.Date_Sent} ${b.Time_Sent}`).localeCompare(`${a.Date_Sent} ${a.Time_Sent}`));
    const q = search.toLowerCase();
    if (!q) return sorted;
    return sorted.filter((r) => [r.Company_Name, r.Email_Sent_To, r.Email_Subject, r.Contact_Name].join(" ").toLowerCase().includes(q));
  }, [data, search]);

  const selected = selectedIdx !== null ? rows[selectedIdx] : null;
```
Sorts all rows newest-first (string-compares the combined date+time, descending), then optionally filters by a case-insensitive substring match across four fields joined into one searchable string. `selected` derives the currently-open email from `rows`/`selectedIdx` rather than storing the row object itself, so it always reflects the latest sorted/filtered list.

```tsx
return (
  <div className="... grid ... md:grid-cols-[35%_65%] ...">
    <div className="border-r ...">{/* search box + list of email rows, each a <button onClick={() => setSelectedIdx(i)}> */}</div>
    <div className="overflow-y-auto bg-white">
      {!selected ? (<div>Select an email to view</div>) : (
        <div className="p-6 max-w-3xl">
          <h2>{selected.Email_Subject}</h2>
          <div>{/* From/To/Date/Product meta */}</div>
          <div className="mt-5" dangerouslySetInnerHTML={{ __html: renderEmailHtml(selected) }} />
          <div>Gmail Message ID: {selected.Gmail_Message_ID}</div>
        </div>
      )}
    </div>
  </div>
);
```
A fixed-height (`calc(100vh - 7rem - 1rem)`) two-pane email-client-style layout: a 35%-wide scrollable list on the left (each item shows company, date, subject, recipient — with the selected item visually marked via a red left border and white background), and a 65%-wide reading pane on the right rendering the actual templated email body via `renderEmailHtml` (§1.3) injected with `dangerouslySetInnerHTML` — safe here because that function HTML-escapes all interpolated user-controlled fields.

#### `src/routes/_app.sms.tsx` — SMS tab

```tsx
export const Route = createFileRoute("/_app/sms")({ component: SmsTab });
```
Structurally identical to the Email tab (same `useQuery` + search/select + sort/filter `useMemo` pattern) but against `SMS_SHEET_ID`/`SmsRow`, and the detail pane is styled as a dark (`#1B2419` background) phone-style chat bubble view instead of an email reading pane: a single outgoing message bubble (`bg-gray-700` rounded chat bubble) showing `Message_Sent`, with a footer bar showing Product/Channel and a green "Sent" status pill (`#33673B` background, falling back to that label if `Status` is blank).

#### `src/routes/_app.whatsapp.tsx` — WhatsApp tab

```tsx
const BIZ = "whatsapp:+14155238886";
function normalizeNumber(s: string) { return s.replace(/^whatsapp:/, ""); }
```
`BIZ` is this business's own Twilio WhatsApp sender number (in Twilio's `whatsapp:+E.164` format — this is in fact Twilio's well-known sandbox number). `normalizeNumber` strips the `whatsapp:` prefix for display.

```tsx
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
Fetches raw Twilio message records through the server API route (note: a *different* query key, `["twilio-messages"]`, than Home's `["twilio"]` — so this is actually a separate, redundant fetch rather than a shared cache entry — and a faster 30s refresh interval, since this is the most "live chat"-feeling tab).

```tsx
const conversations = useMemo(() => {
  const map = new Map<string, TwilioMsg[]>();
  for (const m of data ?? []) {
    if (!m.from?.startsWith("whatsapp:") && !m.to?.startsWith("whatsapp:")) continue;
    const other = m.from === BIZ ? m.to : m.from;
    if (!other) continue;
    if (!map.has(other)) map.set(other, []);
    map.get(other)!.push(m);
  }
  const convs = [...map.entries()].map(([phone, msgs]) => {
    msgs.sort((a, b) => (a.date_created ?? "").localeCompare(b.date_created ?? ""));
    const last = msgs[msgs.length - 1];
    return { phone, msgs, last };
  });
  convs.sort((a, b) => (b.last.date_created ?? "").localeCompare(a.last.date_created ?? ""));
  const q = search.toLowerCase();
  return q ? convs.filter((c) => c.phone.toLowerCase().includes(q) || c.last.body?.toLowerCase().includes(q)) : convs;
}, [data, search]);
```
This is the most involved derivation in the app: it groups raw individual Twilio messages into per-contact **conversations**. It skips any message that isn't a WhatsApp message at all (filters out plain SMS that might be mixed into the same Twilio account's message log). For each remaining message it determines "the other party" — whichever of `from`/`to` *isn't* the business's own number — and buckets the message under that phone number. Each conversation's messages are then sorted chronologically (oldest first, for natural chat reading order), `last` is cached as the most recent message (used for the preview snippet and for sorting the conversation list itself, newest-conversation-first), and finally the whole conversation list is optionally filtered by the search box matching either the phone number or the last message's text.

```tsx
const active = conversations.find((c) => c.phone === activePhone) ?? conversations[0];
...
{active.msgs.map((m) => {
  const out = m.direction !== "inbound";
  return (
    <div className={`flex ${out ? "justify-end" : "justify-start"}`}>
      <div className={out ? "... text-white" : "... bg-white"} style={out ? { backgroundColor: "#86000B" } : { color: "#1B2419" }}>{m.body}</div>
      ... {out && (m.status === "read" ? <CheckCheck className="text-blue-500" /> : <CheckCheck />)}
    </div>
  );
})}
```
Renders a chat-bubble thread for whichever conversation is selected (`activePhone`, defaulting to the first conversation if none is explicitly chosen). Outbound messages (anything not `"inbound"` — i.e. `outbound-api` or `outbound-reply`) are right-aligned red bubbles; inbound messages are left-aligned white bubbles. Outbound messages additionally show a double-checkmark read receipt, colored blue if Twilio reports the status as `"read"`.

#</span>### `src/routes/_app.calls.tsx` — Calls tab

```tsx
interface VapiCall {
  id: string; createdAt: string; startedAt?: string; endedAt?: string; endedReason?: string;
  status?: string; recordingUrl?: string; customer?: { number?: string };
  analysis?: { summary?: string }; artifact?: { transcript?: string; recordingUrl?: string };
  assistant?: { name?: string };
}
```
A fuller local type for Vapi (AI voice-agent) call objects than the one used on the Home tab, including nested `customer`, `analysis`, `artifact`, and `assistant` objects — this tab is the only place these nested fields are actually read.

```tsx
function fmtDuration(start?: string, end?: string) {
  if (!start || !end) return "—";
  const s = (new Date(end).getTime() - new Date(start).getTime()) / 1000;
  if (!Number.isFinite(s) || s < 0) return "—";
  const m = Math.floor(s / 60);
  const sec = Math.floor(s % 60);
  return `${m}m ${sec}s`;
}
```
Computes a human-readable `"Xm Ys"` duration from two ISO timestamps, guarding against missing timestamps or invalid/negative durations (returns an em-dash placeholder in those cases).

```tsx
function statusBadge(call: VapiCall) {
  const r = (call.endedReason ?? "").toLowerCase();
  if (r.includes("no-answer") || r.includes("noanswer") || r.includes("busy")) return { label: "No Answer", bg: "#9CA3AF" };
  if (r.includes("transfer")) return { label: "Transferred", bg: "#86000B" };
  return { label: "Answered", bg: "#33673B" };
}
```
Maps Vapi's free-text `endedReason` field into one of three simplified status badges (gray "No Answer", red "Transferred", green "Answered" — defaulting to "Answered" for any reason string that doesn't match the other two patterns).

```tsx
const { data, isLoading, error } = useQuery({
  queryKey: ["vapi-calls"],
  queryFn: async () => { const r = await fetch("/api/vapi-calls?limit=100"); if (!r.ok) throw new Error("vapi"); return (await r.json()) as VapiCall[]; },
  refetchInterval: 60000,
});

const calls = useMemo(() => {
  const sorted = [...(data ?? [])].sort((a, b) => (b.createdAt ?? "").localeCompare(a.createdAt ?? ""));
  const q = search.toLowerCase();
  return q ? sorted.filter((c) => (c.customer?.number ?? "").toLowerCase().includes(q)) : sorted;
}, [data, search]);

const sel = calls.find((c) => c.id === selId) ?? null;
```
Standard fetch-sort-filter pattern again, this time sorting newest-first by `createdAt` and filtering only by the customer's phone number.

```tsx
{(sel.recordingUrl || sel.artifact?.recordingUrl) ? (
  <audio controls src={sel.recordingUrl ?? sel.artifact?.recordingUrl} className="w-full" style={{ accentColor: "#86000B" }} />
) : ( <div>No recording available.</div> )}

<div>{sel.analysis?.summary ?? "No summary generated."}</div>

<button onClick={() => setShowTranscript((v) => !v)}>Full Transcript {showTranscript ? <ChevronUp/> : <ChevronDown/>}</button>
{showTranscript && (<pre>{sel.artifact?.transcript ?? "No transcript available."}</pre>)}

<Meta label="Started" value={sel.startedAt?.replace("T", " ").slice(0, 19) ?? "—"} />
<Meta label="Ended" value={sel.endedAt?.replace("T", " ").slice(0, 19) ?? "—"} />
<Meta label="Duration" value={fmtDuration(sel.startedAt, sel.endedAt)} />
<Meta label="Ended Reason" value={sel.endedReason ?? "—"} />
```
The detail pane for a selected call: a native HTML5 `<audio>` player wired directly to the recording URL Vapi returns (falling back to `artifact.recordingUrl` if the top-level field is absent), an AI-generated call summary, a collapsible full transcript (`showTranscript` boolean toggled by a chevron button, reset to `false` whenever a different call is selected — see the `onClick` in the list: `setSelId(c.id); setShowTranscript(false);`), and a 4-cell metadata grid via the small `Meta` helper component at the bottom of the file.

---

### 1.19 `src/routes/api/twilio-messages.ts` — server proxy for Twilio

```ts
export const Route = createFileRoute("/api/twilio-messages")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const TWILIO_SID = process.env.TWILIO_ACCOUNT_SID;
        const TWILIO_TOKEN = process.env.TWILIO_AUTH_TOKEN;
        const url = new URL(request.url);
        const pageSize = url.searchParams.get("PageSize") ?? "200";
        const target = `https://api.twilio.com/2010-04-01/Accounts/${TWILIO_SID}/Messages.json?PageSize=${pageSize}`;
        const auth = "Basic " + Buffer.from(`${TWILIO_SID}:${TWILIO_TOKEN}`).toString("base64");
        const res = await fetch(target, { headers: { Authorization: auth } });
        const body = await res.text();
        return new Response(body, { status: res.status, headers: { "Content-Type": "application/json", "Cache-Control": "no-store" } });
      },
    },
  },
});
```
A TanStack Start **server route** (runs only on the server, never bundled to the client) that exists purely so the Twilio Account SID/Auth Token never need to be sent to the browser. It reads the `PageSize` query param from the incoming request (defaulting to 200), builds the real Twilio REST API URL for listing messages on this account, constructs an HTTP Basic Auth header by base64-encoding `SID:TOKEN`, calls Twilio, and pipes the raw response body straight back to the browser with the same status code. `Cache-Control: no-store` ensures the browser/any intermediary never caches this — every request gets fresh data. The SID and Token are read from `process.env` (`.env`, gitignored).

---

### 1.20 `src/routes/api/vapi-calls.ts` — server proxy for Vapi

```ts
export const Route = createFileRoute("/api/vapi-calls")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const VAPI_PRIVATE_KEY = process.env.VAPI_PRIVATE_KEY;
        const ASSISTANT_ID = process.env.VAPI_ASSISTANT_ID;
        const url = new URL(request.url);
        const limit = url.searchParams.get("limit") ?? "100";
        const target = `https://api.vapi.ai/call?assistantId=${ASSISTANT_ID}&limit=${limit}`;
        const res = await fetch(target, { headers: { Authorization: `Bearer ${VAPI_PRIVATE_KEY}` } });
        const body = await res.text();
        return new Response(body, { status: res.status, headers: { "Content-Type": "application/json", "Cache-Control": "no-store" } });
      },
    },
  },
});
```
The Vapi (AI calling platform) equivalent of the Twilio proxy above: same shape, same purpose (keep the private API key server-side), reading a `limit` query param and calling Vapi's `GET /call?assistantId=...&limit=...` endpoint with a Bearer token, then relaying the response verbatim. `VAPI_PRIVATE_KEY`/`VAPI_ASSISTANT_ID` are read from `process.env` (`.env`, gitignored).

---

## 2. UI component library (`src/components/ui/`)

Every file in this folder is a **shadcn/ui** component: a thin, locally-owned wrapper around a [Radix UI](https://www.radix-ui.com/primitives) primitive (for accessible behavior — focus trapping, keyboard nav, ARIA roles) plus Tailwind classes for styling, generated once via the shadcn CLI and then owned/edited directly in this repo (as opposed to being an npm dependency). Because they're so structurally repetitive, this section first explains the **shared pattern** once, then gives a per-file summary of what's different about each one.

### 2.1 The shared pattern

Almost every file follows this shape:

```tsx
import * as React from "react";
import * as SomePrimitive from "@radix-ui/react-something";
import { cn } from "@/lib/utils";

const Thing = React.forwardRef<
  React.ElementRef<typeof SomePrimitive.Root>,
  React.ComponentPropsWithoutRef<typeof SomePrimitive.Root>
>(({ className, ...props }, ref) => (
  <SomePrimitive.Root ref={ref} className={cn("...default tailwind classes...", className)} {...props} />
));
Thing.displayName = SomePrimitive.Root.displayName;

export { Thing };
```
- `React.forwardRef` lets parent code attach a `ref` straight through to the underlying DOM node Radix renders, which is necessary for things like focus management and integration with other libraries (e.g. react-hook-form).
- `React.ComponentPropsWithoutRef<typeof X>` borrows Radix's own prop types instead of redeclaring them, so any prop Radix supports (e.g. `open`, `onOpenChange`, `disabled`) is automatically supported here too, fully typed.
- `cn("default classes", className)` (§1.8) merges the component's own Tailwind defaults with whatever `className` the call site passes in, letting consumers override styling without fighting specificity.
- `displayName` is set explicitly (often copied from the Radix primitive's own `displayName`) purely to make these components identifiable in React DevTools, since an anonymous `forwardRef` would otherwise show up as `"ForwardRef"`.
- Compound components (e.g. `Dialog` + `DialogTrigger` + `DialogContent` + `DialogHeader` + ...) are exported together as a named set, designed to be composed together in JSX rather than configured via props.

Some files diverge from this pattern in specific ways — those are called out below.

### 2.2 Per-file notes

- **`accordion.tsx`** — wraps `@radix-ui/react-accordion`. `AccordionTrigger` wraps Radix's `Header`+`Trigger` and adds a `ChevronDown` icon that rotates 180° via the `[&[data-state=open]>svg]:rotate-180` arbitrary selector. `AccordionContent` applies open/close slide animations (`animate-accordion-up`/`-down`) and nests an inner `<div>` for the actual padding (Radix's content element handles the height animation itself, so padding must live one level in to avoid being clipped mid-animation).

- **`alert-dialog.tsx`** — wraps `@radix-ui/react-alert-dialog` (a modal that *requires* an explicit confirm/cancel action, unlike `Dialog`, which can be dismissed by clicking outside). `AlertDialogAction`/`AlertDialogCancel` reuse `buttonVariants` from `button.tsx` directly so the action buttons look like real `<Button>`s without importing the component itself.

- **`alert.tsx`** — not Radix-based; just a `cva` (class-variance-authority) variant set (`default` / `destructive`) applied to a plain `<div role="alert">`, plus `AlertTitle` (`<h5>`) and `AlertDescription` (`<div>`) children. The `[&>svg]:...` selectors in the base classes auto-position any icon dropped in as the first child.

- **`aspect-ratio.tsx`** — the simplest file in the folder: just re-exports `@radix-ui/react-aspect-ratio`'s `Root` directly with no styling or wrapping at all.

- **`avatar.tsx`** — wraps `@radix-ui/react-avatar`'s `Root`/`Image`/`Fallback`. `Root` is a circular, clipped 40×40px container; `Fallback` (rendered by Radix automatically while the image is loading or if it 404s) is a muted-background circle for initials/icon.

- **`badge.tsx`** — not Radix-based; a `cva`-driven `<div>` with four variants (`default`, `secondary`, `destructive`, `outline`), exported as a plain function component (not `forwardRef`, since badges are leaf display elements that never need a ref).

- **`breadcrumb.tsx`** — not Radix-based (Radix has no breadcrumb primitive); hand-built from semantic `<nav>`/`<ol>`/`<li>`/`<a>` elements. `BreadcrumbLink` supports `asChild` (via `@radix-ui/react-slot`) so it can render as a router `<Link>` instead of a plain `<a>`. `BreadcrumbSeparator` defaults to a `ChevronRight` icon if no custom child is passed. `BreadcrumbEllipsis` shows a `MoreHorizontal` icon for collapsed/truncated breadcrumb trails.

- **`calendar.tsx`** — wraps `react-day-picker`'s `DayPicker` (not a Radix primitive). Almost the entire file is a giant `classNames` object mapping every internal day-picker slot (`nav`, `month_caption`, `weekday`, `range_start`, `today`, `outside`, `disabled`, etc.) to Tailwind classes, merged with `getDefaultClassNames()`. Custom `components` overrides swap in this app's own `Button` for navigation arrows and a custom `CalendarDayButton` (which auto-focuses itself when `modifiers.focused` is true, via a `ref` + `useEffect`) for individual day cells.

- **`carousel.tsx`** — wraps `embla-carousel-react` (not Radix). Defines its own React Context (`CarouselContext`) carrying the Embla `api`, `scrollPrev`/`scrollNext` callbacks, and `canScrollPrev`/`canScrollNext` booleans, consumed by `CarouselContent`, `CarouselItem`, `CarouselPrevious`, and `CarouselNext`. Keyboard arrow-key navigation is wired via `onKeyDownCapture` on the root. `canScrollPrev`/`canScrollNext` are recomputed on Embla's own `"select"`/`"reInit"` events and used to disable the prev/next buttons at the ends.

- **`chart.tsx`** — wraps **Recharts** (not Radix). Defines a `ChartConfig` type (per-series `label`/`icon`/`color` or light+dark `theme` colors) and a `ChartContext` so `ChartTooltipContent`/`ChartLegendContent` can look up a series' configured label/icon/color by key. `ChartStyle` is a clever trick: it injects a `<style>` tag with literal CSS custom-property declarations (`--color-<key>: <color>`) scoped to a unique `data-chart` attribute and to both light and dark `THEMES` selectors, so each chart instance gets its own CSS variables without inline `style` clashing across multiple charts on the same page. `getPayloadConfigFromPayload` is a defensive helper that digs into Recharts' loosely-typed tooltip/legend payload objects to find the right config entry by key, checking both the top-level payload and its nested `payload.payload`. *(Note: this app's actual charts on the Home tab don't use this `chart.tsx` wrapper — they call Recharts directly — so this file is currently unused scaffolding from the shadcn template.)*

- **`checkbox.tsx`** — wraps `@radix-ui/react-checkbox`. The `Indicator` (only rendered by Radix when checked) contains a `Check` icon; the root uses `data-[state=checked]:bg-primary` to flip from outline to filled-red when checked.

- **`collapsible.tsx`** — the thinnest wrapper in the folder: re-exports Radix's `Root`/`CollapsibleTrigger`/`CollapsibleContent` with zero added styling or props — a pure pass-through, presumably kept for consistent import paths (`@/components/ui/collapsible` instead of the Radix package directly) and to centralize a future styling change if ever needed.

- **`command.tsx`** — wraps `cmdk` (the headless command-palette library), not Radix directly (though `CommandDialog` composes this app's own `Dialog`/`DialogContent` from `dialog.tsx` to turn the command list into a modal palette, e.g. a ⌘K search). `CommandInput` pairs a `Search` icon with `cmdk`'s `Input`. The long `[&_[cmdk-...]]:...` selectors in `CommandDialog` style cmdk's own internal data attributes from the outside.

- **`context-menu.tsx`** — wraps `@radix-ui/react-context-menu` (right-click menus). Structurally a near-duplicate of `dropdown-menu.tsx` (same Check/Circle indicator pattern for checkbox/radio items, same `inset` prop for indented items, same submenu trigger/content components) — Radix deliberately keeps these two primitives' APIs parallel.

- **`dialog.tsx`** — wraps `@radix-ui/react-dialog` (modal). `DialogContent` always renders inside a `DialogPortal` (so it escapes any parent `overflow:hidden`) with a `DialogOverlay` behind it, and bakes in its own close `X` button (top-right, with a visually-hidden `"Close"` label for screen readers) so callers don't need to add one manually.

- **`drawer.tsx`** — wraps `vaul` (a Radix-Dialog-based drawer library), not Radix directly. `Drawer` defaults `shouldScaleBackground` to `true` (the background content visibly scales down slightly when the drawer opens, a common mobile-sheet effect). `DrawerContent` adds a small horizontal "grabber" bar (`mx-auto mt-4 h-2 w-[100px] rounded-full bg-muted`) above its children, mimicking a native bottom-sheet handle.

- **`dropdown-menu.tsx`** — wraps `@radix-ui/react-dropdown-menu`. See `context-menu.tsx` notes above — same structure/pattern, applied to a click-triggered (not right-click) menu.

- **`form.tsx`** — the one file in this folder that isn't primarily about visual styling; it's the **react-hook-form integration layer**. `Form` is just `FormProvider` re-exported under a shorter name. `FormField` wraps RHF's `Controller` and stashes the field's `name` into a `FormFieldContext`. `useFormField()` (the key piece) reads both `FormFieldContext` (for the name) and a sibling `FormItemContext` (for a unique `id` generated once per `FormItem` via `React.useId()`), plus RHF's own `useFormContext()` to get the field's live validation state, and derives a consistent set of ARIA IDs (`formItemId`, `formDescriptionId`, `formMessageId`) used by `FormLabel` (sets `htmlFor`), `FormControl` (sets `id`, `aria-describedby`, `aria-invalid` on the actual input via `Slot`), `FormDescription`, and `FormMessage` (renders the field's current validation error message, or falls back to its `children`, or renders nothing if there's no error and no children).

- **`hover-card.tsx`** — wraps `@radix-ui/react-hover-card` (a popover that opens on hover/focus rather than click). `HoverCardContent` is a fixed `w-64` styled panel; `align`/`sideOffset` default to `"center"`/`4`.

- **`input-otp.tsx`** — wraps the `input-otp` library (one-time-passcode input). `InputOTPSlot` reads the current slot's `char`/`hasFakeCaret`/`isActive` out of `OTPInputContext` (by numeric `index` prop) and renders a blinking caret bar (`animate-caret-blink`) when that slot is the active one and doesn't yet have a typed character. `InputOTPSeparator` renders a `Minus` icon between groups (e.g. for a `123-456` style 6-digit code split into two groups of 3).

- **`label.tsx`** — wraps `@radix-ui/react-label`. Just a `cva` base style (no variants defined, just a single fixed class string) applied to Radix's `Root`. This is the `Label` that `form.tsx`'s `FormLabel` builds on top of.

- **`menubar.tsx`** — wraps `@radix-ui/react-menubar` (a desktop-app-style top menu bar, e.g. File/Edit/View). Structurally parallels `dropdown-menu.tsx`/`context-menu.tsx` again (same Check/Circle indicators, `inset` prop, sub-menu pattern), plus top-level helper pass-throughs (`MenubarMenu`, `MenubarGroup`, `MenubarPortal`, `MenubarRadioGroup`, `MenubarSub`) that are just thin function-component wrappers with no styling, kept only for a uniform import surface.

- **`navigation-menu.tsx`** — wraps `@radix-ui/react-navigation-menu` (a richer, animated nav-with-dropdowns component, distinct from the simple `<Link>`-based nav this app actually uses in `_app.tsx`). Exports a standalone `navigationMenuTriggerStyle` `cva` so plain links can be styled to match trigger buttons without being an actual Radix trigger. `NavigationMenuViewport` is the shared positioned container all open dropdown panels animate into/out of.

- **`pagination.tsx`** — not Radix-based; hand-built from a `<nav>`/`<ul>`/`<li>`/`<a>` structure. `PaginationLink` reuses `buttonVariants` (outline style when `isActive`, ghost otherwise) so page-number links look like buttons. `PaginationPrevious`/`PaginationNext` are convenience wrappers around `PaginationLink` with arrow icons and accessible labels; `PaginationEllipsis` shows a `MoreHorizontal` icon for skipped page ranges.

- **`popover.tsx`** — wraps `@radix-ui/react-popover`. Near-identical shape to `hover-card.tsx` but click-triggered instead of hover-triggered, and wider (`w-72`).

- **`progress.tsx`** — wraps `@radix-ui/react-progress`. The `Indicator`'s width-fill effect is done via `transform: translateX(-${100 - (value || 0)}%)` on a full-width bar (rather than animating `width` directly), which is the standard Radix-recommended technique since `transform` animates more smoothly than `width`.

- **`radio-group.tsx`** — wraps `@radix-ui/react-radio-group`. `RadioGroupItem`'s `Indicator` (shown only when selected) renders a small filled `Circle` icon centered inside the outer ring.

- **`resizable.tsx`** — wraps `react-resizable-panels` (not Radix). `ResizablePanelGroup` wraps that library's `Group`; `ResizablePanel` is `Panel` re-exported as-is with zero changes; `ResizableHandle` wraps `Separator` and optionally renders a little grip handle (`GripVertical` icon in a small bordered box) when `withHandle` is true. CSS handles both horizontal and vertical orientations via `data-[panel-group-direction=vertical]:...` selectors.

- **`scroll-area.tsx`** — wraps `@radix-ui/react-scroll-area` (a custom-styled scrollbar replacing native browser scrollbars). `ScrollArea` always renders a `ScrollBar` (vertical by default) plus Radix's `Corner` (the little square where horizontal and vertical scrollbars would meet). `ScrollBar` itself can be reused standalone with `orientation="horizontal"` for components needing just a horizontal scrollbar.

- **`select.tsx`** — wraps `@radix-ui/react-select`. `SelectContent` is the most involved part: it portals the dropdown, defaults to Radix's `"popper"` positioning (auto-flips relative to the trigger and matches the trigger's width via CSS variables), and sandwiches the actual scrollable `Viewport` between `SelectScrollUpButton`/`SelectScrollDownButton` (small chevron buttons Radix shows automatically when the option list overflows). `SelectItem` reserves space on the right for a `Check` icon shown only on the currently-selected item.

- **`separator.tsx`** — wraps `@radix-ui/react-separator`. A single 1px-thick line, `orientation="horizontal"` by default (full width, 1px tall) or `"vertical"` (full height, 1px wide). `decorative={true}` by default, which tells assistive tech to ignore it as a meaningless visual divider rather than announcing it as a semantic boundary.

- **`sheet.tsx`** — wraps `@radix-ui/react-dialog` again, but styled as a slide-in side panel instead of a centered modal. `sheetVariants` (`cva`) defines four `side`s (`top`/`bottom`/`left`/`right`), each with its own inset positioning and matching slide-in/slide-out animation direction; `left`/`right` are capped at `w-3/4` (mobile) / `sm:max-w-sm` (desktop). This is the component `Sidebar` (in `sidebar.tsx`) reuses for its mobile off-canvas mode.

- **`skeleton.tsx`** — the second-simplest file: a single `<div className="animate-pulse rounded-md bg-primary/10">` loading-placeholder, sized entirely via whatever `className` the caller passes (e.g. `h-4 w-32`).

- **`slider.tsx`** — wraps `@radix-ui/react-slider`. Fixed-structure: a thin `Track` (with a filled `Range` portion showing the selected value) and a circular `Thumb` handle. Supports Radix's built-in multi-thumb/range capability automatically (not customized here — just whatever `props` like `value`/`defaultValue` are passed through).

- **`sonner.tsx`** — wraps the `sonner` toast library (not Radix). `Toaster` is a thin pass-through of `sonner`'s own `Toaster` component, pre-configured with `toastOptions.classNames` so toasts (success/error popups) pick up this app's theme colors (`bg-background`, `text-foreground`, themed action/cancel buttons) instead of sonner's defaults. *(Note: this `Toaster` isn't actually mounted anywhere in `__root.tsx`/`_app.tsx`, so toasts aren't currently wired up to be visible in the running app even though the component exists.)*

- **`switch.tsx`** — wraps `@radix-ui/react-switch`. A pill-shaped track that recolors (`data-[state=checked]:bg-primary` vs `data-[state=unchecked]:bg-input`) and a circular `Thumb` that slides via `translate-x-4`/`translate-x-0` based on checked state.

- **`table.tsx`** — not Radix-based; plain semantic `<table>`/`<thead>`/`<tbody>`/`<tfoot>`/`<tr>`/`<th>`/`<td>`/`<caption>` elements, each wrapped for consistent styling (`TableRow` adds a hover-highlight and a `data-[state=selected]` background; `TableHead`/`TableCell` reserve space for an optional leading checkbox via `[&:has([role=checkbox])]` selectors). `Table` itself wraps the `<table>` in a `div.overflow-auto` so wide tables scroll horizontally on small screens instead of breaking layout. *(This app's own pages don't currently use this `Table` component — the Email/SMS/WhatsApp/Calls tabs all use custom list/detail layouts instead — so, like `chart.tsx`, this is template scaffolding available for future use.)*

- **`tabs.tsx`** — wraps `@radix-ui/react-tabs`. `TabsList` is the pill-shaped container, `TabsTrigger` the individual tab buttons (background+shadow appear via `data-[state=active]:bg-background` when selected), `TabsContent` the panel shown for the active tab.

- **`textarea.tsx`** — not Radix-based (plain `<textarea>`); styled identically to `Input` (`input.tsx`) but with a `min-h-[60px]` floor instead of a fixed height, so it can grow.

- **`toggle-group.tsx`** — wraps `@radix-ui/react-toggle-group`, reusing `toggleVariants` from `toggle.tsx`. Uses a `ToggleGroupContext` so an individual `ToggleGroupItem` can inherit the parent `ToggleGroup`'s `variant`/`size` without every item needing to repeat those props.

- **`toggle.tsx`** — wraps `@radix-ui/react-toggle` (a single on/off pressable button, like a bold/italic formatting toggle). Defines and exports its own `toggleVariants` (`cva`, `default`/`outline` × `default`/`sm`/`lg`) which `toggle-group.tsx` imports and reuses rather than duplicating.

- **`tooltip.tsx`** — wraps `@radix-ui/react-tooltip`. Note `TooltipProvider` must wrap any part of the app that uses tooltips (Radix requires this for shared delay/timing behavior across multiple tooltips) — it's set up once at the top of `Sidebar`'s `SidebarProvider` (`sidebar.tsx`) for that component's icon tooltips.

### 2.3 `sidebar.tsx` — the one large, app-specific composite component

Unlike every other file above, `sidebar.tsx` (744 lines) is not a thin Radix wrapper — it's a full **collapsible application-sidebar system** built by composing several of the *other* primitives above (`Button`, `Input`, `Separator`, `Sheet`, `Skeleton`, `Tooltip`) plus its own state management. *(Note: this component is not currently used anywhere in this app's actual pages — `_app.tsx` builds its own simple top-nav header instead — so it exists as unused, ready-to-use scaffolding from the shadcn template, similar to `chart.tsx`/`table.tsx`.)* Its pieces:

```tsx
const SIDEBAR_COOKIE_NAME = "sidebar_state";
const SIDEBAR_COOKIE_MAX_AGE = 60 * 60 * 24 * 7; // 7 days
const SIDEBAR_WIDTH = "16rem";
const SIDEBAR_WIDTH_MOBILE = "18rem";
const SIDEBAR_WIDTH_ICON = "3rem";
const SIDEBAR_KEYBOARD_SHORTCUT = "b";
```
Constants controlling persistence (a cookie remembering open/collapsed state across a 7-day window) and sizing for the three sidebar states (expanded, mobile off-canvas, icon-only-collapsed).

```tsx
type SidebarContextProps = { state: "expanded" | "collapsed"; open: boolean; setOpen: (open: boolean) => void; openMobile: boolean; setOpenMobile: (open: boolean) => void; isMobile: boolean; toggleSidebar: () => void; };
const SidebarContext = React.createContext<SidebarContextProps | null>(null);
function useSidebar() {
  const context = React.useContext(SidebarContext);
  if (!context) throw new Error("useSidebar must be used within a SidebarProvider.");
  return context;
}
```
A React Context carrying all sidebar state, plus a `useSidebar()` hook that every other sub-component (`SidebarTrigger`, `SidebarMenuButton`, etc.) calls to read/control that shared state — and which deliberately throws if used outside a `SidebarProvider`, to fail loudly during development rather than silently misbehaving.

```tsx
const SidebarProvider = React.forwardRef<HTMLDivElement, ...>((
  { defaultOpen = true, open: openProp, onOpenChange: setOpenProp, ... }, ref
) => {
  const isMobile = useIsMobile();
  const [openMobile, setOpenMobile] = React.useState(false);
  const [_open, _setOpen] = React.useState(defaultOpen);
  const open = openProp ?? _open;
  const setOpen = React.useCallback((value) => {
    const openState = typeof value === "function" ? value(open) : value;
    if (setOpenProp) setOpenProp(openState); else _setOpen(openState);
    document.cookie = `${SIDEBAR_COOKIE_NAME}=${openState}; path=/; max-age=${SIDEBAR_COOKIE_MAX_AGE}`;
  }, [setOpenProp, open]);

  const toggleSidebar = React.useCallback(() => (isMobile ? setOpenMobile((o) => !o) : setOpen((o) => !o)), [isMobile, setOpen, setOpenMobile]);

  React.useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === SIDEBAR_KEYBOARD_SHORTCUT && (event.metaKey || event.ctrlKey)) {
        event.preventDefault();
        toggleSidebar();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [toggleSidebar]);

  const state = open ? "expanded" : "collapsed";
  ...
  return (
    <SidebarContext.Provider value={contextValue}>
      <TooltipProvider delayDuration={0}>
        <div style={{ "--sidebar-width": SIDEBAR_WIDTH, "--sidebar-width-icon": SIDEBAR_WIDTH_ICON, ...style }} className="group/sidebar-wrapper flex min-h-svh w-full ...">
          {children}
        </div>
      </TooltipProvider>
    </SidebarContext.Provider>
  );
});
```
The provider supports **controlled or uncontrolled** open state — if a parent passes `open`/`onOpenChange` props, those drive the state (`openProp`/`setOpenProp`); otherwise it manages its own internal `_open` state, defaulting to `defaultOpen`. Either way, every state change also writes a cookie so a server-rendered page can know the user's last sidebar preference before client JS even runs (avoiding a flash of the wrong state). `toggleSidebar` branches on mobile vs. desktop, since mobile uses a completely different mechanism (`openMobile`, a `Sheet`) than desktop (`open`, a CSS width transition). A global `keydown` listener implements a ⌘B/Ctrl+B keyboard shortcut to toggle the sidebar from anywhere in the app. The whole subtree is wrapped in `TooltipProvider` (`delayDuration={0}`, i.e. instant tooltips) since the icon-collapsed mode relies on tooltips to show labels.

```tsx
const Sidebar = React.forwardRef<HTMLDivElement, { side?: "left"|"right"; variant?: "sidebar"|"floating"|"inset"; collapsible?: "offcanvas"|"icon"|"none"; }>((...) => {
  const { isMobile, state, openMobile, setOpenMobile } = useSidebar();
  if (collapsible === "none") return <div ...>{children}</div>;
  if (isMobile) return (<Sheet open={openMobile} onOpenChange={setOpenMobile}><SheetContent side={side} ...>{children}</SheetContent></Sheet>);
  return ( /* desktop: an invisible width-spacer div + a fixed-position sliding panel, using group-data-[...] selectors keyed off the parent's data-state/data-collapsible/data-variant/data-side attributes */ );
});
```
Three distinct render branches: `collapsible="none"` renders a plain static div (no collapse behavior at all); on mobile it renders the actual sidebar content inside a `Sheet` (slide-in drawer) regardless of the `collapsible` prop; on desktop it renders a clever two-`div` trick — an invisible spacer div that smoothly animates its own `width` to reserve layout space, plus a separately `fixed`-positioned panel that visually slides via `left`/`right` offset — so the surrounding page content reflows smoothly as the sidebar collapses/expands without the sidebar itself needing `position: relative` layout participation.

The remaining ~25 exported pieces (`SidebarTrigger`, `SidebarRail`, `SidebarInset`, `SidebarInput`, `SidebarHeader`, `SidebarFooter`, `SidebarSeparator`, `SidebarContent`, `SidebarGroup` + `GroupLabel`/`GroupAction`/`GroupContent`, `SidebarMenu` + `MenuItem`/`MenuButton`/`MenuAction`/`MenuBadge`/`MenuSkeleton`/`MenuSub`/`MenuSubItem`/`MenuSubButton`) are all small `forwardRef` wrappers following the shared pattern from §2.1, each adding a `data-sidebar="..."` attribute (used purely as a CSS hook for the `group-data-[...]` selectors elsewhere in the file) and composing the building blocks already covered:

- `SidebarTrigger` — a `Button` (`variant="ghost" size="icon"`) showing a `PanelLeft` icon, calling `toggleSidebar()` on click.
- `SidebarRail` — an invisible thin draggable-looking strip at the sidebar's edge that also calls `toggleSidebar()` on click (a secondary way to toggle, common in desktop apps).
- `SidebarMenuButton` — the most complex of these: it conditionally wraps itself in a `Tooltip` (only shown when `state === "collapsed"` and not on mobile — i.e. only meaningful when the label text is hidden) if a `tooltip` prop (string or full `TooltipContent` props) is supplied.
- `SidebarMenuSkeleton` — picks a random width between 50–90% once per mount (`React.useMemo`) so a list of loading skeleton rows looks naturally varied rather than uniform identical bars.

This entire file is exported as one large named-export list at the bottom (`Sidebar`, `SidebarContent`, `SidebarFooter`, ... `useSidebar`), mirroring the compound-component export style used throughout the rest of `components/ui/`.
