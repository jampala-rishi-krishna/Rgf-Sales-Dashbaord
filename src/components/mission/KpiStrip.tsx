import { useMemo } from "react";
import { CalendarCheck, MessageCircleReply, Percent, Send, ShieldAlert, Users } from "lucide-react";
import { StatCard } from "@/components/shared";
import { usePreLeads } from "@/hooks/use-pre-leads";
import { hasReplied } from "@/lib/channels";
import { computeNeedsHuman, dailySeries, emailRowTs, isToday, type MissionData } from "./data";

export function KpiStrip({ data }: { data: MissionData }) {
  const pre = usePreLeads();
  const k = useMemo(() => {
    const convs = [...data.convs.whatsapp, ...data.convs.sms, ...data.convs.viber];
    const openerTs = convs.map((c) => c.messages?.find((m) => m.role === "martin")?.ts);
    const emailTs = data.emailRows.map(emailRowTs);
    const callTs = data.calls.map((c) => c.createdAt);
    const contactedToday = [...openerTs, ...emailTs, ...callTs].filter((t) => isToday(t)).length;

    const replied = convs.filter(hasReplied);
    const firstReplyTs = replied.map((c) => c.messages.find((m) => m.role === "customer")?.ts);
    const repliesToday = convs.filter(
      (c) => hasReplied(c) && c.messages.some((m) => m.role === "customer" && isToday(m.ts)),
    ).length;
    const replyRate = convs.length ? (replied.length / convs.length) * 100 : 0;

    const weekAgo = Date.now() - 7 * 86_400_000;
    const meetings = convs.filter(
      (c) => c.meetingScheduled && Date.parse(c.lastUpdated || c.lastMessageAt) >= weekAgo,
    );
    const escalations = computeNeedsHuman(data);
    const leads = pre.data?.leads ?? [];

    return {
      leads: leads.length,
      leadsSpark: dailySeries(leads.map((l) => l.createdTime)),
      contactedToday,
      contactedSpark: dailySeries([...openerTs, ...emailTs, ...callTs]),
      repliesToday,
      repliesSpark: dailySeries(firstReplyTs),
      replyRate,
      meetings: meetings.length,
      meetingsSpark: dailySeries(convs.filter((c) => c.meetingScheduled).map((c) => c.lastUpdated)),
      escalations: escalations.length,
    };
  }, [data, pre.data]);

  return (
    <section
      aria-label="Key metrics"
      className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6"
    >
      <StatCard
        label="Leads in CRM"
        value={k.leads}
        spark={k.leadsSpark}
        color="#226DB4"
        icon={<Users className="h-4 w-4" />}
        hint={pre.data?.connected === false ? "CRM not connected" : undefined}
      />
      <StatCard
        label="Contacted today"
        value={k.contactedToday}
        spark={k.contactedSpark}
        color="#33673B"
        icon={<Send className="h-4 w-4" />}
      />
      <StatCard
        label="Replies today"
        value={k.repliesToday}
        spark={k.repliesSpark}
        color="#25D366"
        icon={<MessageCircleReply className="h-4 w-4" />}
        hint="Real two-way replies"
      />
      <StatCard
        label="Reply rate"
        value={k.replyRate}
        format={(n: number) => `${n.toFixed(1)}%`}
        color="#7360F2"
        icon={<Percent className="h-4 w-4" />}
        hint="WhatsApp · SMS · Viber"
      />
      <StatCard
        label="Meetings (7d)"
        value={k.meetings}
        spark={k.meetingsSpark}
        color="#F97316"
        icon={<CalendarCheck className="h-4 w-4" />}
      />
      <StatCard
        label="Escalations open"
        value={k.escalations}
        color="#86000B"
        icon={<ShieldAlert className="h-4 w-4" />}
      />
    </section>
  );
}
