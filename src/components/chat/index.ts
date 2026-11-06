export { ChatBubble, type ChatBubbleProps } from "./ChatBubble";
export { Composer } from "./Composer";
export { ConversationHeader } from "./ConversationHeader";
export { ConversationList, InitialsAvatar } from "./ConversationList";
export { LeadInfoDrawer } from "./LeadInfoDrawer";
export { MessengerLayout, type MessengerLayoutProps } from "./MessengerLayout";
export { DateSeparator, SystemPill } from "./SystemPill";
export * from "./utils";

/** `validateSearch` shared by the WhatsApp / Viber / SMS routes (`?phone=`). */
export function validatePhoneSearch(s: Record<string, unknown>): { phone?: string } {
  const p = s.phone;
  return typeof p === "string" && p
    ? { phone: p }
    : typeof p === "number"
      ? { phone: String(p) }
      : {};
}
