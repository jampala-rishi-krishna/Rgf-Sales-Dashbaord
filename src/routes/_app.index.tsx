import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { fetchSheet, EMAIL_SHEET_ID, SMS_SHEET_ID, type EmailRow, type SmsRow } from "@/lib/sheets";
import { Mail, MessageSquare, Phone, MessageCircle } from "lucide-react";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, LineChart, Line } from "recharts";

export const Route = createFileRoute("/_app/")({
  component: Overview,
});

interface VapiCall { id: string; createdAt: string; endedAt?: string; status?: string; customer?: { number?: string }; }

interface WAMessage { role: "customer" | "martin"; content: string; ts: string; }
interface WAConversation {
  phone: string;
  leadName: string;
  companyName: string;
  lastMessageAt: string;
  lastMessagePreview: string;
  messages: WAMessage[];
}

function useEmails() {
  return useQuery({ queryKey: ["emails"], queryFn: () => fetchSheet<EmailRow>(EMAIL_SHEET_ID, "Sent Log"), refetchInterval: 60000 });
}
function useSms() {
  return useQuery({ queryKey: ["sms"], queryFn: () => fetchSheet<SmsRow>(SMS_SHEET_ID, "Sent Log"), refetchInterval: 60000 });
}
function useWhatsApp() {
  return useQuery({
    queryKey: ["whatsapp-conversations"],
    queryFn: async () => {
      const r = await fetch("/api/whatsapp-conversations");
      if (!r.ok) throw new Error("whatsapp");
      const d = await r.json();
      return (d.conversations ?? []) as WAConversation[];
    },
    refetchInterval: 60000,
  });
}
function useVapi() {
  return useQuery({
    queryKey: ["vapi"],
    queryFn: async () => {
      const r = await fetch("/api/vapi-calls?limit=100");
      if (!r.ok) throw new Error("vapi");
      return (await r.json()) as VapiCall[];
    },
    refetchInterval: 60000,
  });
}

function groupByDate<T>(items: T[], getDate: (x: T) => string): { date: string; count: number }[] {
  const m = new Map<string, number>();
  items.forEach((it) => {
    const d = getDate(it);
    if (!d) return;
    const key = d.slice(0, 10);
    m.set(key, (m.get(key) ?? 0) + 1);
  });
  return [...m.entries()].sort(([a], [b]) => a.localeCompare(b)).slice(-14).map(([date, count]) => ({ date, count }));
}

function isTestWA(c: WAConversation) {
  return c.companyName?.startsWith("Test Dummy Company - ");
}

function Overview() {
  const emails = useEmails();
  const sms = useSms();
  const wa = useWhatsApp();
  const vapi = useVapi();

  // Exclude internal QA test contacts from all Home dashboard metrics
  const realWAConvs = (wa.data ?? []).filter((c) => !isTestWA(c));
  const waMessageCount = realWAConvs.reduce((sum, c) => sum + c.messages.length, 0);

  const kpis = [
    { label: "Emails Sent", value: emails.data?.length ?? 0, Icon: Mail, isLoading: emails.isLoading, isError: emails.isError },
    { label: "SMS Sent", value: sms.data?.length ?? 0, Icon: MessageSquare, isLoading: sms.isLoading, isError: sms.isError },
    { label: "WhatsApp Messages", value: waMessageCount, Icon: MessageCircle, isLoading: wa.isLoading, isError: wa.isError },
    { label: "Calls Made", value: vapi.data?.length ?? 0, Icon: Phone, isLoading: vapi.isLoading, isError: vapi.isError },
  ];

  const emailChart = groupByDate(emails.data ?? [], (r) => r.Date_Sent);
  const smsChart = groupByDate(sms.data ?? [], (r) => r.Date_Sent);
  // Flatten all messages from real (non-test) conversations, group by message timestamp
  const allWAMessages = realWAConvs.flatMap((c) => c.messages);
  const waChart = groupByDate(allWAMessages, (m) => m.ts);
  const callChart = groupByDate(vapi.data ?? [], (r) => r.createdAt);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold" style={{ color: "#1B2419" }}>Lead Gen Command Center</h1>
        <p className="text-sm text-gray-600">Live snapshot across all outreach channels. Auto-refreshes every 60s.</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {kpis.map(({ label, value, Icon, isLoading, isError }) => (
          <div key={label} className="bg-white rounded-xl p-5 shadow-sm flex items-center justify-between">
            <div>
              {isLoading ? (
                <div className="h-9 w-16 rounded-md bg-gray-100 animate-pulse" />
              ) : isError ? (
                <div className="text-sm font-semibold text-red-600">Error</div>
              ) : (
                <div className="text-3xl font-black" style={{ color: "#86000B" }}>{value.toLocaleString()}</div>
              )}
              <div className="text-xs text-gray-500 mt-1 font-semibold uppercase tracking-wide">{label}</div>
            </div>
            <div className="w-12 h-12 rounded-full flex items-center justify-center" style={{ backgroundColor: "#FFEBCE" }}>
              <Icon className="w-6 h-6" style={{ color: "#86000B" }} />
            </div>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <ChartCard title="Email Sends Over Time" data={emailChart} type="bar" />
        <ChartCard title="SMS Sends Over Time" data={smsChart} type="bar" />
        <ChartCard title="WhatsApp Activity" data={waChart} type="line" />
        <ChartCard title="Call Activity" data={callChart} type="bar" />
      </div>
    </div>
  );
}

function ChartCard({ title, data, type }: { title: string; data: { date: string; count: number }[]; type: "bar" | "line" }) {
  return (
    <div className="bg-white rounded-xl shadow-sm p-4">
      <div className="font-bold mb-3 text-sm" style={{ color: "#1B2419" }}>{title}</div>
      <div style={{ width: "100%", height: 220 }}>
        <ResponsiveContainer>
          {type === "bar" ? (
            <BarChart data={data}>
              <CartesianGrid strokeDasharray="3 3" stroke="#F0EAD9" />
              <XAxis dataKey="date" tick={{ fontSize: 11 }} />
              <YAxis tick={{ fontSize: 11 }} allowDecimals={false} />
              <Tooltip />
              <Bar dataKey="count" fill="#86000B" radius={[4, 4, 0, 0]} />
            </BarChart>
          ) : (
            <LineChart data={data}>
              <CartesianGrid strokeDasharray="3 3" stroke="#F0EAD9" />
              <XAxis dataKey="date" tick={{ fontSize: 11 }} />
              <YAxis tick={{ fontSize: 11 }} allowDecimals={false} />
              <Tooltip />
              <Line type="monotone" dataKey="count" stroke="#86000B" strokeWidth={2} dot={{ r: 3 }} />
            </LineChart>
          )}
        </ResponsiveContainer>
      </div>
    </div>
  );
}
