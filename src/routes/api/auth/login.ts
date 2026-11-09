import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import {
  AuthConfigurationError,
  json,
  sessionCookie,
  verifyCredentials,
} from "@/lib/session.server";
import { getFlags, isDryRun } from "@/lib/flags.server";
import {
  clearFailures,
  clientIp,
  lockRemainingMs,
  recordFailure,
} from "@/lib/login-throttle.server";

const Body = z.object({
  email: z.string().trim().email().max(200),
  password: z.string().min(1).max(200),
});

const lockedResponse = (ms: number) => {
  const minutes = Math.max(1, Math.ceil(ms / 60_000));
  return json(
    {
      ok: false,
      code: "locked",
      error: `Too many failed attempts. Try again in ${minutes} minute${minutes === 1 ? "" : "s"}.`,
    },
    429,
    { "Retry-After": String(Math.ceil(ms / 1000)) },
  );
};

export const Route = createFileRoute("/api/auth/login")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const parsed = Body.safeParse(await request.json().catch(() => null));
        if (!parsed.success)
          return json({ ok: false, error: "Enter your email and password." }, 400);
        const { email, password } = parsed.data;
        const ip = clientIp(request);

        const remaining = lockRemainingMs(email, ip);
        if (remaining > 0) {
          console.warn(`[auth] locked login attempt for ${email} from ${ip}`);
          return lockedResponse(remaining);
        }

        let user;
        try {
          user = await verifyCredentials(email, password);
        } catch (error) {
          if (!(error instanceof AuthConfigurationError)) throw error;
          console.error(`[auth] configuration error: ${error.message}`);
          return json(
            {
              ok: false,
              error: "Sign-in is temporarily unavailable. Please contact your administrator.",
            },
            503,
          );
        }
        if (!user) {
          const locked = recordFailure(email, ip);
          console.warn(
            `[auth] failed login for ${email} from ${ip}${locked ? " (now locked)" : ""}`,
          );
          if (locked) return lockedResponse(locked);
          return json({ ok: false, error: "Email or password is incorrect." }, 401);
        }
        clearFailures(email, ip);
        console.log(`[auth] login ${user.email} role=${user.role} method=password`);
        return json({ ok: true, data: { user, flags: getFlags(), dryRun: isDryRun() } }, 200, {
          "Set-Cookie": sessionCookie(user),
        });
      },
    },
  },
});
