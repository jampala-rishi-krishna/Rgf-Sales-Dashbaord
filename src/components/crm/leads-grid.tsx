import { useEffect, useMemo, useRef, useState } from "react";
import {
  columnResizingFeature,
  columnSizingFeature,
  columnVisibilityFeature,
  createSortedRowModel,
  flexRender,
  rowSelectionFeature,
  rowSortingFeature,
  sortFns,
  tableFeatures,
  useTable,
  type ColumnDef,
  type ColumnSizingState,
  type ColumnVisibilityState as VisibilityState,
  type RowSelectionState,
  type SortingState,
} from "@tanstack/react-table";

const features = tableFeatures({
  rowSortingFeature,
  rowSelectionFeature,
  columnVisibilityFeature,
  columnSizingFeature,
  columnResizingFeature,
  sortedRowModel: createSortedRowModel(),
  sortFns,
});
import { useVirtualizer } from "@tanstack/react-virtual";
import { toast } from "sonner";
import { formatManila } from "@/lib/channels";
import { OutreachDots } from "@/components/crm/outreach-dots";
import {
  STAGE_ORDER,
  readLocal,
  writeLocal,
  type CrmRow,
  type Stage,
} from "@/components/crm/crm-utils";

export type Density = "compact" | "comfortable";
const LS_VIS = "crm.grid.visibility";
const LS_SIZE = "crm.grid.sizing";

const STAGE_STYLE: Record<Stage, string> = {
  New: "bg-muted text-muted-foreground",
  Contacted: "bg-blue-50 text-blue-700 dark:bg-blue-950 dark:text-blue-300",
  Replied: "bg-amber-50 text-amber-800 dark:bg-amber-950 dark:text-amber-300",
  Meeting: "bg-green-50 text-green-800 dark:bg-green-950 dark:text-green-300",
};

const fmtDate = (s: string) =>
  s ? formatManila(s, { year: "2-digit", month: "short", day: "numeric" }) : "—";

function copy(text: string) {
  if (!text) return;
  void navigator.clipboard?.writeText(text).then(
    () => toast.success(`Copied ${text}`),
    () => toast.error("Copy failed"),
  );
}

export const COLUMN_LABELS: Record<string, string> = {
  company: "Company",
  contact: "Contact",
  phone: "Phone",
  email: "Email",
  segment: "Segment",
  products: "Products",
  location: "Province / City",
  source: "Source",
  created: "Created",
  modified: "Modified",
  outreach: "Outreach",
  stage: "Stage",
  owner: "Owner",
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- mixed TValue per column
function buildColumns(): ColumnDef<typeof features, CrmRow, any>[] {
  return [
    {
      id: "select",
      size: 36,
      enableResizing: false,
      enableSorting: false,
      enableHiding: false,
      header: ({ table }) => (
        <input
          type="checkbox"
          aria-label="Select all filtered"
          className="size-3.5 accent-[var(--ch)]"
          checked={table.getIsAllRowsSelected()}
          ref={(el) => {
            if (el)
              el.indeterminate = table.getIsSomeRowsSelected() && !table.getIsAllRowsSelected();
          }}
          onChange={table.getToggleAllRowsSelectedHandler()}
        />
      ),
      cell: ({ row }) => (
        <input
          type="checkbox"
          aria-label="Select row"
          className="size-3.5 accent-[var(--ch)]"
          checked={row.getIsSelected()}
          onClick={(e) => e.stopPropagation()}
          onChange={row.getToggleSelectedHandler()}
        />
      ),
    },
    {
      id: "company",
      header: "Company",
      size: 220,
      accessorFn: (r) => r.lead.company,
      cell: (c) => <span className="font-medium">{c.getValue<string>() || "—"}</span>,
    },
    { id: "contact", header: "Contact", size: 160, accessorFn: (r) => r.contact },
    {
      id: "phone",
      header: "Phone",
      size: 140,
      accessorFn: (r) => r.lead.phone,
      cell: (c) => {
        const v = c.getValue<string>();
        return v ? (
          <button
            type="button"
            title="Click to copy"
            className="font-mono text-xs hover:text-[var(--ch)] hover:underline"
            onClick={(e) => {
              e.stopPropagation();
              copy(v);
            }}
          >
            {v}
          </button>
        ) : (
          <span className="text-muted-foreground">—</span>
        );
      },
    },
    { id: "email", header: "Email", size: 190, accessorFn: (r) => r.lead.email ?? "" },
    { id: "segment", header: "Segment", size: 120, accessorFn: (r) => r.lead.channel ?? "" },
    {
      id: "products",
      header: "Products",
      size: 200,
      accessorFn: (r) => r.lead.products.join(", "),
      cell: ({ row }) => (
        <div className="flex gap-1 overflow-hidden">
          {row.original.lead.products.slice(0, 3).map((p) => (
            <span key={p} className="shrink-0 rounded-full border px-1.5 py-px text-[11px]">
              {p}
            </span>
          ))}
          {row.original.lead.products.length > 3 && (
            <span className="text-[11px] text-muted-foreground">
              +{row.original.lead.products.length - 3}
            </span>
          )}
        </div>
      ),
    },
    {
      id: "location",
      header: "Province / City",
      size: 160,
      accessorFn: (r) => [r.lead.province, r.lead.city].filter(Boolean).join(" · "),
    },
    { id: "source", header: "Source", size: 110, accessorFn: (r) => r.lead.source ?? "" },
    {
      id: "created",
      header: "Created",
      size: 100,
      accessorFn: (r) => r.lead.createdTime,
      cell: (c) => <span className="tabular-nums">{fmtDate(c.getValue<string>())}</span>,
    },
    {
      id: "modified",
      header: "Modified",
      size: 100,
      accessorFn: (r) => r.lead.modifiedTime,
      cell: (c) => <span className="tabular-nums">{fmtDate(c.getValue<string>())}</span>,
    },
    {
      id: "outreach",
      header: "Outreach",
      size: 120,
      accessorFn: (r) => STAGE_ORDER[r.stage],
      cell: ({ row }) => <OutreachDots outreach={row.original.outreach} />,
    },
    {
      id: "stage",
      header: "Stage",
      size: 100,
      accessorFn: (r) => STAGE_ORDER[r.stage],
      cell: ({ row }) => (
        <span
          className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${STAGE_STYLE[row.original.stage]}`}
        >
          {row.original.stage}
        </span>
      ),
    },
    { id: "owner", header: "Owner", size: 120, accessorFn: (r) => r.lead.owner ?? "" },
  ];
}

export function useGridPrefs() {
  const [visibility, setVisibility] = useState<VisibilityState>({});
  const [sizing, setSizing] = useState<ColumnSizingState>({});
  const [density, setDensity] = useState<Density>("compact");
  const loaded = useRef(false);
  useEffect(() => {
    setVisibility(
      readLocal(LS_VIS, { source: false, owner: false, modified: false } as VisibilityState),
    );
    setSizing(readLocal(LS_SIZE, {}));
    setDensity(readLocal<Density>("crm.grid.density", "compact"));
    loaded.current = true;
  }, []);
  useEffect(() => {
    if (loaded.current) writeLocal(LS_VIS, visibility);
  }, [visibility]);
  useEffect(() => {
    if (loaded.current) writeLocal(LS_SIZE, sizing);
  }, [sizing]);
  useEffect(() => {
    if (loaded.current) writeLocal("crm.grid.density", density);
  }, [density]);
  return { visibility, setVisibility, sizing, setSizing, density, setDensity };
}

type Props = {
  rows: CrmRow[];
  selection: RowSelectionState;
  onSelectionChange: (s: RowSelectionState) => void;
  onOpen: (id: string) => void;
  activeId?: string;
  prefs: ReturnType<typeof useGridPrefs>;
};

export function LeadsGrid({ rows, selection, onSelectionChange, onOpen, activeId, prefs }: Props) {
  const columns = useMemo(buildColumns, []);
  const [sorting, setSorting] = useState<SortingState>([{ id: "created", desc: true }]);
  const table = useTable({
    features,
    data: rows,
    columns,
    getRowId: (r) => r.lead.id,
    state: {
      sorting,
      rowSelection: selection,
      columnVisibility: prefs.visibility,
      columnSizing: prefs.sizing,
    },
    onSortingChange: setSorting,
    onRowSelectionChange: (u) => onSelectionChange(typeof u === "function" ? u(selection) : u),
    onColumnVisibilityChange: prefs.setVisibility,
    onColumnSizingChange: prefs.setSizing,
    enableRowSelection: true,
    columnResizeMode: "onChange",
  });

  const parentRef = useRef<HTMLDivElement>(null);
  const rowH = prefs.density === "compact" ? 36 : 48;
  const tableRows = table.getRowModel().rows;
  const virt = useVirtualizer({
    count: tableRows.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => rowH,
    overscan: 12,
  });
  useEffect(() => virt.measure(), [rowH, virt]);
  const totalW = table.getTotalSize();

  return (
    <div
      ref={parentRef}
      className="relative h-full overflow-auto rounded-[var(--radius,14px)] border bg-[var(--surface,#fff)]"
      role="grid"
      aria-rowcount={tableRows.length}
    >
      <div style={{ width: totalW, minWidth: "100%" }}>
        <div
          className="sticky top-0 z-10 flex border-b bg-[var(--surface,#fff)] text-[11px] font-semibold uppercase tracking-wide text-muted-foreground"
          role="row"
        >
          {table.getHeaderGroups()[0].headers.map((h) => (
            <div
              key={h.id}
              role="columnheader"
              className="relative flex h-9 shrink-0 items-center px-2 select-none"
              style={{ width: h.getSize() }}
              aria-sort={
                h.column.getIsSorted() === "asc"
                  ? "ascending"
                  : h.column.getIsSorted() === "desc"
                    ? "descending"
                    : undefined
              }
            >
              {h.column.getCanSort() ? (
                <button
                  type="button"
                  className="flex items-center gap-1 truncate hover:text-foreground"
                  onClick={h.column.getToggleSortingHandler()}
                >
                  {flexRender(h.column.columnDef.header, h.getContext())}
                  {{ asc: "↑", desc: "↓" }[h.column.getIsSorted() as string] ?? ""}
                </button>
              ) : (
                flexRender(h.column.columnDef.header, h.getContext())
              )}
              {h.column.getCanResize() && (
                <div
                  onMouseDown={h.getResizeHandler()}
                  onTouchStart={h.getResizeHandler()}
                  onDoubleClick={() => h.column.resetSize()}
                  className={`absolute top-1 right-0 h-7 w-1 cursor-col-resize rounded ${h.column.getIsResizing() ? "bg-[var(--ch)]" : "hover:bg-border"}`}
                />
              )}
            </div>
          ))}
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
                  if (e.key === "Enter") onOpen(row.id);
                }}
                className={`absolute left-0 flex w-full cursor-pointer items-center border-b text-[13px] transition-colors hover:bg-[color-mix(in_srgb,var(--ch)_6%,transparent)] focus-visible:outline-2 focus-visible:outline-[var(--ch)] ${
                  active || row.getIsSelected()
                    ? "bg-[color-mix(in_srgb,var(--ch)_10%,transparent)]"
                    : ""
                }`}
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
