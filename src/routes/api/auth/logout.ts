import { createFileRoute } from "@tanstack/react-router";
import { clearCookie, json } from "@/lib/session.server";

export const Route = createFileRoute("/api/auth/logout")({
  server: {
    handlers: {
      POST: async () => json({ ok: true }, 200, { "Set-Cookie": clearCookie() }),
    },
  },
});
