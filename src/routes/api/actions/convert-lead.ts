import { createFileRoute } from "@tanstack/react-router";
import { handleConvertLead } from "@/lib/convert-lead.server";

export const Route = createFileRoute("/api/actions/convert-lead")({
  server: {
    handlers: {
      POST: ({ request }) => handleConvertLead(request),
    },
  },
});
