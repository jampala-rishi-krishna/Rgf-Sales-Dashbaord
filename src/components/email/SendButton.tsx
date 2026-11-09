import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
import { DisabledReason } from "@/components/shared";
import { canAct, useMe } from "@/hooks/use-me";
import { postAction, type ActionResult } from "@/lib/action-client";

export type SendPayload = {
  to: string;
  cc?: string;
  subject: string;
  html: string;
  threadId?: string;
  inReplyTo?: string;
};

export function useCanSend(): { canSend: boolean; reason?: string; live?: boolean } {
  const { data, isLoading } = useMe();
  const user = data?.user ?? null;
  if (isLoading) return { canSend: false, reason: "Checking your permissions…" };
  if (!user) return { canSend: false, reason: "Sign in to send email" };
  if (!canAct(user.role, "agent"))
    return { canSend: false, reason: "Viewers can't send email — ask an admin for agent access" };
  return { canSend: true, live: data?.flags.emailSend };
}

export async function sendEmail(payload: SendPayload): Promise<ActionResult> {
  return postAction("/api/gmail-send", payload, "Email sent");
}

/** Gmail's blue pill "Send" button; disabled with a reason for viewers. */
export function SendButton({
  build,
  onSent,
  invalidReason,
}: {
  build: () => SendPayload | null;
  onSent?: () => void;
  invalidReason?: string;
}) {
  const { canSend, reason, live } = useCanSend();
  const queryClient = useQueryClient();
  const [busy, setBusy] = useState(false);
  const disabled = !canSend || busy || !!invalidReason;

  const click = async () => {
    const payload = build();
    if (!payload) return;
    setBusy(true);
    const res = await sendEmail(payload);
    setBusy(false);
    if (res.ok && !res.dryRun) {
      await queryClient.invalidateQueries({ queryKey: ["gmail-threads"] });
      if (payload.threadId)
        await queryClient.invalidateQueries({ queryKey: ["gmail-thread", payload.threadId] });
      onSent?.();
    }
  };

  return (
    <DisabledReason disabled={!canSend || !!invalidReason} reason={reason ?? invalidReason}>
      <button
        type="button"
        onClick={click}
        disabled={disabled}
        className="inline-flex items-center gap-2 h-9 px-6 rounded-full bg-[#0B57D0] text-white text-sm font-medium shadow-sm hover:shadow-md hover:bg-[#0A4FBD] disabled:opacity-50 disabled:shadow-none transition"
      >
        {busy && <Loader2 className="h-4 w-4 animate-spin" />}
        {live ? "Send" : "Preview send"}
      </button>
    </DisabledReason>
  );
}
