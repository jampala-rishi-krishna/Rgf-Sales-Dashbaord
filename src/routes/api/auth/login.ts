import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { json, sessionCookie, verifyCredentials } from "@/lib/session.server";
import { getFlags, isDryRun } from "@/lib/flags.server";

const Body = z.object({
  email: z.string().trim().email().max(200),
  password: z.string().min(1).max(200),
});

export const Route = createFileRoute("/api/auth/login")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const parsed = Body.safeParse(await request.json().catch(() => null));
        if (!parsed.success)
          return json({ ok: false, error: "Email and password are required." }, 400);
        const user = await verifyCredentials(parsed.data.email, parsed.data.password);
        if (!user) {
          console.warn(`[auth] failed login for ${parsed.data.email}`);
          return json({ ok: false, error: "Invalid email or password." }, 401);
        }
        console.log(`[auth] login ${user.email} role=${user.role}`);
        return json({ ok: true, data: { user, flags: getFlags(), dryRun: isDryRun() } }, 200, {
          "Set-Cookie": sessionCookie(user),
        });
      },
    },
  },
});
