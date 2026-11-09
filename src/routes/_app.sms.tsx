import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { WifiOff } from "lucide-react";
import { MessengerLayout, validatePhoneSearch } from "@/components/chat";
import { useSmsFeed } from "@/hooks/use-feeds";

export const Route = createFileRoute("/_app/sms")({
  validateSearch: validatePhoneSearch,
  component: SmsTab,
});

/** true only when agent-health explicitly reports Telerivet offline; any other shape/failure → false. */
function useTelerivetOffline() {
  const { data } = useQuery({
    queryKey: ["agent-health"],
    queryFn: async () => {
      try {
        const r = await fetch("/api/agent-health", { credentials: "include" });
        if (!r.ok) return null;
        return (await r.json()) as unknown;
      } catch {
        return null;
      }
    },
    refetchInterval: 60_000,
    retry: false,
  });
  const t = (data as { telerivet?: { online?: unknown } } | null | undefined)?.telerivet;
  return !!t && typeof t === "object" && t.online === false;
}

function SmsTab() {
  const { data, isLoading, error } = useSmsFeed();
  const { phone } = Route.useSearch();
  const navigate = Route.useNavigate();
  const offline = useTelerivetOffline();

  return (
    <MessengerLayout
      variant="sms"
      title="Messages"
      conversations={data?.items ?? []}
      connected={data?.connected ?? true}
      isLoading={isLoading}
      error={error}
      phone={phone}
      onSelectPhone={(p) => navigate({ search: p ? { phone: p } : {}, replace: true })}
      composerFootnote="Sent via Telerivet"
      banner={
        offline ? (
          <div
            role="alert"
            className="flex items-center gap-2 bg-amber-100 px-4 py-2 text-sm text-amber-900 dark:bg-amber-950/60 dark:text-amber-200"
          >
            <WifiOff className="size-4 shrink-0" aria-hidden />
            Telerivet SMS gateway is offline — outgoing SMS will queue until the phone reconnects.
          </div>
        ) : null
      }
      notConnected={{
        title: "SMS feed not connected",
        description: "The n8n SMS conversations workflow isn't responding.",
      }}
    />
  );
}
