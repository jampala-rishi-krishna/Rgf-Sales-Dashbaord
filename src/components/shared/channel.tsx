import type { ComponentType, CSSProperties } from "react";
import { SiGmail, SiViber, SiWhatsapp } from "react-icons/si";
import { Database, Globe, MessageSquare, Phone, Radar } from "lucide-react";
import { CHANNELS, type ChannelKey } from "@/lib/channels";
import { cn } from "@/lib/utils";

type IconCmp = ComponentType<{
  size?: number | string;
  className?: string;
  style?: CSSProperties;
  "aria-hidden"?: boolean;
}>;

const ICONS: Record<ChannelKey, IconCmp> = {
  whatsapp: SiWhatsapp as IconCmp,
  viber: SiViber as IconCmp,
  email: SiGmail as IconCmp,
  sms: MessageSquare as IconCmp,
  voice: Phone as IconCmp,
  web: Globe as IconCmp,
  crm: Database as IconCmp,
  scout: Radar as IconCmp,
};

export function ChannelGlyph({
  channel,
  size = 16,
  className,
}: {
  channel: ChannelKey;
  size?: number;
  className?: string;
}) {
  const Icon = ICONS[channel] ?? Globe;
  return (
    <Icon
      size={size}
      className={cn("shrink-0", className)}
      style={{ color: CHANNELS[channel]?.color }}
      aria-hidden
    />
  );
}

export function ChannelDot({ channel, className }: { channel: ChannelKey; className?: string }) {
  return (
    <span
      aria-hidden
      className={cn("inline-block size-2 shrink-0 rounded-full", className)}
      style={{ backgroundColor: CHANNELS[channel]?.color }}
    />
  );
}

export function ChannelBadge({ channel, className }: { channel: ChannelKey; className?: string }) {
  const c = CHANNELS[channel];
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium whitespace-nowrap",
        className,
      )}
      style={{
        backgroundColor: `color-mix(in srgb, ${c.color} 12%, transparent)`,
        color: `color-mix(in srgb, ${c.color} 70%, var(--foreground))`,
      }}
    >
      <ChannelGlyph channel={channel} size={12} />
      {c.label}
    </span>
  );
}
