import { createFileRoute } from "@tanstack/react-router";
import {
  SsoError,
  clearStateCookie,
  exchangeCode,
  googleSsoEnabled,
  resolveSsoUser,
  stateMatches,
} from "@/lib/google-oauth.server";
import { AuthConfigurationError, sessionCookie } from "@/lib/session.server";

function redirect(location: string, cookies: string[]): Response {
  const headers = new Headers({ Location: location, "Cache-Control": "no-store" });
  for (const c of cookies) headers.append("Set-Cookie", c);
  return new Response(null, { status: 302, headers });
}

export const Route = createFileRoute("/api/auth/google/callback")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const clear = clearStateCookie();
        const fail = (code: string) => redirect(`/login?error=${code}`, [clear]);
        if (!googleSsoEnabled()) return fail("sso_disabled");

        const params = new URL(request.url).searchParams;
        if (params.get("error")) return fail("sso_cancelled"); // e.g. access_denied
        if (!stateMatches(request, params.get("state"))) return fail("sso_state");
        const code = params.get("code");
        if (!code) return fail("sso_failed");

        try {
          const identity = await exchangeCode(request, code);
          const user = resolveSsoUser(identity);
          const session = sessionCookie(user); // throws if SESSION_SECRET is missing in prod
          console.log(`[auth] login ${user.email} role=${user.role} method=google`);
          return redirect("/", [clear, session]);
        } catch (error) {
          if (error instanceof SsoError) {
            console.warn(`[auth] google sign-in refused: ${error.code}`);
            return fail(`sso_${error.code}`);
          }
          if (error instanceof AuthConfigurationError) {
            console.error(`[auth] configuration error: ${error.message}`);
            return fail("sso_unavailable");
          }
          throw error;
        }
      },
    },
  },
});
