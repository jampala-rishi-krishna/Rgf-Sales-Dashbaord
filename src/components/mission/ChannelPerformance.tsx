import { useMemo } from "react";
import { ChannelGlyph } from "@/components/shared";
import { CHANNELS, hasReplied, type Conversation } from "@/lib/channels";
import { fmtDurationShort, manilaDate, median, type ConvChannel, type MissionData } from "./data";

const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const CONV: ConvChannel[] = ["whatsapp", "sms", "viber"];

function firstReplyMs(c: Conversation) {
  const firstOut = c.messages.find((m) => m.role !== "customer")?.ts;
  const firstIn = c.messages.find((m) => m.role === "customer")?.ts;
  if (!firstOut || !firstIn) return null;
  const d = Date.parse(firstIn) - Date.parse(firstOut);
  return d >= 0 ? d : null;
}

export function ChannelPerformance({ data }: { data: MissionData }) {
  const { rows, heat, heatMax, products } = useMemo(() => {
    const rows = CONV.map((ch) => {
      const cs = data.convs[ch];
      const replied = cs.filter(hasReplied);
      const ttfr = median(cs.map(firstReplyMs).filter((x): x is number => x != null));
      return {
        ch,
        total: cs.length,
        rate: cs.length ? (replied.length / cs.length) * 100 : 0,
        ttfr,
      };
    });
    const webEngaged = data.sessions.filter((s) =>
      (s.messages ?? []).some((m) => m.sender === "visitor"),
    ).length;

    const heat = Array.from({ length: 7 }, () => new Array(24).fill(0) as number[]);
    const addHeat = (ts?: string) => {
      if (!ts || Number.isNaN(Date.parse(ts))) return;
      const m = manilaDate(ts);
      heat[m.getUTCDay()][m.getUTCHours()]++;
    };
    for (const ch of CONV)
      for (const c of data.convs[ch])
        for (const m of c.messages ?? []) if (m.role === "customer") addHeat(m.ts);
    for (const s of data.sessions)
      for (const m of s.messages ?? []) if (m.sender === "visitor") addHeat(m.timestamp);
    const heatMax = Math.max(1, ...heat.flat());

    const pc = new Map<string, number>();
    for (const ch of CONV)
      for (const c of data.convs[ch].filter(hasReplied)) {
        const p = (c.product ?? "").trim();
        if (p) pc.set(p, (pc.get(p) ?? 0) + 1);
      }
    const products = [...pc.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5);
    return {
      rows: [
        ...rows,
        {
          ch: "web" as const,
          total: data.sessions.length,
          rate: data.sessions.length ? (webEngaged / data.sessions.length) * 100 : 0,
          ttfr: NaN,
        },
      ],
      heat,
      heatMax,
      products,
    };
  }, [data.convs, data.sessions]);

  const productMax = Math.max(1, ...products.map((p) => p[1]));

  return (
    <section
      aria-label="Channel performance"
      className="rounded-2xl border bg-[var(--surface,#fff)] p-4 shadow-sm"
      style={{ borderColor: "var(--border,#EDE6DC)" }}
    >
      <h2 className="mb-3 text-sm font-bold" style={{ color: "var(--rgf-ink,#1B2419)" }}>
        Channel performance
      </h2>
      <div className="grid gap-6 lg:grid-cols-12">
        <div className="lg:col-span-4">
          <table className="w-full text-xs">
            <thead>
              <tr
                className="text-left text-[10px] uppercase tracking-wide"
                style={{ color: "var(--muted-foreground,#6B6F68)" }}
              >
                <th className="pb-1 font-semibold">Channel</th>
                <th className="pb-1 text-right font-semibold">Response</th>
                <th className="pb-1 text-right font-semibold">Median TTFR</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr
                  key={r.ch}
                  className="border-t"
                  style={{ borderColor: "var(--border,#EDE6DC)" }}
                >
                  <td className="py-1.5">
                    <span className="flex items-center gap-1.5">
                      <ChannelGlyph channel={r.ch} size={12} /> {CHANNELS[r.ch].label}
                      <span className="text-[10px]" style={{ color: "var(--muted-foreground,#6B6F68)" }}>
                        ({r.total})
                      </span>
                    </span>
                  </td>
                  <td className="py-1.5 text-right">
                    <span className="inline-flex items-center gap-1.5">
                      <span className="h-1.5 w-12 overflow-hidden rounded-full bg-black/5">
                        <span
                          className="block h-full"
                          style={{ width: `${r.rate}%`, background: CHANNELS[r.ch].color }}
                        />
                      </span>
                      <span className="w-10 font-mono tabular-nums">{r.rate.toFixed(1)}%</span>
                    </span>
                  </td>
                  <td className="py-1.5 text-right font-mono tabular-nums">
                    {fmtDurationShort(r.ttfr)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="lg:col-span-5">
          <div
            className="mb-1 text-[10px] font-semibold uppercase tracking-wide"
            style={{ color: "var(--muted-foreground,#6B6F68)" }}
          >
            Best hours for replies (Manila)
          </div>
          <div className="overflow-x-auto">
            <div
              className="grid min-w-[420px] gap-[2px]"
              style={{ gridTemplateColumns: "28px repeat(24, minmax(0,1fr))" }}
            >
              <span />
              {Array.from({ length: 24 }, (_, h) => (
                <span
                  key={h}
                  className="text-center font-mono text-[8px]"
                  style={{ color: "var(--muted-foreground,#6B6F68)" }}
                >
                  {h % 3 === 0 ? h : ""}
                </span>
              ))}
              {heat.map((row, d) => (
                <HeatRow key={d} label={DAYS[d]} row={row} max={heatMax} />
              ))}
            </div>
          </div>
        </div>

        <div className="lg:col-span-3">
          <div
            className="mb-1 text-[10px] font-semibold uppercase tracking-wide"
            style={{ color: "var(--muted-foreground,#6B6F68)" }}
          >
            Top products (replied leads)
          </div>
          {products.length ? (
            <ul className="space-y-1.5">
              {products.map(([p, n]) => (
                <li key={p} className="text-xs">
                  <div className="flex justify-between gap-2">
                    <span className="truncate">{p}</span>
                    <span className="font-mono tabular-nums">{n}</span>
                  </div>
                  <div className="h-1.5 overflow-hidden rounded-full bg-black/5">
                    <div
                      className="h-full rounded-full"
                      style={{
                        width: `${(n / productMax) * 100}%`,
                        background: "var(--rgf-green,#33673B)",
                      }}
                    />
                  </div>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-xs" style={{ color: "var(--muted-foreground,#6B6F68)" }}>
              No product data yet.
            </p>
          )}
        </div>
      </div>
    </section>
  );
}

function HeatRow({ label, row, max }: { label: string; row: number[]; max: number }) {
  return (
    <>
      <span className="text-[9px] leading-[14px]" style={{ color: "var(--muted-foreground,#6B6F68)" }}>
        {label}
      </span>
      {row.map((v, h) => (
        <span
          key={h}
          title={`${label} ${h}:00 — ${v} replies`}
          className="h-3.5 rounded-[2px]"
          style={{
            background: v ? `rgba(51,103,59,${0.12 + 0.88 * (v / max)})` : "rgba(0,0,0,.04)",
          }}
        />
      ))}
    </>
  );
}
