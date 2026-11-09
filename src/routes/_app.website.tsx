import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { ArrowLeft, Info, MessagesSquare, Search } from "lucide-react";
import { ChannelGlyph } from "@/components/shared";
import { useWebsiteFeed } from "@/hooks/use-feeds";
import { formatManila } from "@/lib/channels";
import { ChatThread, ReplyComposer } from "@/components/website/chat-thread";
import { VisitorPanel } from "@/components/website/visitor-panel";
import { ConvertLeadButton, ConvertedBadge } from "@/components/convert/ConvertLeadButton";
import {
  initials,
  location,
  sessionLabel,
  statusMeta,
  type WebsiteChatSession,
} from "@/components/website/types";

export const Route = createFileRoute("/_app/website")({
  validateSearch: (s: Record<string, unknown>): { session?: string } =>
    typeof s.session === "string" && s.session ? { session: s.session } : {},
  component: WebsiteTab,
});

type Filter = "all" | "ai" | "escalated";
const FILTERS: { key: Filter; label: string }[] = [
  { key: "all", label: "All" },
  { key: "ai", label: "AI Handling" },
  { key: "escalated", label: "Needs Human" },
];

function WebsiteTab() {
  const { session: sessionParam } = Route.useSearch();
  const navigate = Route.useNavigate();
  const select = (id: string | null) => navigate({ search: id ? { session: id } : {} });

  const { data, isLoading, error } = useWebsiteFeed(30_000);
  const all = useMemo(() => (data ?? []) as unknown as WebsiteChatSession[], [data]);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<Filter>("all");
  const [showInfo, setShowInfo] = useState(false);

  const sessions = useMemo(() => {
    const sorted = [...all].sort((a, b) =>
      (b.lastMessageAt ?? "").localeCompare(a.lastMessageAt ?? ""),
    );
    const q = search.toLowerCase().trim();
    return sorted.filter((s) => {
      if (filter !== "all" && s.status !== filter) return false;
      if (!q) return true;
      return [s.visitorName, s.visitorEmail, s.visitorPhone, s.businessType, s.sessionId]
        .join(" ")
        .toLowerCase()
        .includes(q);
    });
  }, [all, search, filter]);

  const escalatedCount = useMemo(() => all.filter((s) => s.status === "escalated").length, [all]);
  const active = sessionParam ? all.find((s) => s.sessionId === sessionParam) : undefined;

  return (
    <div
      data-channel="web"
      className="grid h-[calc(100dvh-7rem)] min-h-[480px] grid-cols-1 overflow-hidden rounded-2xl bg-white shadow-sm ring-1 ring-black/5 md:grid-cols-[minmax(280px,34%)_1fr] xl:grid-cols-[minmax(280px,30%)_1fr_280px]"
    >
      {/* Session list */}
      <aside
        className={`min-h-0 flex-col border-r border-[#e0d6c8] bg-[#FFEBCE]/60 ${active ? "hidden md:flex" : "flex"}`}
      >
        <div className="shrink-0 space-y-3 p-3">
          <div className="flex items-center gap-2">
            <ChannelGlyph channel="web" size={22} />
            <h1 className="text-base font-bold text-[#86000B]">Website chat</h1>
            {escalatedCount > 0 && (
              <span className="ml-auto rounded-full bg-[#86000B] px-2 py-0.5 text-[10px] font-semibold text-white">
                {escalatedCount} need human
              </span>
            )}
          </div>
          <label className="flex items-center gap-2 rounded-full bg-white px-3 py-2 ring-1 ring-[#e0d6c8] focus-within:ring-[#86000B]/50">
            <Search className="size-4 text-[#8a8a8a]" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search name, email, business…"
              aria-label="Search website chats"
              className="w-full bg-transparent text-sm text-[#1B2419] placeholder:text-[#8a8a8a] focus:outline-none"
            />
          </label>
          <div className="flex gap-1.5">
            {FILTERS.map((f) => (
              <button
                key={f.key}
                type="button"
                aria-pressed={filter === f.key}
                onClick={() => setFilter(f.key)}
                className={`rounded-full px-2.5 py-1 text-xs font-medium transition-colors motion-reduce:transition-none ${filter === f.key ? "bg-[#86000B] text-white" : "bg-white text-[#6b6b6b] ring-1 ring-[#e0d6c8] hover:bg-[#FFF8F0]"}`}
              >
                {f.label}
              </button>
            ))}
          </div>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto">
          {isLoading &&
            Array.from({ length: 6 }).map((_, i) => (
              <div
                key={i}
                className="mx-3 mb-2 h-16 animate-pulse rounded-xl bg-white/70 motion-reduce:animate-none"
              />
            ))}
          {error && (
            <div className="m-3 rounded-xl bg-red-50 p-3 text-sm text-red-700">
              Failed to load website chat sessions.
            </div>
          )}
          {!isLoading && !error && sessions.length === 0 && (
            <div className="flex flex-col items-center gap-2 py-10 text-sm text-[#6b6b6b]">
              <MessagesSquare className="size-6" /> No conversations yet.
            </div>
          )}
          {sessions.map((s) => {
            const sel = active?.sessionId === s.sessionId;
            const st = statusMeta(s.status);
            const lastMsg = s.messages?.[s.messages.length - 1];
            const secondary = s.businessType || location(s) || s.pageUrl;
            return (
              <button
                key={s.sessionId}
                type="button"
                onClick={() => select(s.sessionId)}
                aria-current={sel ? "true" : undefined}
                className={`flex w-full items-start gap-3 border-l-[3px] px-3 py-2.5 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[#86000B]/40 motion-reduce:transition-none ${
                  sel ? "border-[#86000B] bg-white" : "border-transparent hover:bg-white/70"
                }`}
              >
                <div className="grid size-10 shrink-0 place-items-center rounded-full bg-white text-sm font-bold text-[#86000B] ring-1 ring-[#86000B]/15">
                  {initials(sessionLabel(s))}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <div className="min-w-0 flex-1 truncate text-sm font-semibold text-[#1B2419]">
                      {sessionLabel(s)}
                    </div>
                    <span className="shrink-0 text-[10px] text-[#8a8a8a]">
                      {formatManila(s.lastMessageAt, { month: "short", day: "numeric" })}
                    </span>
                  </div>
                  {secondary && (
                    <div className="truncate text-[11px] text-[#6b6b6b]">{secondary}</div>
                  )}
                  <div className="mt-1 flex items-center gap-2">
                    <div className="min-w-0 flex-1 truncate text-xs text-[#6b6b6b]">
                      {lastMsg
                        ? `${lastMsg.sender === "agent" ? "Martin: " : ""}${lastMsg.text || "Attachment"}`
                        : `${s.messageCount} msgs`}
                    </div>
                    <span
                      className={`shrink-0 rounded-full px-1.5 py-0.5 text-[9px] font-bold tracking-wide ${st.cls}`}
                    >
                      {st.label}
                    </span>
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      </aside>

      {/* Chat */}
      <section className={`min-h-0 flex-col ${active ? "flex" : "hidden md:flex"}`}>
        {!active ? (
          <div className="flex h-full flex-col items-center justify-center gap-3 bg-[#FFF8F0] p-6 text-center text-sm text-[#6b6b6b]">
            <ChannelGlyph channel="web" size={32} />
            {sessionParam && !isLoading
              ? "That session wasn't found."
              : "Select a conversation to view"}
          </div>
        ) : (
          <>
            <header className="flex shrink-0 items-center gap-3 bg-[#86000B] px-3 py-2.5 md:px-5">
              <button
                type="button"
                onClick={() => select(null)}
                aria-label="Back to conversations"
                className="rounded-full p-1 text-white/90 hover:bg-white/10 md:hidden"
              >
                <ArrowLeft className="size-5" />
              </button>
              <div className="grid size-9 shrink-0 place-items-center rounded-full bg-white/20 text-sm font-bold text-white">
                {initials(sessionLabel(active))}
              </div>
              <div className="min-w-0 flex-1">
                <div className="truncate font-bold leading-tight text-white">
                  {sessionLabel(active)}
                </div>
                <div className="truncate text-xs text-white/70">
                  {[active.businessType, location(active)].filter(Boolean).join(" · ") ||
                    "Website visitor"}
                </div>
              </div>
              <ConvertedBadge
                subject={{ phone: active.visitorPhone, email: active.visitorEmail }}
                className="hidden sm:inline-flex"
              />
              <ConvertLeadButton
                tone="dark"
                subject={{
                  name: active.visitorName,
                  company: active.businessType,
                  phone: active.visitorPhone,
                  email: active.visitorEmail,
                  channelSegment: active.businessSegment,
                }}
              />
              <span
                className={`hidden shrink-0 rounded-full px-2.5 py-0.5 text-[11px] font-bold sm:inline ${active.status === "escalated" ? "bg-white text-[#86000B]" : "bg-white/15 text-white"}`}
              >
                {statusMeta(active.status).label}
              </span>
              <button
                type="button"
                onClick={() => setShowInfo((v) => !v)}
                aria-label="Visitor info"
                aria-pressed={showInfo}
                className="rounded-full p-1.5 text-white/90 hover:bg-white/10 xl:hidden"
              >
                <Info className="size-5" />
              </button>
            </header>
            <div className="relative flex min-h-0 flex-1 flex-col">
              <ChatThread session={active} />
              <ReplyComposer sessionId={active.sessionId} />
              {showInfo && (
                <div className="absolute inset-y-0 right-0 z-10 w-full max-w-xs border-l border-[#e0d6c8] shadow-xl xl:hidden">
                  <VisitorPanel session={active} onClose={() => setShowInfo(false)} />
                </div>
              )}
            </div>
          </>
        )}
      </section>

      {/* Visitor info (wide screens) */}
      <aside className="hidden min-h-0 border-l border-[#e0d6c8] xl:block">
        {active ? <VisitorPanel session={active} /> : <div className="h-full bg-white" />}
      </aside>
    </div>
  );
}
