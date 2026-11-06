import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useCallback, useMemo, useState } from "react";
import type { RowSelectionState } from "@tanstack/react-table";
import { EmptyState, StatCard } from "@/components/shared";
import { Skeleton } from "@/components/ui/skeleton";
import { usePreLeads } from "@/hooks/use-pre-leads";
import { useOutreachIndex } from "@/hooks/use-outreach-index";
import { canAct, useMe } from "@/hooks/use-me";
import { formatManila } from "@/lib/channels";
import {
  buildRows,
  crmSearchSchema,
  exportCsv,
  facetValues,
  filterRows,
  type CrmSearch,
} from "@/components/crm/crm-utils";
import { LeadsGrid, useGridPrefs } from "@/components/crm/leads-grid";
import { CrmToolbar } from "@/components/crm/crm-toolbar";
import { BulkActions } from "@/components/crm/bulk-actions";
import { LeadDrawer } from "@/components/crm/lead-drawer";

export const Route = createFileRoute("/_app/crm")({
  validateSearch: (s: Record<string, unknown>): CrmSearch => crmSearchSchema.parse(s),
  component: CrmPage,
});

const WEEK = 7 * 86_400_000;
const fmtPct = (n: number) => `${Math.round(n)}%`;
const pct = (n: number, d: number) => (d ? Math.round((n / d) * 100) : 0);

function CrmPage() {
  const search = Route.useSearch() as CrmSearch;
  const navigate = useNavigate();
  const { data, isLoading, error } = usePreLeads();
  const { index, feeds } = useOutreachIndex();
  const me = useMe().data;
  const canSend = canAct(me?.user?.role, "agent");
  const prefs = useGridPrefs();
  const [selection, setSelection] = useState<RowSelectionState>({});

  const setSearch = useCallback(
    (patch: Partial<CrmSearch>, reset = false) => {
      void navigate({
        to: "/crm",
        replace: true,
        search: ((prev: CrmSearch) =>
          reset ? { lead: prev.lead, ...patch } : { ...prev, ...patch }) as never,
      });
    },
    [navigate],
  );

  const leads = useMemo(() => data?.leads ?? [], [data]);
  const rows = useMemo(() => buildRows(leads, index), [leads, index]);
  const filtered = useMemo(() => filterRows(rows, search), [rows, search]);
  const facets = useMemo(() => facetValues(leads), [leads]);
  const byId = useMemo(() => new Map(rows.map((r) => [r.lead.id, r])), [rows]);
  const selectedRows = useMemo(
    () =>
      Object.keys(selection)
        .filter((k) => selection[k])
        .map((k) => byId.get(k))
        .filter((r) => !!r),
    [selection, byId],
  );

  const stats = useMemo(() => {
    const now = Date.now();
    let week = 0;
    let contacted = 0;
    for (const r of rows) {
      if (now - Date.parse(r.lead.createdTime) < WEEK) week++;
      if (r.contacted) contacted++;
    }
    return {
      total: rows.length,
      week,
      contacted: pct(contacted, rows.length),
      never: rows.length ? 100 - pct(contacted, rows.length) : 0,
    };
  }, [rows]);

  const openRow = search.lead ? byId.get(search.lead) : undefined;

  return (
    <div data-channel="crm" className="flex h-full min-h-0 flex-col gap-4 p-4 md:p-6">
      <header className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">
            <span
              className="mr-2 inline-block size-2.5 rounded-full bg-[var(--ch)] align-middle"
              aria-hidden
            />
            Zoho CRM · Pre-Leads
          </h1>
          <p className="text-sm text-muted-foreground">
            Every lead joined with WhatsApp, SMS, Viber, call and website outreach.
            {data?.fetchedAt && <> Synced {formatManila(data.fetchedAt)}.</>}
          </p>
        </div>
      </header>

      {isLoading ? (
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-24 rounded-[var(--radius,14px)]" />
            ))}
          </div>
          <Skeleton className="h-[60vh] rounded-[var(--radius,14px)]" />
        </div>
      ) : error ? (
        <EmptyState
          title="Couldn't load Pre-Leads"
          description={error instanceof Error ? error.message : "Unknown error"}
        />
      ) : !data?.connected ? (
        <EmptyState
          title="Zoho CRM feed not connected"
          description="Add an n8n webhook at N8N_BASE/dashboard-pre-leads (auth via N8N_WEBHOOK_AUTH) returning the Pre_Leads array, or set ZOHO_CLIENT_ID, ZOHO_CLIENT_SECRET, ZOHO_REFRESH_TOKEN and ZOHO_API_DOMAIN in the Vercel environment, then redeploy."
        />
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <StatCard label="Pre-Leads in CRM" value={stats.total} color="var(--ch)" />
            <StatCard
              label="Added this week"
              value={stats.week}
              hint="Created in the last 7 days"
            />
            <StatCard label="Contacted (any channel)" value={stats.contacted} format={fmtPct} />
            <StatCard label="Never contacted" value={stats.never} format={fmtPct} />
          </div>

          <CrmToolbar
            search={search}
            setSearch={setSearch}
            facets={facets}
            prefs={prefs}
            shown={filtered.length}
            total={rows.length}
            onExport={() => exportCsv(filtered)}
          />

          <BulkActions selected={selectedRows} canSend={canSend} onClear={() => setSelection({})} />

          <div className="min-h-[420px] flex-1">
            {filtered.length === 0 ? (
              <EmptyState
                title="No leads match these filters"
                description="Try clearing a filter or switching saved view."
              />
            ) : (
              <LeadsGrid
                rows={filtered}
                selection={selection}
                onSelectionChange={setSelection}
                onOpen={(id) => setSearch({ lead: id })}
                activeId={search.lead}
                prefs={prefs}
              />
            )}
          </div>

          <LeadDrawer
            row={openRow}
            open={!!openRow}
            onOpenChange={(o) => !o && setSearch({ lead: undefined })}
            feeds={feeds}
            canSend={canSend}
            singleCall={!!me?.flags.singleCall}
          />
        </>
      )}
    </div>
  );
}
