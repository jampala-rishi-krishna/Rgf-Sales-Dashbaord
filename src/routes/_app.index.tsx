import { createFileRoute } from "@tanstack/react-router";
import {
  ActivityFeed,
  ChannelFunnel,
  ChannelPerformance,
  KpiStrip,
  LiveOpsCanvas,
  NeedsHumanQueue,
  useMissionData,
  useNewEventIds,
} from "@/components/mission";

export const Route = createFileRoute("/_app/")({
  validateSearch: (s: Record<string, unknown>): { wall?: boolean } => {
    const w = s.wall;
    return w === 1 || w === "1" || w === true || w === "true" ? { wall: true } : {};
  },
  component: MissionControl,
});

function MissionControl() {
  const { wall } = Route.useSearch();
  const data = useMissionData();
  const newEvents = useNewEventIds(data.activity.data?.events);

  return (
    <div className="space-y-4" data-wall={wall ? "1" : undefined}>
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <h1 className="text-2xl font-bold" style={{ color: "var(--rgf-ink,#1B2419)" }}>
            Mission Control
          </h1>
          <p className="text-sm" style={{ color: "var(--muted,#6B6F68)" }}>
            Every agent, live. Activity refreshes every 10s, live calls every 5s.
          </p>
        </div>
      </div>

      <div className="grid grid-cols-12 gap-4">
        <div className="col-span-12">
          <LiveOpsCanvas data={data} newEvents={newEvents} />
        </div>
        <div className="col-span-12">
          <KpiStrip data={data} />
        </div>
        <div className="col-span-12 lg:col-span-4">
          <ChannelFunnel data={data} />
        </div>
        <div className="col-span-12 lg:col-span-5">
          <ActivityFeed data={data} newEvents={newEvents} />
        </div>
        <div className="col-span-12 lg:col-span-3">
          <NeedsHumanQueue data={data} wall={wall} />
        </div>
        <div className="col-span-12">
          <ChannelPerformance data={data} />
        </div>
      </div>
    </div>
  );
}
