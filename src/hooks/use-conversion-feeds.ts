// All conversation feeds in the ConversionFeeds shape (shares the tabs' query cache).
import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";
import {
  useSmsFeed,
  useVapiFeed,
  useViberFeed,
  useWebsiteFeed,
  useWhatsAppFeed,
} from "@/hooks/use-feeds";
import type { ConversionFeeds, EmailThreadLite, WebSessionLite } from "@/lib/conversion";
import type { VapiCall } from "@/components/calls/vapi";

/** Latest 100 Gmail thread summaries; empty (not an error) when Gmail isn't connected. */
export function useEmailThreadsLite(enabled = true) {
  return useQuery<EmailThreadLite[]>({
    queryKey: ["gmail-threads-lite"],
    queryFn: async () => {
      const r = await fetch("/api/gmail-threads?maxResults=100", { credentials: "include" });
      if (!r.ok) return [];
      const d = (await r.json().catch(() => null)) as { threads?: EmailThreadLite[] } | null;
      return d?.threads ?? [];
    },
    enabled,
    staleTime: 2 * 60_000,
    retry: false,
  });
}

export function useConversionFeeds(opts: { email?: boolean } = {}) {
  const wa = useWhatsAppFeed();
  const sms = useSmsFeed();
  const viber = useViberFeed();
  const web = useWebsiteFeed();
  const vapi = useVapiFeed();
  const email = useEmailThreadsLite(opts.email !== false);
  const feeds = useMemo<ConversionFeeds>(
    () => ({
      whatsapp: wa.data?.items ?? [],
      sms: sms.data?.items ?? [],
      viber: viber.data?.items ?? [],
      web: (Array.isArray(web.data) ? web.data : []) as unknown as WebSessionLite[],
      calls: (Array.isArray(vapi.data) ? vapi.data : []) as unknown as VapiCall[],
      email: email.data ?? [],
    }),
    [wa.data, sms.data, viber.data, web.data, vapi.data, email.data],
  );
  const isLoading = wa.isLoading || sms.isLoading || viber.isLoading;
  return { feeds, isLoading };
}
