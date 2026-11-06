import { createFileRoute } from "@tanstack/react-router";
import { getSession, json } from "@/lib/session.server";
import { getFlags, isDryRun } from "@/lib/flags.server";

export const Route = createFileRoute("/api/auth/me")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const user = getSession(request);
        if (!user) return json({ user: null, flags: getFlags(), dryRun: isDryRun() }, 401);
        return json({ user, flags: getFlags(), dryRun: isDryRun() });
      },
    },
  },
});
