import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { ChevronDown, ChevronUp } from "lucide-react";

export const Route = createFileRoute("/_app/calls")({
  component: CallsTab,
});

interface VapiCall {
  id: string;
  createdAt: string;
  startedAt?: string;
  endedAt?: string;
  endedReason?: string;
  status?: string;
  recordingUrl?: string;
  customer?: { number?: string; name?: string };
  analysis?: { summary?: string; successEvaluation?: string };
  artifact?: { transcript?: string; recordingUrl?: string; videoRecordingUrl?: string };
  assistant?: { name?: string };
  phoneNumberId?: string;
  type?: string;
}

function fmtDuration(start?: string, end?: string) {
  if (!start || !end) return "—";
  const s = (new Date(end).getTime() - new Date(start).getTime()) / 1000;
  if (!Number.isFinite(s) || s < 0) return "—";
  const m = Math.floor(s / 60);
  const sec = Math.floor(s % 60);
  return `${m}m ${sec}s`;
}

function statusBadge(call: VapiCall) {
  const r = (call.endedReason ?? "").toLowerCase();
  if (r.includes("no-answer") || r.includes("noanswer") || r.includes("busy")) return { label: "No Answer", bg: "#9CA3AF" };
  if (r.includes("transfer")) return { label: "Transferred", bg: "#86000B" };
  return { label: "Answered", bg: "#33673B" };
}

const PAGE_SIZE = 100;

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
      const json = await r.json();
      const calls = Array.isArray(json) ? json : (json.data ?? json.calls ?? []);
      return calls as VapiCall[];
    },
    refetchInterval: cursor === null ? 60000 : false,
  });
}

function dedupeById(calls: VapiCall[]): VapiCall[] {
  const map = new Map<string, VapiCall>();
  for (const c of calls) map.set(c.id, c);
  return Array.from(map.values());
}

function CallsTab() {
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
  const [selId, setSelId] = useState<string | null>(null);
  const [showTranscript, setShowTranscript] = useState(false);

  const calls = useMemo(() => {
    const sorted = [...allCalls].sort((a, b) => (b.createdAt ?? "").localeCompare(a.createdAt ?? ""));
    const q = search.toLowerCase().trim();
    if (!q) return sorted;
    return sorted.filter((c) =>
      (c.customer?.number ?? "").toLowerCase().includes(q) ||
      (c.id ?? "").toLowerCase().includes(q) ||
      (c.status ?? "").toLowerCase().includes(q),
    );
  }, [allCalls, search]);

  const sel = calls.find((c) => c.id === selId) ?? null;

  const oldestCreatedAt = useMemo(
    () => allCalls.reduce<string | null>((min, c) => (c.createdAt && (!min || c.createdAt < min) ? c.createdAt : min), null),
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
    <div className="bg-white rounded-xl shadow-sm overflow-hidden grid grid-cols-1 md:grid-cols-[35%_65%]" style={{ height: "calc(100vh - 7rem - 1rem)" }}>
      <div className="border-r flex flex-col min-h-0" style={{ backgroundColor: "#FFEBCE" }}>
        <div className="p-3 border-b shrink-0">
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search by phone…"
            className="w-full px-3 py-2 text-sm rounded-md border border-gray-300 bg-white focus:outline-none" />
        </div>
        <div className="overflow-y-auto flex-1">
          {isLoading && <div className="p-4 text-sm text-gray-500">Loading…</div>}
          {error && allCalls.length === 0 && (
            <div className="p-4 text-sm text-red-600">
              Error loading calls. Check Vapi API key and server route.
              <br />
              <button onClick={() => refetch()} className="underline mt-1">Retry</button>
            </div>
          )}
          {!isLoading && !error && calls.length === 0 && (
            <div className="p-4 text-sm text-gray-500">No calls found.</div>
          )}
          {calls.map((c) => {
            const s = selId === c.id;
            const b = statusBadge(c);
            const displayName = c.customer?.number ?? c.customer?.name ?? "Unknown Caller";
            return (
              <button key={c.id} onClick={() => { setSelId(c.id); setShowTranscript(false); }}
                className="w-full text-left px-4 py-3 border-b hover:bg-white"
                style={{ backgroundColor: s ? "#FFFFFF" : "transparent", borderLeft: s ? "3px solid #86000B" : "3px solid transparent" }}>
                <div className="flex items-baseline gap-2">
                  <div className="font-bold text-sm truncate flex-1" style={{ color: "#1B2419" }}>
                    {displayName}
                  </div>
                  <span className="text-[10px] px-1.5 py-0.5 rounded-full text-white font-semibold" style={{ backgroundColor: b.bg }}>
                    {b.label}
                  </span>
                </div>
                <div className="text-xs text-gray-600 mt-0.5">
                  {fmtDuration(c.startedAt, c.endedAt)} · {(c.createdAt ?? "").slice(0, 16).replace("T", " ")}
                </div>
                {c.endedReason && <div className="text-[10px] text-gray-400 mt-0.5">{c.endedReason}</div>}
              </button>
            );
          })}
          {hasMore && !isLoading && (
            <div className="p-3 space-y-1.5">
              {error && allCalls.length > 0 && (
                <div className="text-xs text-red-600 text-center">
                  Failed to load more calls — try again.
                </div>
              )}
              <button
                onClick={loadMore}
                disabled={isFetching}
                className="w-full py-2 text-xs font-semibold rounded-md transition-colors disabled:opacity-50"
                style={{ backgroundColor: "#FFFFFF", border: "1px solid #e0d6c8", color: "#86000B" }}
              >
                {isFetching ? "Loading…" : "Load more calls"}
              </button>
            </div>
          )}
        </div>
      </div>

      <div className="relative overflow-hidden">
        <div className="overflow-y-auto bg-white absolute inset-0">
        {!sel ? (
          <div className="h-full flex items-center justify-center text-gray-400 text-sm">Select a call to view</div>
        ) : (
          <div>
            <div className="px-6 py-4 border-b-2" style={{ borderColor: "#86000B" }}>
              <div className="text-lg font-bold" style={{ color: "#1B2419" }}>{sel.customer?.number ?? sel.customer?.name ?? "Unknown Caller"}</div>
              <div className="text-xs text-gray-600 mt-1">
                {(sel.createdAt ?? "").replace("T", " ").slice(0, 19)} · {fmtDuration(sel.startedAt, sel.endedAt)} · Assistant: {sel.assistant?.name ?? "Maara dulce"}
              </div>
            </div>

            <div className="p-6 space-y-6">
              <div>
                <div className="text-xs font-semibold uppercase tracking-wide mb-2 text-gray-500">Recording</div>
                <RecordingPlayer callId={sel.id} />
              </div>

              <div>
                <div className="text-xs font-semibold uppercase tracking-wide mb-2 text-gray-500">Call Summary</div>
                <div className="bg-amber-50 border border-amber-100 rounded-md p-4 text-sm leading-relaxed" style={{ color: "#1B2419" }}>
                  {sel.analysis?.summary ?? "No summary generated."}
                </div>
              </div>

              <div>
                <button
                  onClick={() => setShowTranscript((v) => !v)}
                  className="text-xs font-semibold uppercase tracking-wide mb-2 text-gray-500 flex items-center gap-1.5 hover:text-gray-700"
                >
                  Full Transcript {showTranscript ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                </button>
                {showTranscript && (
                  <pre className="bg-gray-50 border border-gray-200 rounded-md p-4 text-xs whitespace-pre-wrap font-sans max-h-96 overflow-y-auto" style={{ color: "#1B2419" }}>
                    {sel.artifact?.transcript ?? "No transcript available."}
                  </pre>
                )}
              </div>

              <div className="grid grid-cols-2 gap-4 pt-4 border-t text-xs">
                <Meta label="Started" value={sel.startedAt?.replace("T", " ").slice(0, 19) ?? "—"} />
                <Meta label="Ended" value={sel.endedAt?.replace("T", " ").slice(0, 19) ?? "—"} />
                <Meta label="Duration" value={fmtDuration(sel.startedAt, sel.endedAt)} />
                <Meta label="Ended Reason" value={sel.endedReason ?? "—"} />
              </div>
            </div>
          </div>
        )}
        </div>
      </div>
    </div>
  );
}

function RecordingPlayer({ callId }: { callId: string }) {
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    setFailed(false);
  }, [callId]);

  if (failed) {
    return <div className="text-sm text-gray-400">No recording available.</div>;
  }

  return (
    <audio
      controls
      src={`/api/vapi-recording?callId=${callId}&type=stereo`}
      className="w-full"
      style={{ accentColor: "#86000B" }}
      onError={() => setFailed(true)}
    />
  );
}

function Meta({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-gray-500 uppercase text-[10px] tracking-wide font-semibold">{label}</div>
      <div className="mt-0.5" style={{ color: "#1B2419" }}>{value}</div>
    </div>
  );
}
