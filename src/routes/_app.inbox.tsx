import { createFileRoute, useRouter } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { ChannelBadge, ChannelDot, EmptyState } from "@/components/shared";
import { useSmsFeed, useViberFeed, useWebsiteFeed, useWhatsAppFeed } from "@/hooks/use-feeds";
import {
  CHANNELS,
  formatManila,
  hasReplied,
  type ChannelKey,
  type Conversation,
} from "@/lib/channels";
import type { WebsiteSessionLike } from "@/lib/events";
import { channelHref, timeAgo } from "@/components/mission/data";

export const Route = createFileRoute("/_app/inbox")({
  component: InboxPage,
});

type InboxRow = {
  id: string;
  channel: ChannelKey;
  title: string;
  subtitle: string;
  preview: string;
  lastAt: string;
  needsHuman: boolean;
  replied: boolean;
  href: string;
};

const CHIPS: ChannelKey[] = ["whatsapp", "sms", "viber", "web"];

function fromConv(channel: "whatsapp" | "sms" | "viber", c: Conversation): InboxRow {
  return {
    id: `${channel}:${c.phone}`,
    channel,
    title: c.companyName || c.leadName || c.phone,
    subtitle: [c.leadName, c.phone].filter(Boolean).join(" · "),
    preview: c.lastMessagePreview || c.messages?.[c.messages.length - 1]?.content || "",
    lastAt: c.lastMessageAt || c.lastUpdated,
    needsHuman: !!c.humanEscalated,
    replied: hasReplied(c),
    href: channelHref(channel, { phone: c.phone }),
  };
}

function fromSession(s: WebsiteSessionLike): InboxRow {
  const last = s.messages?.[s.messages.length - 1];
  return {
    id: `web:${s.sessionId}`,
    channel: "web",
    title: s.visitorName || s.businessType || `Visitor · ${s.sessionId.slice(-8)}`,
    subtitle: [s.visitorEmail, s.visitorPhone].filter(Boolean).join(" · "),
    preview: last?.text ?? "",
    lastAt: s.lastMessageAt || last?.timestamp || "",
    needsHuman: s.status === "escalated",
    replied: (s.messages ?? []).some((m) => m.sender === "visitor"),
    href: channelHref("web", { sessionId: s.sessionId }),
  };
}

function InboxPage() {
  const router = useRouter();
  const wa = useWhatsAppFeed();
  const sms = useSmsFeed();
  const viber = useViberFeed();
  const web = useWebsiteFeed();
  const [tab, setTab] = useState<"human" | "all">("human");
  const [chan, setChan] = useState<ChannelKey | "all">("all");
  const [q, setQ] = useState("");

  const rows = useMemo(() => {
    const all: InboxRow[] = [
      ...(wa.data?.items ?? []).map((c) => fromConv("whatsapp", c)),
      ...(sms.data?.items ?? []).map((c) => fromConv("sms", c)),
      ...(viber.data?.items ?? []).map((c) => fromConv("viber", c)),
      ...((web.data ?? []) as unknown as WebsiteSessionLike[])
        .filter((s) => s?.sessionId)
        .map(fromSession),
    ];
    return all.sort((a, b) => (Date.parse(b.lastAt) || 0) - (Date.parse(a.lastAt) || 0));
  }, [wa.data, sms.data, viber.data, web.data]);

  const humanCount = rows.filter((r) => r.needsHuman).length;
  const needle = q.trim().toLowerCase();
  const visible = rows.filter(
    (r) =>
      (tab === "all" || r.needsHuman) &&
      (chan === "all" || r.channel === chan) &&
      (!needle || `${r.title} ${r.subtitle} ${r.preview}`.toLowerCase().includes(needle)),
  );
  const loading = wa.isLoading || sms.isLoading || web.isLoading;
  const errors = [
    wa.isError && "WhatsApp",
    sms.isError && "SMS",
    viber.isError && "Viber",
    web.isError && "Website",
  ].filter(Boolean);

  return (
    <div className="mx-auto max-w-4xl space-y-4">
      <div>
        <h1 className="text-2xl font-bold" style={{ color: "var(--rgf-ink,#1B2419)" }}>
          Inbox
        </h1>
        <p className="text-sm" style={{ color: "var(--muted-foreground,#6B6F68)" }}>
          Every conversation across channels, most recent first.
        </p>
      </div>

      <div
        className="rounded-2xl border bg-[var(--surface,#fff)] shadow-sm"
        style={{ borderColor: "var(--border,#EDE6DC)" }}
      >
        <div
          className="flex flex-wrap items-center gap-2 border-b p-3"
          style={{ borderColor: "var(--border,#EDE6DC)" }}
        >
          <div role="tablist" className="flex rounded-lg bg-black/5 p-0.5">
            {(
              [
                ["human", `Needs Human (${humanCount})`],
                ["all", `All (${rows.length})`],
              ] as const
            ).map(([k, label]) => (
              <button
                key={k}
                role="tab"
                aria-selected={tab === k}
                onClick={() => setTab(k)}
                className="rounded-md px-3 py-1 text-xs font-semibold"
                style={
                  tab === k
                    ? {
                        background: "var(--surface,#fff)",
                        color: "var(--rgf-red,#86000B)",
                        boxShadow: "0 1px 2px rgba(0,0,0,.08)",
                      }
                    : { color: "var(--muted-foreground,#6B6F68)" }
                }
              >
                {label}
              </button>
            ))}
          </div>
          <div className="flex flex-wrap gap-1">
            {(["all", ...CHIPS] as const).map((c) => (
              <button
                key={c}
                onClick={() => setChan(c)}
                aria-pressed={chan === c}
                className="flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px]"
                style={
                  chan === c
                    ? {
                        background: "var(--rgf-ink,#1B2419)",
                        color: "var(--surface,#fff)",
                        borderColor: "transparent",
                      }
                    : { borderColor: "var(--border,#EDE6DC)", color: "var(--muted-foreground,#6B6F68)" }
                }
              >
                {c !== "all" && <ChannelDot channel={c} />}
                {c === "all" ? "All channels" : CHANNELS[c].label}
              </button>
            ))}
          </div>
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search company, name, phone…"
            aria-label="Search conversations"
            className="ml-auto w-full rounded-full border bg-transparent px-3 py-1 text-xs outline-none focus:ring-2 focus:ring-[#86000B]/30 sm:w-56"
            style={{ borderColor: "var(--border,#EDE6DC)" }}
          />
        </div>

        {errors.length > 0 && (
          <div
            className="border-b px-3 py-1.5 text-[11px] text-[#86000B]"
            style={{ borderColor: "var(--border,#EDE6DC)" }}
          >
            Couldn’t load: {errors.join(", ")}
          </div>
        )}

        {loading && !rows.length ? (
          <div className="space-y-2 p-3">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="h-14 animate-pulse rounded-lg bg-black/5" />
            ))}
          </div>
        ) : !visible.length ? (
          <div className="p-6">
            <EmptyState
              title={tab === "human" ? "Nobody is waiting on a human" : "No conversations"}
              description={
                tab === "human"
                  ? "Escalated conversations show up here."
                  : "Try another channel or search."
              }
            />
          </div>
        ) : (
          <ul className="divide-y" style={{ borderColor: "var(--border,#EDE6DC)" }}>
            {visible.map((r) => (
              <li key={r.id}>
                <button
                  type="button"
                  onClick={() => router.navigate({ href: r.href })}
                  className="flex w-full items-start gap-3 px-3 py-2.5 text-left hover:bg-black/[.03]"
                >
                  <ChannelBadge channel={r.channel} />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-baseline gap-2">
                      <span
                        className="truncate text-sm font-semibold"
                        style={{ color: "var(--rgf-ink,#1B2419)" }}
                      >
                        {r.title}
                      </span>
                      {r.needsHuman && (
                        <span className="rounded-full bg-[#86000B] px-1.5 py-px text-[9px] font-bold uppercase text-white">
                          Needs human
                        </span>
                      )}
                      {!r.needsHuman && r.replied && (
                        <span className="rounded-full bg-[#33673B]/15 px-1.5 py-px text-[9px] font-bold uppercase text-[#33673B]">
                          Replied
                        </span>
                      )}
                    </div>
                    {r.subtitle && (
                      <div
                        className="truncate font-mono text-[10px]"
                        style={{ color: "var(--muted-foreground,#6B6F68)" }}
                      >
                        {r.subtitle}
                      </div>
                    )}
                    <div className="truncate text-xs" style={{ color: "var(--muted-foreground,#6B6F68)" }}>
                      {r.preview}
                    </div>
                  </div>
                  <time
                    className="shrink-0 text-[10px]"
                    dateTime={r.lastAt}
                    title={formatManila(r.lastAt)}
                    style={{ color: "var(--muted-foreground,#6B6F68)" }}
                  >
                    {timeAgo(r.lastAt)}
                  </time>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
