import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { GmailConnectionError, moveGmailThreads } from "@/lib/gmail-server";
import { getSession, hasRole, json } from "@/lib/session.server";

const Body = z.object({
  threadIds: z
    .array(
      z
        .string()
        .regex(/^[A-Za-z0-9]+$/)
        .max(100),
    )
    .min(1)
    .max(100),
  restore: z.boolean().default(false),
});

export async function handleGmailTrash(request: Request): Promise<Response> {
  const user = getSession(request);
  if (!user) return json({ ok: false, error: "Sign in to manage email." }, 401);
  if (!hasRole(user, "agent"))
    return json({ ok: false, error: "Agent access is required to delete email." }, 403);
  const parsed = Body.safeParse(await request.json().catch(() => null));
  if (!parsed.success)
    return json({ ok: false, error: "Select between 1 and 100 valid conversations." }, 400);
  try {
    const data = await moveGmailThreads([...new Set(parsed.data.threadIds)], parsed.data.restore);
    return json(
      {
        ok: data.failed.length === 0,
        data,
        ...(data.failed.length
          ? { error: "Some conversations could not be updated. Please retry." }
          : {}),
      },
      data.moved.length || !data.failed.length ? 200 : 502,
    );
  } catch (error) {
    console.error("[gmail-trash] failed", error);
    return json(
      {
        ok: false,
        error:
          error instanceof GmailConnectionError
            ? error.message
            : "Couldn't update Gmail Trash. Please retry.",
      },
      502,
    );
  }
}

export const Route = createFileRoute("/api/gmail-trash")({
  server: { handlers: { POST: ({ request }) => handleGmailTrash(request) } },
});
