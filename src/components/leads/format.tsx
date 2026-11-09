// Small display helpers for the Leads tab.
import { ChannelGlyph } from "@/components/shared";
import { CHANNELS, formatManila } from "@/lib/channels";
import { channelLabel, type ConvertChannel } from "@/lib/conversion";
import { cn } from "@/lib/utils";

const RTF =
  typeof Intl !== "undefined" ? new Intl.RelativeTimeFormat("en", { numeric: "auto" }) : null;
const UNITS: [Intl.RelativeTimeFormatUnit, number][] = [
  ["year", 31_536_000],
  ["month", 2_592_000],
  ["week", 604_800],
  ["day", 86_400],
  ["hour", 3_600],
  ["minute", 60],
];

export function relativeTime(ts?: string, now = Date.now()): string {
  const t = ts ? Date.parse(ts) : NaN;
  if (!Number.isFinite(t) || !RTF) return "";
  const s = Math.round((t - now) / 1000);
  for (const [unit, secs] of UNITS)
    if (Math.abs(s) >= secs) return RTF.format(Math.round(s / secs), unit);
  return "just now";
}

const DATE_OPTS: Intl.DateTimeFormatOptions = { year: "2-digit", month: "short", day: "numeric" };
const FULL_OPTS: Intl.DateTimeFormatOptions = {
  weekday: "short",
  year: "numeric",
  month: "short",
  day: "numeric",
  hour: "numeric",
  minute: "2-digit",
};

/** Manila date (or date+time) with the relative time + full timestamp on hover. */
export function When({
  ts,
  withTime,
  className,
}: {
  ts?: string;
  withTime?: boolean;
  className?: string;
}) {
  if (!ts || !Number.isFinite(Date.parse(ts)))
    return <span className="text-muted-foreground">—</span>;
  return (
    <time
      dateTime={ts}
      title={`${relativeTime(ts)} · ${formatManila(ts, FULL_OPTS)} (Manila)`}
      className={cn("tabular-nums", className)}
    >
      {formatManila(
        ts,
        withTime ? { ...DATE_OPTS, hour: "numeric", minute: "2-digit" } : DATE_OPTS,
      )}
    </time>
  );
}

export function ChannelChip({
  channel,
  className,
}: {
  channel?: ConvertChannel;
  className?: string;
}) {
  if (!channel) return <span className="text-muted-foreground">—</span>;
  const color = CHANNELS[channel].color;
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium whitespace-nowrap",
        className,
      )}
      style={{ color, backgroundColor: `color-mix(in srgb, ${color} 13%, transparent)` }}
    >
      <ChannelGlyph channel={channel} size={11} />
      {channelLabel(channel)}
    </span>
  );
}

const STATUS_STYLE: [RegExp, string][] = [
  [/junk|lost|not qualified/i, "bg-red-50 text-red-700 dark:bg-red-950/60 dark:text-red-300"],
  [/qualified/i, "bg-green-50 text-green-800 dark:bg-green-950/60 dark:text-green-300"],
  [/contacted|attempted/i, "bg-blue-50 text-blue-700 dark:bg-blue-950/60 dark:text-blue-300"],
  [/future/i, "bg-amber-50 text-amber-800 dark:bg-amber-950/60 dark:text-amber-300"],
];

export function StatusPill({ status }: { status?: string }) {
  if (!status) return <span className="text-muted-foreground">—</span>;
  const cls = STATUS_STYLE.find(([re]) => re.test(status))?.[1] ?? "bg-muted text-muted-foreground";
  return (
    <span className={cn("rounded-full px-2 py-0.5 text-[11px] font-medium whitespace-nowrap", cls)}>
      {status}
    </span>
  );
}

export function readLocal<T>(key: string, fallback: T): T {
  try {
    const v = localStorage.getItem(key);
    return v ? (JSON.parse(v) as T) : fallback;
  } catch {
    return fallback;
  }
}

export function writeLocal(key: string, v: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(v));
  } catch {
    /* storage unavailable */
  }
}

/** "/whatsapp?phone=%2B63…" → Link props ({ to, search }) for client-side navigation. */
export function hrefToLink(href: string): { to: "/"; search: never } {
  const [path, query = ""] = href.split("?");
  return {
    to: (path || "/") as "/",
    search: Object.fromEntries(new URLSearchParams(query)) as never,
  };
}
