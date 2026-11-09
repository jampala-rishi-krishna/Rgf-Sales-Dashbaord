import { useEffect, useMemo, useRef, useState } from "react";
import {
  columnResizingFeature,
  columnSizingFeature,
  columnVisibilityFeature,
  flexRender,
  tableFeatures,
  useTable,
  type ColumnDef,
  type ColumnSizingState,
  type ColumnVisibilityState as VisibilityState,
} from "@tanstack/react-table";
import { useVirtualizer } from "@tanstack/react-virtual";
import { Copy } from "lucide-react";
import { toast } from "sonner";
import type { JoinedLead } from "@/lib/leads-join";
import type { SortDir } from "@/lib/leads-filters";
import { cn } from "@/lib/utils";
import { ChannelChip, StatusPill, When, readLocal, writeLocal } from "./format";

const features = tableFeatures({
  columnVisibilityFeature,
  columnSizingFeature,
  columnResizingFeature,
});

export type Density = "compact" | "comfortable";
const LS_VIS = "leads.grid.visibility";
const LS_SIZE = "leads.grid.sizing";
const LS_DENSITY = "leads.grid.density";

export const LEAD_COLUMNS: { id: string; label: string; hideable: boolean }[] = [
  { id: "lead", label: "Lead", hideable: false },
  { id: "phone", label: "Phone", hideable: true },
  { id: "email", label: "Email", hideable: true },
  { id: "channel", label: "Source channel", hideable: true },
  { id: "product", label: "Product", hideable: true },
  { id: "status", label: "Status", hideable: true },
  { id: "owner", label: "Owner", hideable: true },
  { id: "firstContact", label: "First contacted", hideable: true },
  { id: "firstReply", label: "First reply", hideable: true },
  { id: "becameLead", label: "Became Lead", hideable: true },
  { id: "days", label: "Days to convert", hideable: true },
  { id: "lastActivity", label: "Last activity", hideable: true },
  { id: "convertedBy", label: "Converted by", hideable: true },
];

export function copyText(text: string) {
  if (!text) return;
  void navigator.clipboard?.writeText(text).then(
    () => toast.success(`Copied ${text}`),
    () => toast.error("Copy failed"),
  );
}

const dash = <span className="text-muted-foreground">—</span>;

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- mixed TValue per column
function buildColumns(): ColumnDef<typeof features, JoinedLead, any>[] {
  return [
    {
      id: "lead",
      header: "Lead",
      size: 230,
      enableHiding: false,
      accessorFn: (r) => r.name,
      cell: ({ row: { original: r } }) => (
        <div className="min-w-0 leading-tight">
          <div className="truncate font-medium">{r.name || r.company || "—"}</div>
          {r.name && r.company && (
            <div className="truncate text-[11px] text-muted-foreground">{r.company}</div>
          )}
        </div>
      ),
    },
    {
      id: "phone",
      header: "Phone",
      size: 150,
      accessorFn: (r) => r.phone,
      cell: ({ row: { original: r } }) =>
        r.phone ? (
          <span className="group/phone inline-flex items-center gap-1">
            <span className="font-mono text-xs">{r.phone}</span>
            <button
              type="button"
              aria-label={`Copy ${r.phone}`}
              title="Copy"
              className="rounded p-0.5 text-muted-foreground opacity-0 hover:text-foreground focus-visible:opacity-100 group-hover/phone:opacity-100"
              onClick={(e) => {
                e.stopPropagation();
                copyText(r.phone);
              }}
            >
              <Copy className="size-3" />
            </button>
          </span>
        ) : (
          dash
        ),
    },
    {
      id: "email",
      header: "Email",
      size: 190,
      accessorFn: (r) => r.email,
      cell: (c) => c.getValue<string>() || dash,
    },
    {
      id: "channel",
      header: "Source",
      size: 120,
      accessorFn: (r) => r.sourceChannel,
      cell: ({ row: { original: r } }) => <ChannelChip channel={r.sourceChannel} />,
    },
    {
      id: "product",
      header: "Product",
      size: 150,
      accessorFn: (r) => r.product,
      cell: (c) => c.getValue<string>() || dash,
    },
    {
      id: "status",
      header: "Status",
      size: 130,
      accessorFn: (r) => r.status,
      cell: ({ row: { original: r } }) => <StatusPill status={r.status} />,
    },
    {
      id: "owner",
      header: "Owner",
      size: 130,
      accessorFn: (r) => r.owner,
      cell: (c) => c.getValue<string>() || dash,
    },
    {
      id: "firstContact",
      header: "First contacted",
      size: 115,
      accessorFn: (r) => r.firstContactAt,
      cell: ({ row: { original: r } }) => <When ts={r.firstContactAt} />,
    },
    {
      id: "firstReply",
      header: "First reply",
      size: 105,
      accessorFn: (r) => r.firstReplyAt,
      cell: ({ row: { original: r } }) => <When ts={r.firstReplyAt} />,
    },
    {
      id: "becameLead",
      header: "Became Lead",
      size: 110,
      accessorFn: (r) => r.becameLeadAt,
      cell: ({ row: { original: r } }) => <When ts={r.becameLeadAt} />,
    },
    {
      id: "days",
      header: "Days",
      size: 70,
      accessorFn: (r) => r.daysToConvert,
      cell: ({ row: { original: r } }) =>
        r.daysToConvert != null ? <span className="tabular-nums">{r.daysToConvert}</span> : dash,
    },
    {
      id: "lastActivity",
      header: "Last activity",
      size: 110,
      accessorFn: (r) => r.lastActivityAt,
      cell: ({ row: { original: r } }) => <When ts={r.lastActivityAt} />,
    },
    {
      id: "convertedBy",
      header: "Converted by",
      size: 170,
      accessorFn: (r) => r.convertedBy,
      cell: (c) => c.getValue<string>() || dash,
    },
  ];
}

export function useLeadsGridPrefs() {
  const [visibility, setVisibility] = useState<VisibilityState>({});
  const [sizing, setSizing] = useState<ColumnSizingState>({});
  const [density, setDensity] = useState<Density>("compact");
  const loaded = useRef(false);
  useEffect(() => {
    setVisibility(readLocal<VisibilityState>(LS_VIS, { email: false, firstContact: false }));
    setSizing(readLocal<ColumnSizingState>(LS_SIZE, {}));
    setDensity(readLocal<Density>(LS_DENSITY, "compact"));
    loaded.current = true;
  }, []);
  useEffect(() => {
    if (loaded.current) writeLocal(LS_VIS, visibility);
  }, [visibility]);
  useEffect(() => {
    if (loaded.current) writeLocal(LS_SIZE, sizing);
  }, [sizing]);
  useEffect(() => {
    if (loaded.current) writeLocal(LS_DENSITY, density);
  }, [density]);
  return { visibility, setVisibility, sizing, setSizing, density, setDensity };
}
export type LeadsGridPrefs = ReturnType<typeof useLeadsGridPrefs>;

export function LeadsTable({
  rows,
  sort,
  dir,
  onSort,
  onOpen,
  activeId,
  prefs,
}: {
  rows: JoinedLead[];
  sort: string;
  dir: SortDir;
  onSort: (key: string) => void;
  onOpen: (id: string) => void;
  activeId?: string;
  prefs: LeadsGridPrefs;
}) {
  const columns = useMemo(buildColumns, []);
  const table = useTable({
    features,
    data: rows,
    columns,
    getRowId: (r) => r.id,
    state: { columnVisibility: prefs.visibility, columnSizing: prefs.sizing },
    onColumnVisibilityChange: prefs.setVisibility,
    onColumnSizingChange: prefs.setSizing,
    columnResizeMode: "onChange",
  });

  const parentRef = useRef<HTMLDivElement>(null);
  const rowH = prefs.density === "compact" ? 40 : 54;
  const tableRows = table.getRowModel().rows;
  const virt = useVirtualizer({
    count: tableRows.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => rowH,
    overscan: 12,
  });
  useEffect(() => virt.measure(), [rowH, virt]);

  return (
    <div
      ref={parentRef}
      className="relative h-full overflow-auto rounded-[var(--radius,14px)] border bg-[var(--surface,#fff)]"
      role="grid"
      aria-label="Leads"
      aria-rowcount={tableRows.length}
    >
      <div style={{ width: table.getTotalSize(), minWidth: "100%" }}>
        <div
          className="sticky top-0 z-10 flex border-b bg-[var(--surface,#fff)] text-[11px] font-semibold uppercase tracking-wide text-muted-foreground"
          role="row"
        >
          {table.getHeaderGroups()[0].headers.map((h) => {
            const active = sort === h.column.id;
            return (
              <div
                key={h.id}
                role="columnheader"
                className="relative flex h-9 shrink-0 items-center px-2 select-none"
                style={{ width: h.getSize() }}
                aria-sort={active ? (dir === "asc" ? "ascending" : "descending") : undefined}
              >
                <button
                  type="button"
                  className={cn(
                    "flex items-center gap-1 truncate hover:text-foreground",
                    active && "text-foreground",
                  )}
                  onClick={() => onSort(h.column.id)}
                >
                  {flexRender(h.column.columnDef.header, h.getContext())}
                  {active ? (dir === "asc" ? "↑" : "↓") : ""}
                </button>
                {h.column.getCanResize() && (
                  <div
                    onMouseDown={h.getResizeHandler()}
                    onTouchStart={h.getResizeHandler()}
                    onDoubleClick={() => h.column.resetSize()}
                    aria-hidden
                    className={`absolute top-1 right-0 h-7 w-1 cursor-col-resize rounded ${h.column.getIsResizing() ? "bg-[var(--rgf-red)]" : "hover:bg-border"}`}
                  />
                )}
              </div>
            );
          })}
        </div>
        <div style={{ height: virt.getTotalSize(), position: "relative" }}>
          {virt.getVirtualItems().map((vi) => {
            const row = tableRows[vi.index];
            const active = row.id === activeId;
            return (
              <div
                key={row.id}
                role="row"
                tabIndex={0}
                onClick={() => onOpen(row.id)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    onOpen(row.id);
                  }
                }}
                className={cn(
                  "absolute left-0 flex w-full cursor-pointer items-center border-b text-[13px] transition-colors hover:bg-muted/60 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-[var(--rgf-red)]",
                  active && "bg-[color-mix(in_srgb,var(--rgf-red)_8%,transparent)]",
                )}
                style={{ top: 0, transform: `translateY(${vi.start}px)`, height: rowH }}
              >
                {row.getVisibleCells().map((cell) => (
                  <div
                    key={cell.id}
                    role="gridcell"
                    className="shrink-0 truncate px-2"
                    style={{ width: cell.column.getSize() }}
                  >
                    {flexRender(cell.column.columnDef.cell, cell.getContext())}
                  </div>
                ))}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

/** Mobile (< md) list: one card per lead. Not virtualized beyond a "show more" cap. */
export function LeadsCards({ rows, onOpen }: { rows: JoinedLead[]; onOpen: (id: string) => void }) {
  const [limit, setLimit] = useState(50);
  return (
    <ul className="space-y-2">
      {rows.slice(0, limit).map((r) => (
        <li key={r.id}>
          <button
            type="button"
            onClick={() => onOpen(r.id)}
            className="w-full rounded-xl border bg-[var(--surface,#fff)] p-3 text-left shadow-sm focus-visible:outline-2 focus-visible:outline-[var(--rgf-red)]"
          >
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <div className="truncate font-medium">{r.name || r.company || "—"}</div>
                {r.name && r.company && (
                  <div className="truncate text-xs text-muted-foreground">{r.company}</div>
                )}
              </div>
              <StatusPill status={r.status} />
            </div>
            <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
              <ChannelChip channel={r.sourceChannel} />
              {r.phone && <span className="font-mono">{r.phone}</span>}
              {r.owner && <span>{r.owner}</span>}
            </div>
            <div className="mt-1.5 flex flex-wrap gap-x-3 text-[11px] text-muted-foreground">
              <span>
                Became Lead <When ts={r.becameLeadAt} />
              </span>
              {r.daysToConvert != null && <span>{r.daysToConvert} days to convert</span>}
            </div>
          </button>
        </li>
      ))}
      {rows.length > limit && (
        <li>
          <button
            type="button"
            onClick={() => setLimit((l) => l + 50)}
            className="w-full rounded-xl border py-2 text-sm font-medium hover:bg-muted"
          >
            Show more ({rows.length - limit} left)
          </button>
        </li>
      )}
    </ul>
  );
}
