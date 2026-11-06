import {
  Fragment,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { motion, useReducedMotion } from "motion/react";
import { ExternalLink } from "lucide-react";
import { EmptyState } from "@/components/shared";
import { formatManila, type Conversation } from "@/lib/channels";
import { cn } from "@/lib/utils";
import { ChatBubble } from "./ChatBubble";
import { ConversationHeader } from "./ConversationHeader";
import { ConversationList } from "./ConversationList";
import { Composer } from "./Composer";
import { LeadInfoDrawer } from "./LeadInfoDrawer";
import { DateSeparator, SystemPill } from "./SystemPill";
import {
  dayKey,
  dayLabel,
  filterConversations,
  isTypingTarget,
  type ChatFilter,
  type ChatVariant,
} from "./utils";

export interface MessengerLayoutProps {
  variant: ChatVariant;
  title: string;
  conversations: Conversation[];
  connected?: boolean;
  isLoading?: boolean;
  error?: unknown;
  /** Selected phone from the URL (`?phone=`). */
  phone?: string;
  onSelectPhone: (phone: string | undefined) => void;
  headerChips?: (c: Conversation) => ReactNode;
  drawerExtra?: (c: Conversation) => ReactNode;
  composerFootnote?: ReactNode;
  banner?: ReactNode;
  notConnected?: { title: string; description?: string };
}

type ThreadItem =
  | { kind: "date"; key: string; label: string }
  | { kind: "msg"; key: string; index: number; first: boolean; last: boolean; read: boolean }
  | { kind: "system"; key: string; node: ReactNode };

function buildThread(c: Conversation): ThreadItem[] {
  const out: ThreadItem[] = [];
  const msgs = c.messages;
  // index of the last customer message — outgoing messages before it are "read"
  let lastCustomer = -1;
  msgs.forEach((m, i) => {
    if (m.role === "customer") lastCustomer = i;
  });
  // anchor system events after the first Martin message mentioning them, else at the end
  const findAnchor = (re: RegExp) =>
    msgs.findIndex((m) => m.role !== "customer" && re.test(m.content));
  const priceAt = c.priceSent ? findAnchor(/price|pricing|quotation/i) : -2;
  const brochureAt = c.brochureSent ? findAnchor(/brochure|catalog/i) : -2;
  const formAt = c.formSent ? findAnchor(/form/i) : -2;
  const trailing: ThreadItem[] = [];
  const sys = (label: string, at: number, key: string) => {
    if (at === -2) return;
    const item: ThreadItem = { kind: "system", key, node: label };
    if (at === -1) trailing.push(item);
    else anchored.set(at, [...(anchored.get(at) ?? []), item]);
  };
  const anchored = new Map<number, ThreadItem[]>();
  sys("📄 Brochure sent", brochureAt, "sys-brochure");
  sys("💰 Price list sent", priceAt, "sys-price");
  sys("📝 Form sent", formAt, "sys-form");

  let prevDay = "";
  msgs.forEach((m, i) => {
    const d = dayKey(m.ts);
    if (d && d !== prevDay) {
      out.push({ kind: "date", key: `d-${d}-${i}`, label: dayLabel(m.ts) });
      prevDay = d;
    }
    const prev = msgs[i - 1];
    const next = msgs[i + 1];
    const first = !prev || prev.role !== m.role || dayKey(prev.ts) !== d;
    const last = !next || next.role !== m.role || dayKey(next.ts) !== d;
    out.push({
      kind: "msg",
      key: `m-${i}`,
      index: i,
      first,
      last,
      read: m.role !== "customer" && i < lastCustomer,
    });
    out.push(...(anchored.get(i) ?? []));
  });
  out.push(...trailing);
  if (c.meetingScheduled) {
    out.push({
      kind: "system",
      key: "sys-meeting",
      node: (
        <>
          📅 Meeting booked
          {c.meetingDateTime
            ? ` ${formatManila(c.meetingDateTime, { weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}`
            : ""}
          {c.meetingLink && (
            <a
              href={c.meetingLink}
              target="_blank"
              rel="noreferrer"
              className="ml-1 inline-flex items-center gap-0.5 font-medium text-[var(--ch-primary,#008069)] underline"
            >
              Meet <ExternalLink className="size-3" aria-hidden />
            </a>
          )}
        </>
      ),
    });
  }
  if (c.humanEscalated)
    out.push({ kind: "system", key: "sys-esc", node: "⚠️ Escalated to a human sales rep" });
  return out;
}

function Thread({
  conversation: c,
  variant,
}: {
  conversation: Conversation;
  variant: ChatVariant;
}) {
  const reduce = useReducedMotion();
  const scrollRef = useRef<HTMLDivElement>(null);
  const seen = useRef<{ phone: string; count: number }>({ phone: "", count: 0 });
  const animateFrom =
    seen.current.phone === c.phone ? seen.current.count : Number.POSITIVE_INFINITY;
  const items = useMemo(() => buildThread(c), [c]);

  useEffect(() => {
    seen.current = { phone: c.phone, count: c.messages.length };
  }, [c.phone, c.messages.length]);

  useLayoutEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [c.phone, c.messages.length]);

  return (
    <div
      ref={scrollRef}
      className={cn(
        "min-h-0 flex-1 overflow-y-auto pb-4",
        variant === "whatsapp"
          ? "chat-wallpaper bg-[var(--ch-chat-bg,#efeae2)]"
          : "bg-[var(--ch-chat-bg,#fff)]",
      )}
      aria-live="polite"
    >
      {c.messages.length === 0 && <SystemPill variant={variant}>No messages yet</SystemPill>}
      {items.map((it) => {
        if (it.kind === "date")
          return <DateSeparator key={it.key} label={it.label} variant={variant} />;
        if (it.kind === "system")
          return (
            <SystemPill key={it.key} variant={variant}>
              {it.node}
            </SystemPill>
          );
        const isNew = it.index >= animateFrom && !reduce;
        return (
          <motion.div
            key={it.key}
            initial={isNew ? { opacity: 0, y: 8 } : false}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.25 }}
          >
            <ChatBubble
              message={c.messages[it.index]}
              variant={variant}
              firstInGroup={it.first}
              lastInGroup={it.last}
              read={it.read}
            />
          </motion.div>
        );
      })}
    </div>
  );
}

export function MessengerLayout(props: MessengerLayoutProps) {
  const {
    variant,
    title,
    conversations,
    connected = true,
    isLoading,
    error,
    phone,
    onSelectPhone,
    headerChips,
    drawerExtra,
    composerFootnote,
    banner,
    notConnected,
  } = props;
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<ChatFilter>("all");
  const [drawerOpen, setDrawerOpen] = useState(false);
  const searchRef = useRef<HTMLInputElement>(null);

  const list = useMemo(
    () => filterConversations(conversations, search, filter),
    [conversations, search, filter],
  );
  // Deep-linked phone wins even if filtered out of the list; desktop falls back to the first row.
  const selected =
    (phone ? conversations.find((c) => c.phone === phone) : undefined) ??
    (phone ? undefined : list[0]);
  const showDetailOnMobile = !!phone;

  // keyboard: j/k move through list, `/` focuses search
  const stateRef = useRef({ list, selected, onSelectPhone });
  stateRef.current = { list, selected, onSelectPhone };
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      if (isTypingTarget(e.target)) {
        if (e.key === "Escape" && e.target === searchRef.current) searchRef.current?.blur();
        return;
      }
      if (e.key === "/") {
        e.preventDefault();
        searchRef.current?.focus();
        return;
      }
      if (e.key !== "j" && e.key !== "k") return;
      const { list: l, selected: s, onSelectPhone: go } = stateRef.current;
      if (l.length === 0) return;
      const i = s ? l.findIndex((c) => c.phone === s.phone) : -1;
      const next = e.key === "j" ? Math.min(l.length - 1, i + 1) : Math.max(0, i - 1);
      if (l[next]) {
        e.preventDefault();
        go(l[next].phone);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  if (!connected && !isLoading) {
    return (
      <div
        data-channel={variant}
        className="grid h-[calc(100dvh-7rem)] place-items-center rounded-xl border bg-[var(--ch-panel,#fff)] p-6"
      >
        <EmptyState
          title={notConnected?.title ?? `${title} feed not connected`}
          description={notConnected?.description}
        />
      </div>
    );
  }

  return (
    <div
      data-channel={variant}
      className="flex h-[calc(100dvh-7rem)] min-h-[420px] flex-col overflow-hidden rounded-xl border border-[var(--ch-divider,#e9edef)] bg-[var(--ch-app-bg,#fff)] shadow-sm"
    >
      {banner}
      <div className="grid min-h-0 flex-1 grid-cols-1 md:grid-cols-[minmax(300px,30%)_1fr]">
        <aside
          className={cn(
            "min-h-0 border-r border-[var(--ch-divider,#e9edef)]",
            showDetailOnMobile ? "hidden md:block" : "block",
          )}
        >
          <ConversationList
            ref={searchRef}
            variant={variant}
            title={title}
            items={list}
            total={conversations.length}
            activePhone={selected?.phone}
            onSelect={(p) => onSelectPhone(p)}
            search={search}
            onSearch={setSearch}
            filter={filter}
            onFilter={setFilter}
            isLoading={isLoading}
            error={error}
          />
        </aside>
        <section
          className={cn(
            "min-h-0 flex-col bg-[var(--ch-chat-bg,#efeae2)]",
            showDetailOnMobile ? "flex" : "hidden md:flex",
          )}
        >
          {selected ? (
            <Fragment key={selected.phone}>
              <ConversationHeader
                conversation={selected}
                variant={variant}
                onBack={() => onSelectPhone(undefined)}
                onInfo={() => setDrawerOpen(true)}
                chips={headerChips?.(selected)}
              />
              <Thread conversation={selected} variant={variant} />
              <Composer
                channel={variant}
                phone={selected.phone}
                variant={variant}
                footnote={composerFootnote}
              />
            </Fragment>
          ) : (
            <div className="grid flex-1 place-items-center p-6">
              <EmptyState
                title={
                  isLoading
                    ? "Loading conversations…"
                    : phone
                      ? "Conversation not found"
                      : "Select a conversation"
                }
                description={
                  phone && !isLoading
                    ? `No ${title} thread for ${phone}.`
                    : "Use j / k to move between threads, / to search."
                }
              />
            </div>
          )}
        </section>
      </div>
      <LeadInfoDrawer
        conversation={selected}
        open={drawerOpen}
        onOpenChange={setDrawerOpen}
        extra={selected ? drawerExtra?.(selected) : undefined}
      />
    </div>
  );
}
