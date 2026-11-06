import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { PhoneOff, Search } from "lucide-react";
import { ChannelGlyph } from "@/components/shared";
import { CallCard } from "@/components/calls/call-card";
import { CallDetail } from "@/components/calls/call-detail";
import { LiveCallBanner } from "@/components/calls/live-call-banner";
import {
  callLead,
  callOutcome,
  toCallArray,
  type Outcome,
  type VapiCall,
} from "@/components/calls/vapi";

export const Route = createFileRoute("/_app/calls")({
  validateSearch: (s: Record<string, unknown>): { id?: string } =>
    typeof s.id === "string" && s.id ? { id: s.id } : {},
  component: CallsTab,
});

const PAGE_SIZE = 100;

// Vapi pagination: first page (cursor=null) refreshes every 60s; older pages are fetched with createdAtLt=<oldest createdAt>.
function useVapiCalls(cursor: string | null) {
  return useQuery({
    queryKey: ["vapi-calls", cursor],
    queryFn: async () => {
      const params = new URLSearchParams({ limit: String(PAGE_SIZE) });
      if (cursor) params.set("createdAtLt", cursor);
      const r = await fetch(`/api/vapi-calls?${params.toString()}`);
      if (!r.ok) {
        const errText = await r.text();
        console.error("Vapi error:", errText);
        throw new Error("vapi");
      }
      return toCallArray(await r.json());
    },
    refetchInterval: cursor === null ? 60000 : false,
  });
}

function dedupeById(calls: VapiCall[]): VapiCall[] {
  const map = new Map<string, VapiCall>();
  for (const c of calls) map.set(c.id, c);
  return Array.from(map.values());
}

const FILTERS: ("All" | Outcome)[] = [
  "All",
  "Answered",
  "No Answer",
  "Transferred",
  "Voicemail",
  "Failed",
];

function CallsTab() {
  const { id: selId } = Route.useSearch();
  const navigate = Route.useNavigate();
  const setSelId = (id: string | null) => navigate({ search: id ? { id } : {}, replace: false });

  const [cursor, setCursor] = useState<string | null>(null);
  const [allCalls, setAllCalls] = useState<VapiCall[]>([]);
  const [hasMore, setHasMore] = useState(true);

  const { data, isLoading, isFetching, error, refetch } = useVapiCalls(cursor);

  useEffect(() => {
    if (!data) return;
    setAllCalls((prev) => dedupeById([...prev, ...data]));
    setHasMore(data.length >= PAGE_SIZE);
  }, [data]);

  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<(typeof FILTERS)[number]>("All");

  const calls = useMemo(() => {
    const sorted = [...allCalls].sort((a, b) =>
      (b.createdAt ?? "").localeCompare(a.createdAt ?? ""),
    );
    const q = search.toLowerCase().trim();
    return sorted.filter((c) => {
      if (filter !== "All" && callOutcome(c) !== filter) return false;
      if (!q) return true;
      const l = callLead(c);
      return [c.customer?.number, c.id, c.status, l.companyName, l.leadName].some((v) =>
        (v ?? "").toLowerCase().includes(q),
      );
    });
  }, [allCalls, search, filter]);

  const sel = selId ? (allCalls.find((c) => c.id === selId) ?? null) : null;

  const oldestCreatedAt = useMemo(
    () =>
      allCalls.reduce<string | null>(
        (min, c) => (c.createdAt && (!min || c.createdAt < min) ? c.createdAt : min),
        null,
      ),
    [allCalls],
  );

  const loadMore = () => {
    if (!hasMore || !oldestCreatedAt) return;
    if (oldestCreatedAt === cursor) {
      refetch();
    } else {
      setCursor(oldestCreatedAt);
    }
  };

  return (
    <div
      data-channel="voice"
      className="flex h-[calc(100dvh-7rem)] min-h-[480px] flex-col overflow-hidden rounded-2xl bg-[var(--ch-app-bg)] text-[var(--ch-text)] shadow-sm ring-1 ring-black/10"
    >
      <LiveCallBanner onOpen={(id) => setSelId(id)} />
      <div className="grid min-h-0 flex-1 grid-cols-1 md:grid-cols-[minmax(300px,36%)_1fr]">
        {/* List */}
        <aside
          className={`min-h-0 flex-col border-r border-white/5 bg-[var(--ch-panel)] ${sel ? "hidden md:flex" : "flex"}`}
        >
          <div className="shrink-0 space-y-3 p-3">
            <div className="flex items-center gap-2">
              <ChannelGlyph channel="voice" size={22} />
              <h1 className="text-base font-semibold">Calls</h1>
              <span className="text-xs text-[var(--ch-text-2)]">Mara · Voice</span>
              <span className="ml-auto font-mono text-xs text-[var(--ch-text-2)]">
                {allCalls.length}
              </span>
            </div>
            <label className="flex items-center gap-2 rounded-full bg-black/30 px-3 py-2 ring-1 ring-white/5 focus-within:ring-orange-500/50">
              <Search className="size-4 text-[var(--ch-text-2)]" />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search company, lead or number…"
                aria-label="Search calls"
                className="w-full bg-transparent text-sm text-[var(--ch-text)] placeholder:text-[var(--ch-text-2)] focus:outline-none"
              />
            </label>
            <div className="-mx-1 flex gap-1.5 overflow-x-auto px-1 pb-0.5">
              {FILTERS.map((f) => (
                <button
                  key={f}
                  type="button"
                  onClick={() => setFilter(f)}
                  aria-pressed={filter === f}
                  className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-medium transition-colors motion-reduce:transition-none ${
                    filter === f
                      ? "bg-[var(--ch)] text-white"
                      : "bg-white/5 text-[var(--ch-text-2)] hover:bg-white/10"
                  }`}
                >
                  {f}
                </button>
              ))}
            </div>
          </div>
          <div className="min-h-0 flex-1 space-y-1.5 overflow-y-auto px-3 pb-3">
            {isLoading &&
              Array.from({ length: 6 }).map((_, i) => (
                <div
                  key={i}
                  className="h-[76px] animate-pulse rounded-xl bg-white/5 motion-reduce:animate-none"
                />
              ))}
            {error && allCalls.length === 0 && (
              <div className="rounded-xl bg-red-500/10 p-3 text-sm text-red-300">
                Error loading calls. Check Vapi API key and server route.
                <button type="button" onClick={() => refetch()} className="ml-1 underline">
                  Retry
                </button>
              </div>
            )}
            {!isLoading && !error && calls.length === 0 && (
              <div className="flex flex-col items-center gap-2 py-10 text-sm text-[var(--ch-text-2)]">
                <PhoneOff className="size-6" /> No calls found.
              </div>
            )}
            {calls.map((c) => (
              <CallCard
                key={c.id}
                call={c}
                selected={selId === c.id}
                onSelect={() => setSelId(c.id)}
              />
            ))}
            {hasMore && !isLoading && (
              <div className="space-y-1.5 pt-1.5">
                {error && allCalls.length > 0 && (
                  <div className="text-center text-xs text-red-300">
                    Failed to load more calls — try again.
                  </div>
                )}
                <button
                  type="button"
                  onClick={loadMore}
                  disabled={isFetching}
                  className="w-full rounded-full border border-white/10 py-2 text-xs font-semibold text-[var(--ch)] hover:bg-white/5 disabled:opacity-50"
                >
                  {isFetching ? "Loading…" : "Load more calls"}
                </button>
              </div>
            )}
          </div>
        </aside>

        {/* Detail */}
        <section className={`min-h-0 ${sel ? "block" : "hidden md:block"}`}>
          {sel ? (
            <CallDetail key={sel.id} call={sel} onBack={() => setSelId(null)} />
          ) : (
            <div className="flex h-full flex-col items-center justify-center gap-3 p-6 text-center text-[var(--ch-text-2)]">
              <div className="grid size-16 place-items-center rounded-full bg-white/5">
                <ChannelGlyph channel="voice" size={28} />
              </div>
              <div className="text-sm">
                {selId && !isLoading
                  ? "That call isn't in the loaded pages yet — try “Load more calls”."
                  : "Select a call to hear the recording and read the transcript."}
              </div>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
