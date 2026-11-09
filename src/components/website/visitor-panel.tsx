import type { ReactNode } from "react";
import { Briefcase, Clock, Globe, Mail, MapPin, MessageSquare, Phone, X } from "lucide-react";
import { formatManila } from "@/lib/channels";
import { initials, location, sessionLabel, statusMeta, type WebsiteChatSession } from "./types";

export function VisitorPanel({
  session,
  onClose,
}: {
  session: WebsiteChatSession;
  onClose?: () => void;
}) {
  const st = statusMeta(session.status);
  const name = sessionLabel(session);
  return (
    <div className="flex h-full min-h-0 flex-col bg-white">
      <div className="flex shrink-0 items-center justify-between border-b border-[#e0d6c8] px-4 py-3">
        <div className="text-xs font-semibold uppercase tracking-wider text-[#86000B]">
          Visitor info
        </div>
        {onClose && (
          <button
            type="button"
            onClick={onClose}
            aria-label="Close visitor info"
            className="rounded-full p-1 text-[#6b6b6b] hover:bg-[#FFF8F0]"
          >
            <X className="size-4" />
          </button>
        )}
      </div>
      <div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-4">
        <div className="flex flex-col items-center gap-2 text-center">
          <div className="grid size-16 place-items-center rounded-full bg-[#FFEBCE] text-lg font-bold text-[#86000B] ring-2 ring-[#86000B]/15">
            {initials(name)}
          </div>
          <div className="font-semibold text-[#1B2419]">{name}</div>
          <span className={`rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${st.cls}`}>
            {st.label}
          </span>
        </div>
        <dl className="space-y-2.5 text-sm">
          <Row
            icon={<Mail className="size-4" />}
            label="Email"
            value={session.visitorEmail}
            href={session.visitorEmail ? `mailto:${session.visitorEmail}` : undefined}
          />
          <Row
            icon={<Phone className="size-4" />}
            label="Phone"
            value={session.visitorPhone}
            mono
          />
          <Row
            icon={<Briefcase className="size-4" />}
            label="Business"
            value={[session.businessType, session.businessSegment].filter(Boolean).join(" · ")}
          />
          <Row icon={<MapPin className="size-4" />} label="Location" value={location(session)} />
          <Row
            icon={<Globe className="size-4" />}
            label="Page"
            value={session.pageUrl}
            href={session.pageUrl || undefined}
          />
          <Row
            icon={<MessageSquare className="size-4" />}
            label="Stage"
            value={session.conversationStage}
          />
          <Row
            icon={<MessageSquare className="size-4" />}
            label="Messages"
            value={String(session.messageCount ?? session.messages?.length ?? 0)}
          />
          <Row
            icon={<Clock className="size-4" />}
            label="First seen"
            value={formatManila(session.firstSeenAt)}
          />
          <Row
            icon={<Clock className="size-4" />}
            label="Last message"
            value={formatManila(session.lastMessageAt)}
          />
        </dl>
        <div className="rounded-lg bg-[#FFF8F0] px-3 py-2 font-mono text-[10px] text-[#8a8a8a] ring-1 ring-[#e0d6c8]">
          Session {session.sessionId}
        </div>
      </div>
    </div>
  );
}

function Row({
  icon,
  label,
  value,
  href,
  mono,
}: {
  icon: ReactNode;
  label: string;
  value?: string;
  href?: string;
  mono?: boolean;
}) {
  if (!value) return null;
  return (
    <div className="flex items-start gap-2.5">
      <span className="mt-0.5 text-[#86000B]/70">{icon}</span>
      <div className="min-w-0 flex-1">
        <dt className="text-[10px] font-semibold uppercase tracking-wider text-[#8a8a8a]">
          {label}
        </dt>
        <dd className={`break-words text-[#1B2419] ${mono ? "font-mono text-[13px]" : ""}`}>
          {href ? (
            <a
              href={href}
              target={href.startsWith("http") ? "_blank" : undefined}
              rel="noopener noreferrer"
              className="text-[#86000B] underline-offset-2 hover:underline"
            >
              {value}
            </a>
          ) : (
            value
          )}
        </dd>
      </div>
    </div>
  );
}
