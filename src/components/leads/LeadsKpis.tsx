import { CalendarCheck, Clock, LayoutDashboard, Users } from "lucide-react";
import { StatCard } from "@/components/shared";
import { Skeleton } from "@/components/ui/skeleton";
import { CHANNELS } from "@/lib/channels";
import { channelLabel } from "@/lib/conversion";
import type { ChannelRate, LeadsKpis as Kpis } from "@/lib/leads-join";

function RateCard({ rates, loading }: { rates: ChannelRate[]; loading?: boolean }) {
  const shown = rates.filter((r) => r.eligible > 0);
  return (
    <div className="rgf-card col-span-2 flex min-w-0 flex-col gap-2 p-4 lg:col-span-1">
      <div className="text-xs font-medium text-muted-foreground">
        Conversion rate by channel <span className="font-normal">(replied → Lead)</span>
      </div>
      {loading ? (
        <div className="space-y-1.5">
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="h-3 w-full" />
          ))}
        </div>
      ) : shown.length === 0 ? (
        <div className="text-sm text-muted-foreground">No replied Pre-Leads yet</div>
      ) : (
        <ul className="space-y-1">
          {shown.map((r) => (
            <li
              key={r.channel}
              className="grid grid-cols-[64px_1fr_auto] items-center gap-2 text-[11px]"
              title={`${channelLabel(r.channel)}: ${r.converted} of ${r.eligible} replied Pre-Leads converted`}
            >
              <span className="truncate text-muted-foreground">{channelLabel(r.channel)}</span>
              <span className="h-1.5 overflow-hidden rounded-full bg-muted" aria-hidden>
                <span
                  className="block h-full rounded-full"
                  style={{
                    width: `${Math.max(2, Math.round(r.rate * 100))}%`,
                    backgroundColor: CHANNELS[r.channel].color,
                  }}
                />
              </span>
              <span className="font-mono tabular-nums">
                {Math.round(r.rate * 100)}%{" "}
                <span className="text-muted-foreground">
                  ({r.converted}/{r.eligible})
                </span>
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export function LeadsKpis({
  kpis,
  rates,
  ratesLoading,
}: {
  kpis: Kpis;
  rates: ChannelRate[];
  ratesLoading?: boolean;
}) {
  return (
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
      <StatCard label="Total Leads" value={kpis.total} icon={<Users />} />
      <StatCard
        label="Converted this week"
        value={kpis.convertedThisWeek}
        icon={<CalendarCheck />}
        hint="Since Monday, Manila time"
        color="#33673B"
      />
      <StatCard
        label="Converted from dashboard"
        value={kpis.fromDashboardAllTime}
        icon={<LayoutDashboard />}
        hint="All time"
        color="#226DB4"
      />
      <StatCard
        label="Median days to Lead"
        value={kpis.medianDaysToConvert ?? 0}
        format={(n) => (kpis.medianDaysToConvert == null ? "—" : n.toFixed(1))}
        icon={<Clock />}
        hint="First contact → Lead"
        color="#F97316"
      />
      <RateCard rates={rates} loading={ratesLoading} />
    </div>
  );
}
