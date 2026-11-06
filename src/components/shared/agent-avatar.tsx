import { CHANNELS, type ChannelKey } from "@/lib/channels";
import { cn } from "@/lib/utils";

type AgentName = "Martin" | "Mara" | "Scout";

const AGENT_STYLE: Record<AgentName, { initials: string; from: string; to: string; role: string }> =
  {
    Martin: { initials: "M", from: "#86000B", to: "#C2410C", role: "Sales agent" },
    Mara: { initials: "Ma", from: "#F97316", to: "#DB2777", role: "Voice agent" },
    Scout: { initials: "S", from: "#0EA5A4", to: "#33673B", role: "Lead scout" },
  };

export function AgentAvatar({
  agent,
  channel,
  size = 36,
  className,
}: {
  agent: AgentName;
  channel?: ChannelKey;
  size?: number;
  className?: string;
}) {
  const s = AGENT_STYLE[agent] ?? AGENT_STYLE.Martin;
  const ring = channel ? CHANNELS[channel].color : s.from;
  return (
    <span
      role="img"
      aria-label={`${agent}, ${s.role}`}
      title={`${agent} · ${s.role}`}
      className={cn(
        "relative inline-flex shrink-0 items-center justify-center overflow-hidden rounded-full font-semibold text-white select-none",
        className,
      )}
      style={{
        width: size,
        height: size,
        fontSize: Math.max(10, size * 0.38),
        background: `radial-gradient(circle at 30% 22%, rgba(255,255,255,.38), transparent 46%), linear-gradient(135deg, ${s.from}, ${s.to})`,
        boxShadow: `0 0 0 2px var(--background, #fff), 0 0 0 ${size > 28 ? 4 : 3}px ${ring}`,
      }}
    >
      {/* soft "shoulders" silhouette so it reads as a character, not just a badge */}
      <span
        aria-hidden
        className="absolute -bottom-[30%] left-1/2 h-[60%] w-[90%] -translate-x-1/2 rounded-full bg-white/15"
      />
      <span className="relative tracking-tight">{s.initials}</span>
    </span>
  );
}
