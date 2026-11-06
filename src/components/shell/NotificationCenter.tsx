import { useNavigate } from "@tanstack/react-router";
import {
  Bell,
  BellOff,
  CalendarCheck,
  CheckCheck,
  MessageCircle,
  Siren,
  Volume2,
  VolumeX,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { ChannelGlyph, EmptyState } from "@/components/shared";
import { CHANNELS, formatManila, type ChannelKey, type Conversation } from "@/lib/channels";
import { cn } from "@/lib/utils";

type Kind = "reply" | "escalated" | "meeting";
export type Notice = {
  id: string;
  kind: Kind;
  channel: ChannelKey;
  phone: string;
  company: string;
  preview: string;
  ts: number;
  read: boolean;
};

const SOUND_KEY = "rgf-notify-sound";
const MAX = 50;

type Snap = { lastCustomerTs: string; escalated: boolean; meeting: boolean };

function snapshot(c: Conversation): Snap {
  let lastCustomerTs = "";
  for (let i = c.messages.length - 1; i >= 0; i--) {
    if (c.messages[i].role === "customer") {
      lastCustomerTs = c.messages[i].ts || String(i);
      break;
    }
  }
  return { lastCustomerTs, escalated: !!c.humanEscalated, meeting: !!c.meetingScheduled };
}

function lastCustomerText(c: Conversation) {
  for (let i = c.messages.length - 1; i >= 0; i--)
    if (c.messages[i].role === "customer") return c.messages[i].content;
  return c.lastMessagePreview;
}

function beep() {
  try {
    const Ctx =
      window.AudioContext ??
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctx) return;
    const ctx = new Ctx();
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = "sine";
    o.frequency.value = 880;
    g.gain.setValueAtTime(0.0001, ctx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.15, ctx.currentTime + 0.02);
    g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.35);
    o.connect(g).connect(ctx.destination);
    o.start();
    o.stop(ctx.currentTime + 0.4);
    setTimeout(() => void ctx.close(), 600);
  } catch {
    /* autoplay blocked */
  }
}

const KIND_META: Record<Kind, { label: string; icon: typeof Bell }> = {
  reply: { label: "New reply", icon: MessageCircle },
  escalated: { label: "Needs a human", icon: Siren },
  meeting: { label: "Meeting booked", icon: CalendarCheck },
};

/** Diffs the shared conversation feeds between polls and surfaces new replies, escalations and meetings. */
export function NotificationCenter({
  feeds,
}: {
  feeds: Partial<Record<ChannelKey, Conversation[] | undefined>>;
}) {
  const navigate = useNavigate();
  const [items, setItems] = useState<Notice[]>([]);
  const [sound, setSound] = useState(false);
  const seen = useRef<Map<string, Snap>>(new Map());
  const seeded = useRef<Set<ChannelKey>>(new Set());

  useEffect(() => {
    try {
      setSound(localStorage.getItem(SOUND_KEY) === "1");
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => {
    const fresh: Notice[] = [];
    for (const [ch, list] of Object.entries(feeds) as [ChannelKey, Conversation[] | undefined][]) {
      if (!list) continue;
      const firstPass = !seeded.current.has(ch);
      for (const c of list) {
        const key = `${ch}:${c.phone}`;
        const next = snapshot(c);
        const prev = seen.current.get(key);
        seen.current.set(key, next);
        if (firstPass) continue;
        const base = {
          channel: ch,
          phone: c.phone,
          company: c.companyName || c.leadName || c.phone,
          ts: Date.now(),
          read: false,
        };
        if (next.escalated && !prev?.escalated)
          fresh.push({
            ...base,
            id: `${key}:esc:${next.lastCustomerTs}`,
            kind: "escalated",
            preview: lastCustomerText(c),
          });
        else if (next.meeting && !prev?.meeting)
          fresh.push({
            ...base,
            id: `${key}:mtg`,
            kind: "meeting",
            preview: c.meetingDateTime
              ? `Meeting ${formatManila(c.meetingDateTime)}`
              : "Meeting scheduled",
          });
        else if (next.lastCustomerTs && next.lastCustomerTs !== prev?.lastCustomerTs)
          fresh.push({
            ...base,
            id: `${key}:r:${next.lastCustomerTs}`,
            kind: "reply",
            preview: lastCustomerText(c),
          });
      }
      seeded.current.add(ch);
    }
    if (!fresh.length) return;
    setItems((cur) => {
      const ids = new Set(cur.map((n) => n.id));
      return [...fresh.filter((n) => !ids.has(n.id)), ...cur].slice(0, MAX);
    });
    const shown = fresh.slice(0, 3);
    for (const n of shown) {
      const fn = n.kind === "escalated" ? toast.warning : toast.info;
      fn(`${KIND_META[n.kind].label} · ${CHANNELS[n.channel].label}`, {
        id: n.id,
        description: `${n.company}: ${n.preview.slice(0, 90)}`,
        action: { label: "Open", onClick: () => open(n) },
      });
    }
    if (fresh.length > shown.length) toast(`+${fresh.length - shown.length} more updates`);
    if (sound) beep();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [feeds.whatsapp, feeds.sms, feeds.viber]);

  function open(n: Notice) {
    setItems((cur) => cur.map((x) => (x.id === n.id ? { ...x, read: true } : x)));
    void navigate({ to: CHANNELS[n.channel].route as "/", search: { phone: n.phone } as never });
  }

  function toggleSound() {
    setSound((s) => {
      try {
        localStorage.setItem(SOUND_KEY, s ? "0" : "1");
      } catch {
        /* ignore */
      }
      return !s;
    });
  }

  const unread = items.filter((n) => !n.read).length;

  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          className="relative inline-flex size-9 items-center justify-center rounded-lg text-muted-foreground hover:bg-muted hover:text-foreground"
          aria-label={`Notifications${unread ? `, ${unread} unread` : ""}`}
        >
          <Bell className="size-[18px]" />
          {unread > 0 && (
            <span className="font-mono-num absolute top-1 right-1 min-w-4 rounded-full bg-[var(--rgf-red)] px-1 text-center text-[10px] leading-4 font-semibold text-white">
              {unread > 9 ? "9+" : unread}
            </span>
          )}
        </button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-[min(380px,calc(100vw-24px))] p-0">
        <div className="flex items-center justify-between border-b px-3 py-2">
          <p className="text-sm font-semibold">Notifications</p>
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={toggleSound}
              className="inline-flex size-8 items-center justify-center rounded-md text-muted-foreground hover:bg-muted"
              aria-label={sound ? "Mute sound" : "Enable sound"}
              title={sound ? "Sound on" : "Sound off"}
            >
              {sound ? <Volume2 className="size-4" /> : <VolumeX className="size-4" />}
            </button>
            <button
              type="button"
              onClick={() => setItems((c) => c.map((n) => ({ ...n, read: true })))}
              className="inline-flex size-8 items-center justify-center rounded-md text-muted-foreground hover:bg-muted disabled:opacity-40"
              disabled={!unread}
              aria-label="Mark all read"
              title="Mark all read"
            >
              <CheckCheck className="size-4" />
            </button>
          </div>
        </div>
        <div className="max-h-[60vh] overflow-y-auto">
          {items.length === 0 ? (
            <EmptyState
              icon={<BellOff />}
              title="You're all caught up"
              description="New replies, escalations and meetings will appear here while this tab is open."
            />
          ) : (
            <ul className="divide-y">
              {items.map((n) => {
                const K = KIND_META[n.kind];
                return (
                  <li key={n.id}>
                    <button
                      type="button"
                      onClick={() => open(n)}
                      className={cn(
                        "flex w-full gap-3 px-3 py-2.5 text-left hover:bg-muted",
                        !n.read && "bg-[color-mix(in_srgb,var(--rgf-red)_5%,transparent)]",
                      )}
                    >
                      <span className="mt-0.5">
                        <ChannelGlyph channel={n.channel} size={16} />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
                          <K.icon
                            className={cn("size-3.5", n.kind === "escalated" && "text-red-600")}
                          />{" "}
                          {K.label}
                          <span className="ml-auto font-mono-num">
                            {formatManila(n.ts, { hour: "2-digit", minute: "2-digit" })}
                          </span>
                        </span>
                        <span className="block truncate text-sm font-medium text-foreground">
                          {n.company}
                        </span>
                        <span className="block truncate text-xs text-muted-foreground">
                          {n.preview}
                        </span>
                      </span>
                      {!n.read && (
                        <span
                          className="mt-2 size-2 shrink-0 rounded-full bg-[var(--rgf-red)]"
                          aria-label="Unread"
                        />
                      )}
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}
