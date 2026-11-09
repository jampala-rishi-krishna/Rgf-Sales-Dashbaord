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

/** Paths under /api that are reachable without a session. */
const PUBLIC_API = new Set([
  "/api/auth/login",
  "/api/auth/me", // handler checks the session itself; signed-out reply carries only public flags
  "/api/auth/google",
  "/api/auth/google/callback",
]);

/** Rejects any /api/* request without a valid signed session cookie. */
const authMiddleware = createMiddleware().server(async ({ request, pathname, next }) => {
  const path = (pathname || new URL(request.url).pathname).replace(/\/+$/, "") || "/";
  if (!path.startsWith("/api/") || PUBLIC_API.has(path)) return next();
  // Dynamic import keeps node:crypto / bcrypt out of any client bundle.
  const { getSession } = await import("./lib/session.server");
  if (!getSession(request)) {
    return new Response(JSON.stringify({ ok: false, error: "Unauthorized" }), {
      status: 401,
      headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
    });
  }
  return next();
});

export const startInstance = createStart(() => ({
  requestMiddleware: [errorMiddleware, authMiddleware],
}));
