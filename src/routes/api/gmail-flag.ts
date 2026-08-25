import { createFileRoute } from "@tanstack/react-router";
import { getGmailAccessToken } from "@/lib/gmail-server";

export const Route = createFileRoute("/api/gmail-flag")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        try {
          const { threadId, flagged } = await request.json();
          if (!threadId) {
            return new Response(JSON.stringify({ error: "Missing threadId" }), {
              status: 400,
              headers: { "Content-Type": "application/json" },
            });
          }
          const token = await getGmailAccessToken();
          const body = flagged
            ? { addLabelIds: ["STARRED"] }
            : { removeLabelIds: ["STARRED"] };

          const res = await fetch(
            `https://gmail.googleapis.com/gmail/v1/users/me/threads/${threadId}/modify`,
            {
              method: "POST",
              headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
              body: JSON.stringify(body),
            },
          );

          if (!res.ok) {
            const text = await res.text();
            return new Response(
              JSON.stringify({ error: `Gmail flag update failed: ${res.status} ${text}` }),
              { status: res.status, headers: { "Content-Type": "application/json" } },
            );
          }

          return new Response(JSON.stringify({ success: true, threadId, flagged }), {
            status: 200,
            headers: { "Content-Type": "application/json" },
          });
        } catch (err) {
          console.error("[gmail-flag] error:", err);
          return new Response(JSON.stringify({ error: "Failed to update flag" }), {
            status: 500,
            headers: { "Content-Type": "application/json" },
          });
        }
      },
    },
  },
});
