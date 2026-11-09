import { createFileRoute } from "@tanstack/react-router";
import { MessengerLayout, validatePhoneSearch } from "@/components/chat";
import { useWhatsAppFeed } from "@/hooks/use-feeds";

export const Route = createFileRoute("/_app/whatsapp")({
  validateSearch: validatePhoneSearch,
  component: WhatsAppTab,
});

function WhatsAppTab() {
  const { data, isLoading, error } = useWhatsAppFeed();
  const { phone } = Route.useSearch();
  const navigate = Route.useNavigate();

  return (
    <MessengerLayout
      variant="whatsapp"
      title="WhatsApp"
      conversations={data?.items ?? []}
      connected={data?.connected ?? true}
      isLoading={isLoading}
      error={error}
      phone={phone}
      onSelectPhone={(p) => navigate({ search: p ? { phone: p } : {}, replace: true })}
      notConnected={{
        title: "WhatsApp feed not connected",
        description: "The n8n WhatsApp conversations workflow isn't responding.",
      }}
    />
  );
}
