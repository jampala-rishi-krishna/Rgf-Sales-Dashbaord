import { useEffect, useState } from "react";
import { ChevronDown, Columns3, Download, Rows3, Search, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { CONVERT_CHANNELS, channelLabel, type ConvertChannel } from "@/lib/conversion";
import { hasActiveFilters, type LeadsSearch } from "@/lib/leads-filters";
import { cn } from "@/lib/utils";
import { LEAD_COLUMNS, type LeadsGridPrefs } from "./LeadsTable";

function MultiSelect<T extends string>({
  label,
  options,
  value,
  onChange,
  render,
}: {
  label: string;
  options: T[];
  value?: T[];
  onChange: (v: T[] | undefined) => void;
  render?: (v: T) => string;
}) {
  const sel = new Set(value ?? []);
  const n = sel.size;
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          size="sm"
          variant="outline"
          className={cn("h-8 gap-1", n > 0 && "border-[var(--rgf-red)] text-[var(--rgf-red)]")}
        >
          {label}
          {n > 0 && (
            <span className="rounded-full bg-[var(--rgf-red)] px-1.5 text-[10px] text-white">
              {n}
            </span>
          )}
          <ChevronDown className="size-3.5 opacity-60" aria-hidden />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="max-h-80 overflow-y-auto">
        <DropdownMenuLabel>{label}</DropdownMenuLabel>
        <DropdownMenuSeparator />
        {options.length === 0 && (
          <div className="px-2 py-1.5 text-xs text-muted-foreground">No values</div>
        )}
        {options.map((o) => (
          <DropdownMenuCheckboxItem
            key={o}
            checked={sel.has(o)}
            onSelect={(e) => e.preventDefault()}
            onCheckedChange={(on) => {
              const next = new Set(sel);
              if (on) next.add(o);
              else next.delete(o);
              onChange(next.size ? Array.from(next) : undefined);
            }}
          >
            {render ? render(o) : o}
          </DropdownMenuCheckboxItem>
        ))}
        {n > 0 && (
          <>
            <DropdownMenuSeparator />
            <button
              type="button"
              className="w-full px-2 py-1.5 text-left text-xs text-muted-foreground hover:text-foreground"
              onClick={() => onChange(undefined)}
            >
              Clear
            </button>
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

const inputCls =
  "h-8 rounded-md border bg-[var(--surface,#fff)] px-2 text-xs focus-visible:outline-2 focus-visible:outline-[var(--rgf-red)]";

export function LeadsToolbar({
  search,
  setSearch,
  statuses,
  owners,
  prefs,
  shown,
  total,
  onExport,
}: {
  search: LeadsSearch;
  setSearch: (patch: Partial<LeadsSearch>) => void;
  statuses: string[];
  owners: string[];
  prefs: LeadsGridPrefs;
  shown: number;
  total: number;
  onExport: () => void;
}) {
  // Debounce typing into the URL.
  const [q, setQ] = useState(search.q ?? "");
  useEffect(() => setQ(search.q ?? ""), [search.q]);
  useEffect(() => {
    if ((search.q ?? "") === q) return;
    const t = setTimeout(() => setSearch({ q: q.trim() || undefined }), 250);
    return () => clearTimeout(t);
  }, [q, search.q, setSearch]);

  return (
    <div className="flex flex-wrap items-center gap-2">
      <label className="relative w-full sm:w-64">
        <Search
          className="pointer-events-none absolute top-1/2 left-2 size-3.5 -translate-y-1/2 text-muted-foreground"
          aria-hidden
        />
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search name, company, phone, email…"
          aria-label="Search leads"
          className={cn(inputCls, "w-full pl-7 text-sm")}
        />
      </label>
      <MultiSelect
        label="Status"
        options={statuses}
        value={search.status}
        onChange={(status) => setSearch({ status })}
      />
      <MultiSelect
        label="Owner"
        options={owners}
        value={search.owner}
        onChange={(owner) => setSearch({ owner })}
      />
      <MultiSelect<ConvertChannel>
        label="Source"
        options={CONVERT_CHANNELS}
        value={search.channel}
        onChange={(channel) => setSearch({ channel })}
        render={channelLabel}
      />
      <div className="flex items-center gap-1 text-xs text-muted-foreground">
        <span className="hidden lg:inline">Became Lead</span>
        <input
          type="date"
          aria-label="Became Lead from"
          className={inputCls}
          value={search.from ?? ""}
          max={search.to}
          onChange={(e) => setSearch({ from: e.target.value || undefined })}
        />
        <span aria-hidden>–</span>
        <input
          type="date"
          aria-label="Became Lead to"
          className={inputCls}
          value={search.to ?? ""}
          min={search.from}
          onChange={(e) => setSearch({ to: e.target.value || undefined })}
        />
      </div>
      <label className="flex h-8 cursor-pointer items-center gap-1.5 rounded-md border px-2 text-xs">
        <input
          type="checkbox"
          className="size-3.5 accent-[var(--rgf-red)]"
          checked={!!search.dash}
          onChange={(e) => setSearch({ dash: e.target.checked || undefined })}
        />
        Converted from dashboard only
      </label>
      {hasActiveFilters(search) && (
        <Button
          size="sm"
          variant="ghost"
          className="h-8 gap-1 text-xs"
          onClick={() =>
            setSearch({
              q: undefined,
              status: undefined,
              owner: undefined,
              channel: undefined,
              from: undefined,
              to: undefined,
              dash: undefined,
            })
          }
        >
          <X className="size-3.5" aria-hidden /> Clear
        </Button>
      )}

      <div className="ml-auto flex items-center gap-2">
        <span className="text-xs text-muted-foreground tabular-nums" aria-live="polite">
          {shown.toLocaleString()} of {total.toLocaleString()}
        </span>
        <Button
          size="sm"
          variant="outline"
          className="hidden h-8 gap-1 md:inline-flex"
          aria-pressed={prefs.density === "comfortable"}
          onClick={() => prefs.setDensity(prefs.density === "compact" ? "comfortable" : "compact")}
        >
          <Rows3 className="size-3.5" aria-hidden />
          {prefs.density === "compact" ? "Comfortable" : "Compact"}
        </Button>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button size="sm" variant="outline" className="hidden h-8 gap-1 md:inline-flex">
              <Columns3 className="size-3.5" aria-hidden /> Columns
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuLabel>Show columns</DropdownMenuLabel>
            <DropdownMenuSeparator />
            {LEAD_COLUMNS.filter((c) => c.hideable).map((c) => (
              <DropdownMenuCheckboxItem
                key={c.id}
                checked={prefs.visibility[c.id] !== false}
                onSelect={(e) => e.preventDefault()}
                onCheckedChange={(on) => prefs.setVisibility((v) => ({ ...v, [c.id]: !!on }))}
              >
                {c.label}
              </DropdownMenuCheckboxItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
        <Button
          size="sm"
          variant="outline"
          className="h-8 gap-1"
          onClick={onExport}
          disabled={!shown}
        >
          <Download className="size-3.5" aria-hidden /> CSV
        </Button>
      </div>
    </div>
  );
}
