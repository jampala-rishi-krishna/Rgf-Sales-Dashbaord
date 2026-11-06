import type { ReactNode } from "react";
import { AnimatedNumber } from "./live";

function Sparkline({ data, color }: { data: number[]; color: string }) {
  if (data.length < 2) return null;
  const w = 80;
  const h = 24;
  const max = Math.max(...data);
  const min = Math.min(...data);
  const range = max - min || 1;
  const pts = data.map(
    (d, i) => [(i / (data.length - 1)) * w, h - 2 - ((d - min) / range) * (h - 4)] as const,
  );
  const line = pts.map(([x, y], i) => `${i ? "L" : "M"}${x.toFixed(1)},${y.toFixed(1)}`).join(" ");
  const last = pts[pts.length - 1];
  return (
    <svg
      width={w}
      height={h}
      viewBox={`0 0 ${w} ${h}`}
      aria-hidden
      className="shrink-0 overflow-visible"
    >
      <path d={`${line} L${w},${h} L0,${h} Z`} fill={color} opacity={0.12} />
      <path
        d={line}
        fill="none"
        stroke={color}
        strokeWidth={1.5}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle cx={last[0]} cy={last[1]} r={2} fill={color} />
    </svg>
  );
}

export function StatCard({
  label,
  value,
  format,
  hint,
  spark,
  color = "var(--rgf-red)",
  icon,
}: {
  label: string;
  value: number;
  format?: (n: number) => string;
  hint?: string;
  spark?: number[];
  color?: string;
  icon?: ReactNode;
}) {
  return (
    <div className="rgf-card flex min-w-0 flex-col gap-1 p-4">
      <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
        {icon && (
          <span
            className="inline-flex size-6 items-center justify-center rounded-md [&_svg]:size-3.5"
            style={{ color, backgroundColor: `color-mix(in srgb, ${color} 12%, transparent)` }}
          >
            {icon}
          </span>
        )}
        <span className="truncate">{label}</span>
      </div>
      <div className="flex items-end justify-between gap-2">
        <AnimatedNumber
          value={value}
          format={format}
          className="text-2xl font-semibold tracking-tight text-foreground"
        />
        {spark && <Sparkline data={spark} color={color} />}
      </div>
      {hint && <div className="truncate text-xs text-muted-foreground">{hint}</div>}
    </div>
  );
}
