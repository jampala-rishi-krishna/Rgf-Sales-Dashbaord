import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { SAVED_VIEWS, type CrmSearch } from "@/components/crm/crm-utils";
import { COLUMN_LABELS, type useGridPrefs } from "@/components/crm/leads-grid";

type Props = {
  search: CrmSearch;
  setSearch: (patch: Partial<CrmSearch>, reset?: boolean) => void;
  facets: { seg: string[]; prod: string[]; prov: string[] };
  prefs: ReturnType<typeof useGridPrefs>;
  shown: number;
  total: number;
  onExport: () => void;
};

const selectCls =
  "h-8 rounded-md border bg-[var(--surface,#fff)] px-2 text-xs focus-visible:outline-2 focus-visible:outline-[var(--ch)]";

function Facet({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value?: string;
  options: { v: string; l: string }[];
  onChange: (v?: string) => void;
}) {
  return (
    <select
      aria-label={label}
      className={selectCls}
      value={value ?? ""}
      onChange={(e) => onChange(e.target.value || undefined)}
    >
      <option value="">{label}: All</option>
      {options.map((o) => (
        <option key={o.v} value={o.v}>
          {o.l}
        </option>
      ))}
    </select>
  );
}

export function CrmToolbar({ search, setSearch, facets, prefs, shown, total, onExport }: Props) {
  const [q, setQ] = useState(search.q ?? "");
  useEffect(() => setQ(search.q ?? ""), [search.q]);
  useEffect(() => {
    if ((search.q ?? "") === q) return;
    const t = setTimeout(() => setSearch({ q: q || undefined, view: undefined }), 200);
    return () => clearTimeout(t);
  }, [q, search.q, setSearch]);

  const opts = (xs: string[], lower = false) =>
    xs.map((x) => ({ v: lower ? x.toLowerCase() : x, l: x }));
  const active = Object.entries(search).some(([k, v]) => k !== "lead" && v !== undefined);

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        <Input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search company, name, phone, email…"
          aria-label="Search leads"
          className="h-8 w-full max-w-xs text-sm"
        />
        <div className="flex flex-wrap gap-1" role="group" aria-label="Saved views">
          {SAVED_VIEWS.map((v) => (
            <Button
              key={v.id}
              size="sm"
              variant={search.view === v.id ? "default" : "outline"}
              className={
                search.view === v.id
                  ? "h-8 bg-[var(--ch)] text-white hover:bg-[var(--ch)]/90"
                  : "h-8"
              }
              onClick={() =>
                setSearch(search.view === v.id ? {} : { ...v.search, view: v.id }, true)
              }
            >
              {v.label}
            </Button>
          ))}
        </div>
        <div className="ml-auto flex items-center gap-2">
          <span className="text-xs text-muted-foreground tabular-nums">
            {shown.toLocaleString()} of {total.toLocaleString()}
          </span>
          <Button
            size="sm"
            variant="outline"
            className="h-8"
            onClick={() =>
              prefs.setDensity(prefs.density === "compact" ? "comfortable" : "compact")
            }
          >
            {prefs.density === "compact" ? "Comfortable" : "Compact"}
          </Button>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button size="sm" variant="outline" className="h-8">
                Columns
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuLabel>Show columns</DropdownMenuLabel>
              <DropdownMenuSeparator />
              {Object.entries(COLUMN_LABELS).map(([id, label]) => (
                <DropdownMenuCheckboxItem
                  key={id}
                  checked={prefs.visibility[id] !== false}
                  onSelect={(e) => e.preventDefault()}
                  onCheckedChange={(c) => prefs.setVisibility((p) => ({ ...p, [id]: !!c }))}
                >
                  {label}
                </DropdownMenuCheckboxItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
          <Button size="sm" variant="outline" className="h-8" onClick={onExport}>
            Export CSV
          </Button>
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <Facet
          label="Segment"
          value={search.seg}
          options={opts(facets.seg, true)}
          onChange={(v) => setSearch({ seg: v, view: undefined })}
        />
        <Facet
          label="Product"
          value={search.prod}
          options={opts(facets.prod, true)}
          onChange={(v) => setSearch({ prod: v, view: undefined })}
        />
        <Facet
          label="Province"
          value={search.prov}
          options={opts(facets.prov, true)}
          onChange={(v) => setSearch({ prov: v, view: undefined })}
        />
        <Facet
          label="Contacted"
          value={search.contacted}
          options={[
            { v: "any", l: "Any channel" },
            { v: "never", l: "Never contacted" },
            { v: "whatsapp", l: "On WhatsApp" },
            { v: "sms", l: "On SMS" },
            { v: "viber", l: "On Viber" },
            { v: "call", l: "By call" },
            { v: "web", l: "On website" },
          ]}
          onChange={(v) => setSearch({ contacted: v as CrmSearch["contacted"], view: undefined })}
        />
        <Facet
          label="Replied"
          value={search.replied}
          options={[
            { v: "yes", l: "Yes" },
            { v: "no", l: "No" },
          ]}
          onChange={(v) => setSearch({ replied: v as CrmSearch["replied"], view: undefined })}
        />
        <Facet
          label="Meeting"
          value={search.meeting}
          options={[
            { v: "yes", l: "Yes" },
            { v: "no", l: "No" },
          ]}
          onChange={(v) => setSearch({ meeting: v as CrmSearch["meeting"], view: undefined })}
        />
        <label className="flex items-center gap-1 text-xs text-muted-foreground">
          Created
          <input
            type="date"
            aria-label="Created from"
            className={selectCls}
            value={search.from ?? ""}
            onChange={(e) => setSearch({ from: e.target.value || undefined, view: undefined })}
          />
          –
          <input
            type="date"
            aria-label="Created to"
            className={selectCls}
            value={search.to ?? ""}
            onChange={(e) => setSearch({ to: e.target.value || undefined, view: undefined })}
          />
        </label>
        {active && (
          <Button
            size="sm"
            variant="ghost"
            className="h-8 text-xs"
            onClick={() => setSearch({}, true)}
          >
            Reset filters
          </Button>
        )}
      </div>
    </div>
  );
}
