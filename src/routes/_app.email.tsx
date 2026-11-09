import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { canAct, useMe } from "@/hooks/use-me";
import { ComposeWindow } from "@/components/email/ComposeWindow";
import { ComposePill, MailRail, MailTabs } from "@/components/email/MailRail";
import { FilterChips, GmailSearch, ThreadList } from "@/components/email/ThreadList";
import { ThreadView } from "@/components/email/ThreadView";
import {
  MAILBOXES,
  PAGE_SIZE,
  dedupeByThreadId,
  matchesChip,
  matchesMailbox,
  type ChipKey,
  type GmailThreadSummary,
  type MailboxKey,
} from "@/components/email/types";

export const Route = createFileRoute("/_app/email")({
  component: EmailTab,
});

interface GmailThreadsResponse {
  threads: GmailThreadSummary[];
  nextPageToken: string | null;
}

class GmailListError extends Error {
  constructor(
    message: string,
    readonly retryable: boolean,
  ) {
    super(message);
  }
}

// Same request/pageToken contract as before the redesign: 40 per Gmail page,
// first page auto-refreshes every 60s, older pages are fetched on demand.
function useGmailThreads(pageToken: string | null) {
  return useQuery({
    queryKey: ["gmail-threads", pageToken],
    queryFn: async () => {
      const response = await fetch(
        `/api/gmail-threads?maxResults=40${pageToken ? `&pageToken=${pageToken}` : ""}`,
      );
      if (!response.ok) {
        const failure = (await response.json().catch(() => null)) as {
          code?: string;
          error?: string;
        } | null;
        if (failure?.code?.startsWith("gmail_") && typeof failure.error === "string") {
          throw new GmailListError(failure.error, false);
        }
        if (response.status === 401) {
          throw new GmailListError(
            "Your session has expired. Sign in again to load your email.",
            false,
          );
        }
        throw new GmailListError("Couldn't reach Gmail. Please refresh to try again.", true);
      }
      const data = await response.json();
      return {
        threads: (data.threads ?? []) as GmailThreadSummary[],
        nextPageToken: (data.nextPageToken ?? null) as string | null,
      } as GmailThreadsResponse;
    },
    retry: (count, error) => !(error instanceof GmailListError && !error.retryable) && count < 2,
    refetchInterval: (query) =>
      query.state.error instanceof GmailListError && !query.state.error.retryable
        ? false
        : pageToken === null
          ? 60000
          : false,
  });
}

function EmailTab() {
  const queryClient = useQueryClient();
  const { data: me } = useMe();
  const canManage = canAct(me?.user?.role, "agent");
  const hiddenIds = useRef(new Set<string>());
  const [pageToken, setPageToken] = useState<string | null>(null);
  const [allThreads, setAllThreads] = useState<GmailThreadSummary[]>([]);
  const [nextPageToken, setNextPageToken] = useState<string | null>(null);
  const { data, isLoading, isFetching, error, refetch } = useGmailThreads(pageToken);

  useEffect(() => {
    if (!data) return;
    setAllThreads((prev) =>
      dedupeByThreadId([...prev, ...data.threads]).filter(
        (t) => !hiddenIds.current.has(t.threadId),
      ),
    );
    setNextPageToken(data.nextPageToken);
  }, [data]);

  const [mailbox, setMailbox] = useState<MailboxKey>("inbox");
  const [chips, setChips] = useState<Set<ChipKey>>(new Set());
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(0);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [checked, setChecked] = useState<Set<string>>(new Set());
  const [composeOpen, setComposeOpen] = useState(false);
  const searchRef = useRef<HTMLInputElement>(null);

  const refreshMailbox = () => {
    setPageToken(null);
    setPage(0);
    void queryClient.invalidateQueries({ queryKey: ["gmail-threads"] });
  };

  const trashMutation = useMutation({
    mutationFn: async ({
      threadIds,
      restore = false,
    }: {
      threadIds: string[];
      restore?: boolean;
      snapshot?: GmailThreadSummary[];
    }) => {
      const response = await fetch("/api/gmail-trash", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ threadIds, restore }),
      });
      const result = await response.json();
      if (!result.data?.moved?.length)
        throw new Error(result.error ?? "Couldn't update Gmail Trash.");
      return result.data as { moved: string[]; failed: string[] };
    },
    onSuccess: ({ moved, failed }, { restore, snapshot }) => {
      const ids = new Set(moved);
      if (restore) {
        moved.forEach((id) => hiddenIds.current.delete(id));
        setAllThreads((prev) =>
          dedupeByThreadId([...prev, ...(snapshot ?? []).filter((t) => ids.has(t.threadId))]),
        );
        toast.success("Conversations restored");
      } else {
        const removed = allThreads.filter((t) => ids.has(t.threadId));
        moved.forEach((id) => hiddenIds.current.add(id));
        setAllThreads((prev) => prev.filter((t) => !ids.has(t.threadId)));
        setChecked((prev) => new Set([...prev].filter((id) => !ids.has(id))));
        if (selectedId && ids.has(selectedId)) setSelectedId(null);
        queryClient.setQueriesData<GmailThreadsResponse>({ queryKey: ["gmail-threads"] }, (old) =>
          old ? { ...old, threads: old.threads.filter((t) => !ids.has(t.threadId)) } : old,
        );
        toast.success(
          `${moved.length} conversation${moved.length === 1 ? "" : "s"} moved to Trash`,
          {
            duration: 10000,
            action: {
              label: "Undo",
              onClick: () =>
                trashMutation.mutate({ threadIds: moved, restore: true, snapshot: removed }),
            },
          },
        );
      }
      if (failed.length)
        toast.error(`${failed.length} conversation(s) could not be updated. Please retry.`);
      refreshMailbox();
    },
    onError: (error) => toast.error(error.message),
  });

  const flagMutation = useMutation({
    mutationFn: async ({ threadId, flagged }: { threadId: string; flagged: boolean }) => {
      const res = await fetch("/api/gmail-flag", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ threadId, flagged }),
      });
      if (!res.ok) throw new Error("flag failed");
      return res.json();
    },
    onMutate: ({ threadId, flagged }) => {
      setAllThreads((prev) =>
        prev.map((t) => (t.threadId === threadId ? { ...t, isFlagged: flagged } : t)),
      );
    },
    onError: (_e, { threadId, flagged }) => {
      setAllThreads((prev) =>
        prev.map((t) => (t.threadId === threadId ? { ...t, isFlagged: !flagged } : t)),
      );
      toast.error("Couldn't update star in Gmail");
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["gmail-threads"] }),
  });
  const toggleStar = (t: GmailThreadSummary) =>
    flagMutation.mutate({ threadId: t.threadId, flagged: !t.isFlagged });

  const counts = useMemo(() => {
    const c = {} as Record<MailboxKey, number>;
    for (const { key } of MAILBOXES)
      c[key] = allThreads.filter((t) => matchesMailbox(t, key)).length;
    return c;
  }, [allThreads]);
  const unread = useMemo(() => allThreads.filter((t) => t.isUnread).length, [allThreads]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return allThreads
      .filter((t) => matchesMailbox(t, mailbox))
      .filter((t) => [...chips].every((c) => matchesChip(t, c)))
      .filter((t) => !q || [t.subject, t.from, t.to, t.snippet].join(" ").toLowerCase().includes(q))
      .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  }, [allThreads, mailbox, chips, search]);

  useEffect(() => {
    setPage(0);
    setChecked(new Set());
  }, [mailbox, chips, search]);

  const pageThreads = filtered.slice(page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE);
  const hasMoreLoaded = (page + 1) * PAGE_SIZE < filtered.length;
  const canNext = hasMoreLoaded || !!nextPageToken;
  const totalLabel = nextPageToken ? "many" : String(filtered.length);

  const goNext = () => {
    if (!hasMoreLoaded && nextPageToken) setPageToken(nextPageToken);
    setPage((p) => p + 1);
  };

  const selected = allThreads.find((t) => t.threadId === selectedId) ?? null;

  // Gmail-ish shortcuts: "/" search, j/k move, Enter open, Escape/u back to list, c compose.
  const [cursor, setCursor] = useState(0);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement;
      if (el.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(el.tagName)) return;
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      if (e.key === "/") {
        e.preventDefault();
        searchRef.current?.focus();
      } else if (e.key === "c") {
        setComposeOpen(true);
      } else if ((e.key === "Escape" || e.key === "u") && selectedId) {
        setSelectedId(null);
      } else if (!selectedId && (e.key === "j" || e.key === "k")) {
        setCursor((c) =>
          Math.max(0, Math.min(pageThreads.length - 1, c + (e.key === "j" ? 1 : -1))),
        );
      } else if (!selectedId && e.key === "Enter" && pageThreads[cursor]) {
        setSelectedId(pageThreads[cursor].threadId);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [selectedId, pageThreads, cursor]);

  const listError = error
    ? error instanceof GmailListError
      ? error.message
      : allThreads.length
        ? "Failed to load more emails — try again."
        : "Couldn't reach Gmail. Check the connection and refresh."
    : null;

  return (
    <div
      data-channel="email"
      className="h-full min-h-0 flex flex-col bg-[var(--ch-app-bg)] text-[var(--ch-text)]"
    >
      <header className="flex items-center gap-3 px-3 md:pl-6 md:pr-4 py-2 shrink-0">
        <span
          className="hidden md:flex items-center gap-2 w-[224px] shrink-0 text-[22px] text-[var(--ch-text-2)]"
          aria-hidden
        >
          <svg viewBox="0 0 48 36" className="h-6 w-8">
            <path fill="#4285F4" d="M3 36h8V17L0 9v24c0 1.7 1.3 3 3 3z" />
            <path fill="#34A853" d="M37 36h8c1.7 0 3-1.3 3-3V9l-11 8z" />
            <path fill="#FBBC04" d="M37 3v14l11-8V5c0-3.7-4.2-5.8-7.2-3.6z" />
            <path fill="#EA4335" d="M11 17V3l13 9.8L37 3v14L24 26.8z" />
            <path fill="#C5221F" d="M0 5v4l11 8V3L7.2 1.4C4.2-.8 0 1.3 0 5z" />
          </svg>
          Mail
        </span>
        <GmailSearch ref={searchRef} value={search} onChange={setSearch} />
      </header>

      <div className="flex flex-1 min-h-0">
        <div className="hidden md:block">
          <MailRail
            active={mailbox}
            counts={counts}
            unread={unread}
            onSelect={(k) => {
              setMailbox(k);
              setSelectedId(null);
            }}
            onCompose={() => setComposeOpen(true)}
          />
        </div>

        <main className="flex-1 min-w-0 flex flex-col bg-[var(--ch-panel)] md:rounded-2xl md:mr-4 md:mb-4 overflow-hidden">
          {selected ? (
            <ThreadView
              thread={selected}
              onBack={() => setSelectedId(null)}
              onToggleStar={toggleStar}
              onDelete={() => trashMutation.mutate({ threadIds: [selected.threadId] })}
              deleteDisabled={!canManage || trashMutation.isPending}
              onSent={refreshMailbox}
            />
          ) : (
            <>
              <div className="pt-2 md:hidden">
                <MailTabs active={mailbox} counts={counts} onSelect={setMailbox} />
              </div>
              <FilterChips
                active={chips}
                onToggle={(k) =>
                  setChips((prev) => {
                    const next = new Set(prev);
                    if (next.has(k)) next.delete(k);
                    else next.add(k);
                    return next;
                  })
                }
              />
              <ThreadList
                threads={pageThreads}
                rangeStart={page * PAGE_SIZE}
                totalLabel={totalLabel}
                canPrev={page > 0}
                canNext={canNext}
                onPrev={() => setPage((p) => Math.max(0, p - 1))}
                onNext={goNext}
                loading={
                  (isLoading && allThreads.length === 0) ||
                  (isFetching && pageThreads.length === 0 && !!pageToken)
                }
                fetching={isFetching}
                error={listError}
                onRefresh={() => refetch()}
                selectedId={pageThreads[cursor]?.threadId ?? null}
                checked={checked}
                onToggleCheck={(id) =>
                  setChecked((prev) => {
                    const next = new Set(prev);
                    if (next.has(id)) next.delete(id);
                    else next.add(id);
                    return next;
                  })
                }
                onToggleAll={() =>
                  setChecked((prev) =>
                    pageThreads.every((t) => prev.has(t.threadId))
                      ? new Set()
                      : new Set(pageThreads.map((t) => t.threadId)),
                  )
                }
                onOpen={(t) => setSelectedId(t.threadId)}
                onStar={toggleStar}
                onDelete={(threadIds) => trashMutation.mutate({ threadIds })}
                deleteDisabled={!canManage || trashMutation.isPending}
              />
            </>
          )}
        </main>
      </div>

      {!composeOpen && (
        <div className="md:hidden fixed right-4 bottom-20 z-30">
          <ComposePill compact onClick={() => setComposeOpen(true)} />
        </div>
      )}
      {composeOpen && (
        <ComposeWindow
          onClose={() => setComposeOpen(false)}
          onSent={() => {
            setMailbox("sent");
            refreshMailbox();
          }}
        />
      )}
    </div>
  );
}
