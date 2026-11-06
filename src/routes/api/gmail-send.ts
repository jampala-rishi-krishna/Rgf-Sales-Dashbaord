import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { sendGmailMessage } from "@/lib/gmail-server";
import { getSession, hasRole } from "@/lib/session.server";

const SendSchema = z.object({
  to: z.string().trim().min(3).max(2000),
  cc: z.string().trim().max(2000).optional(),
  subject: z.string().max(998),
  html: z.string().min(1).max(500_000),
  threadId: z
    .string()
    .regex(/^[A-Za-z0-9]+$/)
    .optional(),
  inReplyTo: z.string().max(998).optional(),
});

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
  });
}

export async function handleGmailSend(request: Request): Promise<Response> {
  const user = getSession(request);
  if (!user) return json({ ok: false, error: "Sign in to send email." }, 401);
  if (!hasRole(user, "agent"))
    return json({ ok: false, error: "Agent access is required to send email." }, 403);
  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return json({ ok: false, error: "Invalid JSON body" }, 400);
  }
  const parsed = SendSchema.safeParse(raw);
  if (!parsed.success) {
    return json(
      {
        ok: false,
        error: parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; "),
      },
      400,
    );
  }
  const input = { ...parsed.data, cc: parsed.data.cc || undefined };

  // Dashboard sending can be enabled independently of campaign and call actions.
  if (process.env.GMAIL_SEND_ENABLED !== "true" && process.env.ACTIONS_DRY_RUN !== "false") {
    console.log("[gmail-send] dry run", {
      to: input.to,
      subject: input.subject,
      threadId: input.threadId,
    });
    return json({ ok: true, dryRun: true });
  }

  try {
    const data = await sendGmailMessage(input);
    console.log("[gmail-send] sent", {
      to: input.to,
      threadId: data.threadId,
      ts: new Date().toISOString(),
    });
    return json({ ok: true, data });
  } catch (err) {
    console.error("[gmail-send] error:", err);
    return json(
      { ok: false, error: err instanceof Error ? err.message : "Failed to send email" },
      502,
    );
  }
}

export const Route = createFileRoute("/api/gmail-send")({
  server: { handlers: { POST: ({ request }) => handleGmailSend(request) } },
});
