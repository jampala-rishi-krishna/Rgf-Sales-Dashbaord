import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { fetchSheet, SMS_SHEET_ID, type SmsRow } from "@/lib/sheets";

export const Route = createFileRoute("/_app/sms")({
  component: SmsTab,
});

function SmsTab() {
  const { data, isLoading } = useQuery({
    queryKey: ["sms"],
    queryFn: () => fetchSheet<SmsRow>(SMS_SHEET_ID, "Sent Log"),
    refetchInterval: 60000,
  });
  const [search, setSearch] = useState("");
  const [idx, setIdx] = useState<number | null>(null);

  const rows = useMemo(() => {
    const sorted = [...(data ?? [])].sort((a, b) =>
      (`${b.Date_Sent} ${b.Time_Sent}`).localeCompare(`${a.Date_Sent} ${a.Time_Sent}`)
    );
    const q = search.toLowerCase();
    if (!q) return sorted;
    return sorted.filter((r) => [r.Company_Name, r.Phone, r.Message_Sent].join(" ").toLowerCase().includes(q));
  }, [data, search]);

  const sel = idx !== null ? rows[idx] : null;

  return (
    <div className="bg-white rounded-xl shadow-sm overflow-hidden grid grid-cols-1 md:grid-cols-[35%_65%]" style={{ height: "calc(100vh - 7rem - 1rem)" }}>
      <div className="border-r flex flex-col min-h-0" style={{ backgroundColor: "#FFEBCE" }}>
        <div className="p-3 border-b shrink-0">
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search by company or phone…"
            className="w-full px-3 py-2 text-sm rounded-md border border-gray-300 bg-white focus:outline-none" />
        </div>
        <div className="overflow-y-auto flex-1">
          {isLoading && <div className="p-4 text-sm text-gray-500">Loading…</div>}
          {!isLoading && rows.length === 0 && (
            <div className="p-8 text-center text-gray-400">
              <div className="text-2xl mb-2">📱</div>
              <div className="font-medium">No SMS sent yet</div>
              <div className="text-sm mt-1">SMS campaign hasn't been triggered.</div>
            </div>
          )}
          {rows.map((r, i) => {
            const s = idx === i;
            return (
              <button key={i} onClick={() => setIdx(i)}
                className="w-full text-left px-4 py-3 border-b hover:bg-white"
                style={{ backgroundColor: s ? "#FFFFFF" : "transparent", borderLeft: s ? "3px solid #86000B" : "3px solid transparent" }}>
                <div className="flex items-baseline gap-2">
                  <div className="font-bold text-sm truncate flex-1" style={{ color: "#1B2419" }}>{r.Company_Name}</div>
                  <div className="text-[10px] text-gray-500">{r.Date_Sent}</div>
                </div>
                <div className="text-xs text-gray-500">{r.Phone}</div>
              </button>
            );
          })}
        </div>
      </div>

      <div className="flex flex-col min-h-0" style={{ backgroundColor: "#1B2419" }}>
        {!sel ? (
          <div className="h-full flex items-center justify-center text-gray-500 text-sm">Select an SMS to view</div>
        ) : (
          <>
            <div className="px-5 py-3 shrink-0" style={{ backgroundColor: "#86000B" }}>
              <div className="text-white font-bold">{sel.Company_Name}</div>
              <div className="text-white/80 text-xs">{sel.Phone}</div>
            </div>
            <div className="flex-1 min-h-0 overflow-y-auto p-6 space-y-2">
              <div className="max-w-md">
                <div className="bg-gray-700 text-white rounded-2xl rounded-bl-sm px-4 py-3 text-sm leading-relaxed shadow">
                  {sel.Message_Sent}
                </div>
                <div className="text-[10px] text-gray-500 mt-1 ml-2">{sel.Date_Sent} {sel.Time_Sent}</div>
              </div>
            </div>
            <div className="px-5 py-3 bg-black/30 text-xs text-gray-300 flex gap-4 items-center">
              <span><span className="text-gray-500">Product:</span> {sel.Product_Offered}</span>
              <span><span className="text-gray-500">Channel:</span> {sel.Channel}</span>
              <span className="ml-auto px-2 py-0.5 rounded-full text-[10px] font-semibold" style={{ backgroundColor: "#33673B", color: "white" }}>
                {sel.Status || "Sent"}
              </span>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
