import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { RefreshCw } from "lucide-react";

export const Route = createFileRoute("/_app/email")({
  component: EmailTab,
});

interface GmailThreadSummary {
  threadId: string;
  subject: string;
  from: string;
  to: string;
  date: string;
  direction: "inbound" | "outbound";
  snippet: string;
  messageCount: number;
  isUnread: boolean;
}

interface GmailMessage {
  id: string;
  from: string;
  to: string;
  subject: string;
  date: string;
  direction: "inbound" | "outbound";
  htmlBody: string;
  snippet: string;
}

function formatTs(ts: string): string {
  if (!ts) return "";
  try {
    return new Date(ts).toLocaleString("en-PH", {
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return ts;
  }
}

function parseSender(raw: string): { name: string; email: string } {
  const match = raw.match(/^\s*"?([^"<]*)"?\s*<([^>]+)>\s*$/);
  if (match) return { name: match[1].trim(), email: match[2].trim() };
  const emailMatch = raw.match(/[\w.+-]+@[\w.-]+\.[A-Za-z]{2,}/);
  return { name: "", email: emailMatch?.[0] ?? raw.trim() };
}

function useGmailThreads() {
  return useQuery({
    queryKey: ["gmail-threads"],
    queryFn: async () => {
      const response = await fetch("/api/gmail-threads?maxResults=40");
      if (!response.ok) throw new Error("Gmail thread list failed");
      const data = await response.json();
      return (data.threads ?? []) as GmailThreadSummary[];
    },
    refetchInterval: 60000,
  });
}

function EmailTab() {
  const { data, isLoading, error, refetch } = useGmailThreads();
  const [search, setSearch] = useState("");
  const [selectedThreadId, setSelectedThreadId] = useState<string | null>(null);
  const [thread, setThread] = useState<GmailMessage[]>([]);
  const [threadLoading, setThreadLoading] = useState(false);
  const [threadError, setThreadError] = useState<string | null>(null);

  const threads = useMemo(() => {
    const query = search.toLowerCase();
    if (!query) return data ?? [];
    return (data ?? []).filter((item) =>
      [item.subject, item.from, item.to, item.snippet].join(" ").toLowerCase().includes(query),
    );
  }, [data, search]);

  const selected = threads.find((item) => item.threadId === selectedThreadId) ?? null;

  useEffect(() => {
    if (!selectedThreadId) {
      setThread([]);
      setThreadError(null);
      return;
    }

    setThreadLoading(true);
    setThread([]);
    setThreadError(null);

    fetch(`/api/gmail-thread?id=${encodeURIComponent(selectedThreadId)}`)
      .then((response) => response.json())
      .then((result) => {
        if (result.messages && result.messages.length > 0) {
          setThread(result.messages);
        } else {
          setThreadError("No messages found in this Gmail thread.");
        }
      })
      .catch(() => setThreadError("Failed to load thread from Gmail."))
      .finally(() => setThreadLoading(false));
  }, [selectedThreadId]);

  return (
    <div
      className="bg-white rounded-xl shadow-sm overflow-hidden grid grid-cols-1 md:grid-cols-[35%_65%]"
      style={{ height: "calc(100vh - 7rem - 1rem)" }}
    >
      <div className="border-r flex flex-col overflow-hidden" style={{ backgroundColor: "#FFEBCE" }}>
        <div className="px-4 py-3 border-b flex items-center justify-between">
          <div className="font-black text-lg" style={{ color: "#86000B" }}>
            Gmail Inbox
          </div>
          <button
            onClick={() => refetch()}
            className="p-1.5 rounded-md hover:bg-white text-gray-400 hover:text-gray-600 transition-colors"
            title="Refresh Gmail inbox"
          >
            <RefreshCw className="w-4 h-4" />
          </button>
        </div>
        <div className="p-3 border-b">
          <input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search emails…"
            className="w-full px-3 py-2 text-sm rounded-md border border-gray-300 bg-white focus:outline-none"
          />
        </div>
        <div className="overflow-y-auto flex-1">
          {isLoading && <div className="p-4 text-sm text-gray-500">Loading…</div>}
          {error && <div className="p-4 text-sm text-red-600">Failed to load Gmail threads.</div>}
          {!isLoading && !error && threads.length === 0 && (
            <div className="p-4 text-sm text-gray-500">No emails found.</div>
          )}
          {threads.map((item) => {
            const sender = parseSender(item.direction === "outbound" ? item.to : item.from);
            const isSelected = selectedThreadId === item.threadId;
            return (
              <button
                key={item.threadId}
                onClick={() => setSelectedThreadId(item.threadId)}
                className="w-full text-left px-4 py-3 border-b transition-colors hover:bg-white"
                style={{
                  backgroundColor: isSelected ? "#FFFFFF" : "transparent",
                  borderLeft: isSelected ? "3px solid #86000B" : "3px solid transparent",
                }}
              >
                <div className="flex items-center gap-2">
                  {item.isUnread && <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: "#86000B" }} />}
                  <div className="font-bold text-sm truncate flex-1" style={{ color: "#1B2419" }}>
                    {item.subject || "(no subject)"}
                  </div>
                  <div className="text-[10px] text-gray-400 shrink-0">{formatTs(item.date)}</div>
                </div>
                <div className="text-xs text-gray-600 truncate mt-0.5">
                  {sender.name ? `${sender.name} <${sender.email}>` : sender.email}
                </div>
                <div className="text-[11px] text-gray-500 truncate mt-0.5">{item.snippet}</div>
              </button>
            );
          })}
        </div>
      </div>

      <div className="relative overflow-hidden">
        <div className="overflow-y-auto bg-white absolute inset-0">
          {!selected ? (
            <div className="h-full flex items-center justify-center text-gray-400 text-sm">
              Select an email to view
            </div>
          ) : (
            <div className="p-6 max-w-3xl">
              <div className="flex items-start justify-between gap-3 mb-5">
                <div>
                  <h2 className="text-lg font-bold leading-snug" style={{ color: "#1B2419" }}>
                    {selected.subject || "(no subject)"}
                  </h2>
                  <div className="text-xs text-gray-500 mt-1">
                    {selected.messageCount} {selected.messageCount === 1 ? "message" : "messages"} in thread
                  </div>
                </div>
                <button
                  onClick={() => setSelectedThreadId(selected.threadId)}
                  className="shrink-0 p-1.5 rounded-md hover:bg-gray-100 text-gray-400 hover:text-gray-600 transition-colors"
                  title="Refresh thread"
                >
                  <RefreshCw className="w-4 h-4" />
                </button>
              </div>

              {threadLoading && (
                <div className="py-8 text-center text-sm" style={{ color: "#86000B" }}>
                  Loading conversation from Gmail…
                </div>
              )}
              {threadError && !threadLoading && (
                <div
                  className="rounded-lg p-4 text-[13px]"
                  style={{ backgroundColor: "#fff5f5", border: "1px solid #fcc", color: "#c00" }}
                >
                  {threadError}
                </div>
              )}
              {!threadLoading && thread.length > 0 && (
                <div className="space-y-4">
                  {thread.map((message) => {
                    const sender = parseSender(message.from);
                    return (
                      <div
                        key={message.id}
                        className="rounded-lg p-4"
                        style={{
                          border: "1px solid #e0d6c8",
                          backgroundColor: message.direction === "outbound" ? "#ffffff" : "#f9f5ef",
                        }}
                      >
                        <div className="text-[11px] text-gray-500 mb-2 flex justify-between gap-3">
                          <span className="font-semibold truncate" style={{ color: message.direction === "outbound" ? "#86000B" : "#1B2419" }}>
                            {message.direction === "outbound"
                              ? "Martin Reyes (Rare Global Food)"
                              : sender.name || sender.email}
                          </span>
                          <span className="shrink-0">{formatTs(message.date)}</span>
                        </div>
                        <div dangerouslySetInnerHTML={{ __html: message.htmlBody }} />
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
