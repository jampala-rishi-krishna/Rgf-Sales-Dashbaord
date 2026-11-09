import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useCallback, useMemo } from "react";
import { AlertTriangle, Users } from "lucide-react";
import { EmptyState } from "@/components/shared";
import { Skeleton } from "@/components/ui/skeleton";
import { LeadsKpis } from "@/components/leads/LeadsKpis";
import { LeadsCards, LeadsTable, useLeadsGridPrefs } from "@/components/leads/LeadsTable";
import { LeadsToolbar } from "@/components/leads/LeadsToolbar";
import { LeadDrawer } from "@/components/leads/LeadDrawer";
import { ReadyToConvert, useReadyToConvert } from "@/components/leads/ReadyToConvert";
import { useMe } from "@/hooks/use-me";
import { useLeads } from "@/hooks/use-conversions";
import { useConversionFeeds } from "@/hooks/use-conversion-feeds";
import { usePreLeads } from "@/hooks/use-pre-leads";
import { formatManila } from "@/lib/channels";
import {
  DEFAULT_DIR,
  DEFAULT_SORT,
  downloadCsv,
  filterLeads,
  leadsCsv,
  parseLeadsSearch,
  serializeLeadsSearch,
  sortLeads,
  type LeadsSearch,
} from "@/lib/leads-filters";
import { buildActivityMap, conversionRateByChannel, joinLeads, leadsKpis } from "@/lib/leads-join";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_app/leads")({
  validateSearch: (s: Record<string, unknown>): LeadsSearch => parseLeadsSearch(s),
  head: () => ({ meta: [{ title: "Leads — RGF Sales Operations" }] }),
  component: LeadsPage,
});

const uniq = (xs: string[]) =>
  Array.from(new Set(xs.filter(Boolean))).sort((a, b) => a.localeCompare(b));

function LeadsPage() {
  const search = Route.useSearch();
  const navigate = useNavigate();
  const me = useMe();
  const flags = me.data?.flags;
  const enabled = !!flags?.leadsTab;
  const leads = useLeads(enabled);
  const { feeds } = useConversionFeeds();
  const ready = useReadyToConvert(feeds);
  const pre = usePreLeads();
  const prefs = useLeadsGridPrefs();

  const setSearch = useCallback(
    (patch: Partial<LeadsSearch>) => {
      void navigate({
        to: "/leads",
        replace: true,
        search: ((prev: LeadsSearch) =>
          serializeLeadsSearch({
            ...parseLeadsSearch(prev as Record<string, unknown>),
            ...patch,
          })) as never,
      });
    },
    [navigate],
  );

  const activity = useMemo(() => buildActivityMap(feeds), [feeds]);
  const joined = useMemo(
    () => joinLeads(leads.data?.leads ?? [], leads.data?.conversions ?? [], activity),
    [leads.data, activity],
  );
  const sort = search.sort ?? DEFAULT_SORT;
  const dir = search.dir ?? DEFAULT_DIR;
  const visible = useMemo(
    () => sortLeads(filterLeads(joined, search), sort, dir),
    [joined, search, sort, dir],
  );
  const kpis = useMemo(() => leadsKpis(joined), [joined]);
  const rates = useMemo(
    () => conversionRateByChannel(ready.eligibleByChannel, leads.data?.conversions ?? []),
    [ready.eligibleByChannel, leads.data],
  );
  const statuses = useMemo(() => uniq(joined.map((r) => r.status)), [joined]);
  const owners = useMemo(() => uniq(joined.map((r) => r.owner)), [joined]);
  const active = search.id ? joined.find((r) => r.id === search.id) : undefined;
  const preLead = useMemo(
    () =>
      active?.conversion?.preLeadId
        ? pre.data?.leads.find((l) => l.id === active.conversion?.preLeadId)
        : undefined,
    [active, pre.data],
  );

  const onSort = (key: string) =>
    setSearch(
      key === sort
        ? { dir: dir === "asc" ? "desc" : "asc" }
        : { sort: key, dir: key === "lead" || key === "owner" ? "asc" : "desc" },
    );

  if (me.isSuccess && !enabled)
    return (
      <EmptyState
        icon={<Users />}
        title="Leads tab is not enabled yet"
        description="Set FEATURE_LEADS_TAB=true once the n8n /dashboard-leads workflow is published."
      />
    );

  const view = search.view ?? "all";
  return (
    <div className="flex h-[calc(100dvh-7rem)] min-h-[520px] flex-col gap-3">
      <div className="flex flex-wrap items-end gap-3">
        <div>
          <h1 className="text-2xl font-bold" style={{ color: "var(--rgf-ink,#1B2419)" }}>
            Leads
          </h1>
          <p className="text-sm text-muted-foreground">
            Zoho Leads and the Pre-Leads ready to become one.
            {leads.data?.fetchedAt && (
              <span title={formatManila(leads.data.fetchedAt)}>
                {" "}
                Synced {formatManila(leads.data.fetchedAt, { hour: "numeric", minute: "2-digit" })}.
              </span>
            )}
          </p>
        </div>
        <div
          role="tablist"
          aria-label="Leads view"
          className="ml-auto flex rounded-lg bg-muted p-0.5"
        >
          {(
            [
              ["all", `All Leads${leads.data ? ` (${joined.length})` : ""}`],
              ["ready", `Ready to convert${ready.isLoading ? "" : ` (${ready.rows.length})`}`],
            ] as const
          ).map(([k, label]) => (
            <button
              key={k}
              role="tab"
              aria-selected={view === k}
              onClick={() =>
                setSearch({ view: k === "ready" ? "ready" : undefined, id: undefined })
              }
              className={cn(
                "rounded-md px-3 py-1 text-xs font-semibold",
                view === k
                  ? "bg-background text-[var(--rgf-red)] shadow-sm dark:text-[#E8505E]"
                  : "text-muted-foreground",
              )}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      <LeadsKpis kpis={kpis} rates={rates} ratesLoading={ready.isLoading} />

      {view === "ready" ? (
        <div className="min-h-0 flex-1 overflow-y-auto">
          <ReadyToConvert feeds={feeds} ready={ready} />
        </div>
      ) : (
        <>
          <LeadsToolbar
            search={search}
            setSearch={setSearch}
            statuses={statuses}
            owners={owners}
            prefs={prefs}
            shown={visible.length}
            total={joined.length}
            onExport={() =>
              downloadCsv(
                `rgf-leads-${new Date().toISOString().slice(0, 10)}.csv`,
                leadsCsv(visible),
              )
            }
          />
          <div className="min-h-0 flex-1">
            {leads.isLoading || me.isLoading ? (
              <div className="space-y-2" aria-busy>
                {Array.from({ length: 8 }).map((_, i) => (
                  <Skeleton key={i} className="h-10 w-full" />
                ))}
              </div>
            ) : leads.error || leads.data?.ok === false ? (
              <EmptyState
                icon={<AlertTriangle />}
                title="Couldn't load Leads"
                description={leads.data?.error ?? String(leads.error ?? "Unknown error")}
              />
            ) : !leads.data?.connected ? (
              <EmptyState
                title="Leads feed not connected yet"
                description={
                  leads.data?.error ??
                  "The n8n /dashboard-leads workflow isn't published. Leads will appear here once it is."
                }
              />
            ) : visible.length === 0 ? (
              <EmptyState
                title={joined.length ? "No leads match these filters" : "No Leads yet"}
                description={joined.length ? "Try clearing a filter." : undefined}
              />
            ) : (
              <>
                <div className="hidden h-full md:block">
                  <LeadsTable
                    rows={visible}
                    sort={sort}
                    dir={dir}
                    onSort={onSort}
                    onOpen={(id) => setSearch({ id })}
                    activeId={search.id}
                    prefs={prefs}
                  />
                </div>
                <div className="h-full overflow-y-auto md:hidden">
                  <LeadsCards rows={visible} onOpen={(id) => setSearch({ id })} />
                </div>
              </>
            )}
          </div>
        </>
      )}

      <LeadDrawer
        row={active}
        feeds={feeds}
        fields={leads.data?.fields ?? []}
        preLead={preLead}
        onOpenChange={(o) => !o && setSearch({ id: undefined })}
      />
    </div>
  );
}
