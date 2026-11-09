import { createFileRoute, Link } from "@tanstack/react-router";
import { CheckCheck, MessageSquareShare, XCircle } from "lucide-react";
import { MessengerLayout, validatePhoneSearch } from "@/components/chat";
import { useViberFeed } from "@/hooks/use-feeds";
import type { Conversation } from "@/lib/channels";

export const Route = createFileRoute("/_app/viber")({
  validateSearch: validatePhoneSearch,
  component: ViberTab,
});

function DeliveryChip({ status }: { status?: string }) {
  if (!status) return null;
  const s = status.toLowerCase();
  const failed = /fail|error|undeliver|reject/.test(s);
  const delivered = /deliver|sent|read|seen|success/.test(s) && !failed;
  return (
    <span
      className={
        failed
          ? "inline-flex items-center gap-1 rounded-full bg-red-100 px-2 py-0.5 text-[11px] font-medium text-red-700 dark:bg-red-950/50 dark:text-red-300"
          : "inline-flex items-center gap-1 rounded-full bg-[color-mix(in_srgb,var(--ch-primary,#7360f2)_15%,transparent)] px-2 py-0.5 text-[11px] font-medium text-[var(--ch-primary,#7360f2)]"
      }
      title={`Opener delivery: ${status}`}
    >
      {failed ? (
        <XCircle className="size-3" aria-hidden />
      ) : (
        <CheckCheck className="size-3" aria-hidden />
      )}
      {failed ? "Failed" : delivered ? "Delivered" : status}
    </span>
  );
}

function FallbackChip({ c }: { c: Conversation }) {
  if (!c.smsFallbackSent) return null;
  return (
    <Link
      to="/sms"
      search={{ phone: c.phone }}
      className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-medium text-amber-800 hover:bg-amber-200 dark:bg-amber-950/50 dark:text-amber-300"
      title="Viber opener failed — open the SMS thread"
    >
      <MessageSquareShare className="size-3" aria-hidden />
      Fell back to SMS
    </Link>
  );
}

function ViberTab() {
  const { data, isLoading, error } = useViberFeed();
  const { phone } = Route.useSearch();
  const navigate = Route.useNavigate();

  return (
    <MessengerLayout
      variant="viber"
      title="Viber"
      conversations={data?.items ?? []}
      connected={data?.connected ?? true}
      isLoading={isLoading}
      error={error}
      phone={phone}
      onSelectPhone={(p) => navigate({ search: p ? { phone: p } : {}, replace: true })}
      headerChips={(c) => (
        <>
          <DeliveryChip status={c.openerDeliveryStatus} />
          <FallbackChip c={c} />
        </>
      )}
      drawerExtra={(c) =>
        c.openerDeliveryStatus || c.smsFallbackSent ? (
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <span className="text-muted-foreground">Opener:</span>
            <DeliveryChip status={c.openerDeliveryStatus} />
            <FallbackChip c={c} />
          </div>
        ) : null
      }
      notConnected={{
        title: "Viber feed not connected yet",
        description:
          "The n8n workflow isn't published. Conversations will appear here automatically once it goes live.",
      }}
    />
  );
}
