import { useNavigate } from "@tanstack/react-router";
import { Megaphone, Moon, Sun } from "lucide-react";
import { useMemo } from "react";
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
  CommandShortcut,
} from "@/components/ui/command";
import { ChannelGlyph } from "@/components/shared";
import { useTheme } from "@/hooks/use-theme";
import type { ChannelKey, Conversation } from "@/lib/channels";
import { useMe } from "@/hooks/use-me";
import { visibleNav } from "./nav";

const LEAD_CAP = 250; // per channel; cmdk filters client-side

export function CommandPalette({
  open,
  onOpenChange,
  feeds,
  wall,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  feeds: Partial<Record<"whatsapp" | "sms" | "viber", Conversation[]>>;
  wall?: boolean;
}) {
  const navigate = useNavigate();
  const { theme, toggle } = useTheme();

  const nav = visibleNav(useMe().data?.flags);
  const leads = useMemo(() => {
    const out: { channel: ChannelKey; phone: string; company: string; name: string }[] = [];
    for (const ch of ["whatsapp", "viber", "sms"] as const) {
      const list = [...(feeds[ch] ?? [])]
        .sort((a, b) => (b.lastMessageAt || "").localeCompare(a.lastMessageAt || ""))
        .slice(0, LEAD_CAP);
      for (const c of list)
        out.push({
          channel: ch,
          phone: c.phone,
          company: c.companyName || "",
          name: c.leadName || "",
        });
    }
    return out;
  }, [feeds]);

  function run(fn: () => void) {
    onOpenChange(false);
    fn();
  }
  const go = (to: string, search?: Record<string, string>) =>
    run(() => void navigate({ to: to as "/", search: search as never }));

  return (
    <CommandDialog open={open} onOpenChange={onOpenChange}>
      <CommandInput placeholder="Search leads, companies, pages or actions…" />
      <CommandList className="max-h-[min(420px,60vh)]">
        <CommandEmpty>No matches.</CommandEmpty>
        <CommandGroup heading="Go to">
          {nav
            .filter((n) => !(wall && n.action))
            .map((n) => (
              <CommandItem key={n.to} value={`go ${n.label}`} onSelect={() => go(n.to)}>
                {n.channel ? <ChannelGlyph channel={n.channel} /> : n.icon ? <n.icon /> : null}
                {n.label}
              </CommandItem>
            ))}
        </CommandGroup>
        <CommandSeparator />
        <CommandGroup heading="Actions">
          <CommandItem value="toggle dark mode theme" onSelect={() => run(toggle)}>
            {theme === "dark" ? <Sun /> : <Moon />}
            {theme === "dark" ? "Switch to light mode" : "Switch to dark mode"}
          </CommandItem>
          <CommandItem value="open viber" onSelect={() => go("/viber")}>
            <ChannelGlyph channel="viber" /> Open Viber
          </CommandItem>
          {!wall && (
            <CommandItem value="launch campaign bulk openers" onSelect={() => go("/campaigns")}>
              <Megaphone /> Launch campaign
            </CommandItem>
          )}
        </CommandGroup>
        {leads.length > 0 && (
          <>
            <CommandSeparator />
            <CommandGroup heading="Leads">
              {leads.map((l) => (
                <CommandItem
                  key={`${l.channel}:${l.phone}`}
                  value={`${l.company} ${l.name} ${l.phone} ${l.channel}`}
                  onSelect={() => go(`/${l.channel}`, { phone: l.phone })}
                >
                  <ChannelGlyph channel={l.channel} />
                  <span className="min-w-0 flex-1 truncate">
                    {l.company || l.name || "Unknown"}
                    {l.company && l.name && (
                      <span className="text-muted-foreground"> · {l.name}</span>
                    )}
                  </span>
                  <CommandShortcut className="font-mono-num tracking-normal">
                    {l.phone}
                  </CommandShortcut>
                </CommandItem>
              ))}
            </CommandGroup>
          </>
        )}
      </CommandList>
    </CommandDialog>
  );
}
