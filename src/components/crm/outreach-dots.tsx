import { memo } from "react";
import { CHANNELS } from "@/lib/channels";
import {
  OUTREACH_CHANNELS,
  type OutreachChannel,
  type OutreachEntry,
} from "@/hooks/use-outreach-index";

export const OUTREACH_META: Record<OutreachChannel, { label: string; color: string }> = {
  whatsapp: { label: "WhatsApp", color: CHANNELS.whatsapp.color },
  sms: { label: "SMS", color: CHANNELS.sms.color },
  viber: { label: "Viber", color: CHANNELS.viber.color },
  email: { label: "Email", color: CHANNELS.email.color },
  call: { label: "Call", color: CHANNELS.voice.color },
  web: { label: "Website", color: CHANNELS.web.color },
};

/** Per-channel dot: hollow grey = none, filled = contacted, ring = replied, star = meeting. */
export const OutreachDots = memo(function OutreachDots({ outreach }: { outreach: OutreachEntry }) {
  return (
    <div className="flex items-center gap-1.5">
      {OUTREACH_CHANNELS.map((ch) => {
        const s = outreach[ch];
        const { label, color } = OUTREACH_META[ch];
        const state = !s
          ? "not contacted"
          : s.meeting
            ? "meeting booked"
            : s.replied
              ? "replied"
              : "contacted";
        const title = `${label}: ${state}`;
        if (s?.meeting)
          return (
            <span
              key={ch}
              title={title}
              aria-label={title}
              className="text-[12px] leading-none"
              style={{ color }}
            >
              ★
            </span>
          );
        return (
          <span
            key={ch}
            title={title}
            aria-label={title}
            className="inline-block size-2.5 rounded-full"
            style={
              !s
                ? { border: "1px solid var(--border, #EDE6DC)" }
                : s.replied
                  ? {
                      background: color,
                      boxShadow: `0 0 0 2px var(--surface, #fff), 0 0 0 3.5px ${color}`,
                    }
                  : { background: color }
            }
          />
        );
      })}
    </div>
  );
});
