// Campaign runs: server-backed (FEATURE_CAMPAIGN_RUNS) or local fallback with progress diffed from channel feeds.
import { useCallback, useEffect, useMemo, useState } from "react";
import { getJson, usePolling } from "@/hooks/use-polling";
import { useSmsFeed, useVapiFeed, useViberFeed, useWhatsAppFeed } from "@/hooks/use-feeds";
import { useMe } from "@/hooks/use-me";
import { hasReplied, type Conversation } from "@/lib/channels";

export type CampaignChannel = "whatsapp" | "sms" | "viber" | "email" | "voice_batch";
export type RunStatus = "queued" | "running" | "done" | "failed";

export interface CampaignRun {
  runId: string;
  channel: CampaignChannel;
  requested: number;
  sent: number;
  skipped: number;
  failed: number;
  status: RunStatus;
  startedAt: string;
  finishedAt?: string | null;
  triggeredBy?: string;
  dryRun?: boolean;
  /**
   * Conversations started by this run where the lead genuinely replied (hasReplied).
   * Undefined for channels whose feed has no reply data (email, voice batch).
   */
  replied?: number;
  /** true when counters are estimated from feeds (no server run tracking). */
  estimated?: boolean;
}

const LS_KEY = "rgf.campaignRuns.v1";
const MAX_LOCAL = 30;
const TIMEOUT_MS = 30 * 60_000;

function readLocal(): CampaignRun[] {
  try {
    const raw = window.localStorage.getItem(LS_KEY);
    const parsed = raw ? (JSON.parse(raw) as CampaignRun[]) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}
function writeLocal(runs: CampaignRun[]) {
  try {
    window.localStorage.setItem(LS_KEY, JSON.stringify(runs.slice(0, MAX_LOCAL)));
  } catch {
    /* storage unavailable */
  }
}

function startedSince(c: Conversation, since: number) {
  const first = c.messages?.[0]?.ts ?? c.lastUpdated;
  const t = first ? Date.parse(first) : NaN;
  return !Number.isNaN(t) && t >= since;
}

function countSince(convs: Conversation[] | undefined, since: number) {
  if (!convs) return 0;
  return convs.filter((c) => startedSince(c, since)).length;
}

/** Real two-way replies among conversations this run started (same rule as the channel tabs). */
export function countRepliedSince(convs: Conversation[] | undefined, since: number) {
  if (!convs) return 0;
  return convs.filter((c) => startedSince(c, since) && hasReplied(c)).length;
}

function countVapiSince(calls: Record<string, unknown>[] | undefined, since: number) {
  if (!calls) return 0;
  let n = 0;
  for (const c of calls) {
    const ts = (c.createdAt ?? c.startedAt) as string | undefined;
    const t = ts ? Date.parse(ts) : NaN;
    if (!Number.isNaN(t) && t >= since) n++;
  }
  return n;
}

export function useCampaignRuns() {
  const me = useMe();
  const serverMode = !!me.data?.flags.campaignRuns;

  const server = usePolling(
    ["campaign-runs"],
    () => getJson<{ connected: boolean; runs: CampaignRun[] }>("/api/campaign-runs"),
    10_000,
    { enabled: serverMode },
  );

  const [local, setLocal] = useState<CampaignRun[]>([]);
  useEffect(() => setLocal(readLocal()), []);

  const hasActiveLocal = local.some((r) => r.status !== "done" && r.status !== "failed");
  const feedMs = hasActiveLocal ? 15_000 : 60_000;
  const wa = useWhatsAppFeed(feedMs);
  const sms = useSmsFeed(feedMs);
  const viber = useViberFeed(feedMs);
  const vapi = useVapiFeed(feedMs);

  // Tick so timeouts resolve even when feeds don't change.
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!hasActiveLocal) return;
    const id = window.setInterval(() => setNow(Date.now()), 15_000);
    return () => window.clearInterval(id);
  }, [hasActiveLocal]);

  const localComputed = useMemo<CampaignRun[]>(() => {
    return local.map((r) => {
      if (r.status === "done" || r.status === "failed") return r;
      const since = Date.parse(r.startedAt);
      if (r.dryRun) {
        // Nothing is actually sent in a dry run: simulate the lifecycle, don't diff real feeds.
        const age = now - since;
        const status: RunStatus = age > 8_000 ? "done" : age > 2_000 ? "running" : "queued";
        return {
          ...r,
          status,
          finishedAt: status === "done" ? new Date(since + 8_000).toISOString() : null,
          estimated: true,
        };
      }
      let sent = 0;
      if (r.channel === "whatsapp") sent = countSince(wa.data?.items, since);
      else if (r.channel === "sms") sent = countSince(sms.data?.items, since);
      else if (r.channel === "viber") sent = countSince(viber.data?.items, since);
      else if (r.channel === "voice_batch") sent = countVapiSince(vapi.data, since);
      sent = Math.min(sent, r.requested);
      const timedOut = now - since >= TIMEOUT_MS;
      const done = sent >= r.requested || timedOut;
      const status: RunStatus = done
        ? "done"
        : sent > 0 || now - since > 20_000
          ? "running"
          : "queued";
      return {
        ...r,
        sent,
        status,
        finishedAt: done ? new Date(Math.min(now, since + TIMEOUT_MS)).toISOString() : null,
        estimated: true,
      };
    });
  }, [local, wa.data, sms.data, viber.data, vapi.data, now]);

  // Persist completed transitions so they stop being recomputed.
  useEffect(() => {
    const changed = localComputed.some(
      (r, i) => r.status === "done" && local[i]?.status !== "done",
    );
    if (changed) {
      setLocal(localComputed);
      writeLocal(localComputed);
    }
  }, [localComputed, local]);

  const addRun = useCallback((run: Omit<CampaignRun, "sent" | "skipped" | "failed" | "status">) => {
    const full: CampaignRun = { ...run, sent: 0, skipped: 0, failed: 0, status: "queued" };
    setLocal((prev) => {
      const next = [full, ...prev.filter((r) => r.runId !== run.runId)].slice(0, MAX_LOCAL);
      writeLocal(next);
      return next;
    });
  }, []);

  const clearFinished = useCallback(() => {
    setLocal((prev) => {
      const next = prev.filter((r) => r.status !== "done" && r.status !== "failed");
      writeLocal(next);
      return next;
    });
  }, []);

  let runs: CampaignRun[];
  if (serverMode && server.data?.connected) {
    // Merge dry-run flags from local records (server doesn't know about them).
    const localById = new Map(local.map((r) => [r.runId, r]));
    const serverIds = new Set(server.data.runs.map((r) => r.runId));
    runs = [
      ...server.data.runs.map((r) => ({ ...r, dryRun: localById.get(r.runId)?.dryRun })),
      ...localComputed.filter((r) => !serverIds.has(r.runId) && r.dryRun),
    ];
  } else {
    runs = localComputed;
  }
  const feedFor: Partial<Record<CampaignChannel, Conversation[] | undefined>> = {
    whatsapp: wa.data?.items,
    sms: sms.data?.items,
    viber: viber.data?.items,
  };
  runs = runs.map((r) =>
    r.dryRun || !(r.channel in feedFor)
      ? r
      : { ...r, replied: countRepliedSince(feedFor[r.channel], Date.parse(r.startedAt)) },
  );
  runs.sort((a, b) => Date.parse(b.startedAt) - Date.parse(a.startedAt));

  return { runs, addRun, clearFinished, serverMode, isLoading: serverMode && server.isLoading };
}
