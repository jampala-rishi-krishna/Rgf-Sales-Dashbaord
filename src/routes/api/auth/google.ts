import { createFileRoute } from "@tanstack/react-router";
import { authorizeUrl, googleConfig, googleSsoEnabled, newState } from "@/lib/google-oauth.server";

export const Route = createFileRoute("/api/auth/google")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const cfg = googleConfig();
        if (!googleSsoEnabled() || !cfg)
          return new Response(null, {
            status: 302,
            headers: { Location: "/login?error=sso_disabled" },
          });
        const { state, cookie } = newState();
        return new Response(null, {
          status: 302,
          headers: {
            Location: authorizeUrl(request, state, cfg.clientId),
            "Set-Cookie": cookie,
            "Cache-Control": "no-store",
          },
        });
      },
    },
  },
});
