import { createFileRoute } from "@tanstack/react-router";
import { ActionCenter } from "@/components/campaigns/action-center";

export const Route = createFileRoute("/_app/campaigns")({
  head: () => ({ meta: [{ title: "Campaigns · RGF Sales" }] }),
  component: ActionCenter,
});
