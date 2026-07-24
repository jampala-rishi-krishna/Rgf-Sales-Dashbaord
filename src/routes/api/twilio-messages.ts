import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/twilio-messages")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const TWILIO_SID = process.env.TWILIO_ACCOUNT_SID;
        const TWILIO_TOKEN = process.env.TWILIO_AUTH_TOKEN;
        if (!TWILIO_SID || !TWILIO_TOKEN) {
          return new Response(JSON.stringify({ error: "Twilio credentials not configured" }), {
            status: 500,
            headers: { "Content-Type": "application/json" },
          });
        }
        const url = new URL(request.url);
        const pageSize = url.searchParams.get("PageSize") ?? "200";
        const target = `https://api.twilio.com/2010-04-01/Accounts/${TWILIO_SID}/Messages.json?PageSize=${pageSize}`;
        const auth = "Basic " + Buffer.from(`${TWILIO_SID}:${TWILIO_TOKEN}`).toString("base64");
        const res = await fetch(target, { headers: { Authorization: auth } });
        const body = await res.text();
        if (!res.ok) {
          console.error(`Twilio API error ${res.status}:`, body);
        }
        return new Response(body, {
          status: res.status,
          headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
        });
      },
    },
  },
});
