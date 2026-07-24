import type { EmailRow } from "./sheets";

export function renderEmailHtml(row: EmailRow): string {
  const company = row.Company_Name || "your team";
  const contact = row.Contact_Name || "there";
  const product = row.Product_Offered || "premium food products";
  return `
  <div style="font-family: Arial, sans-serif; color:#1B2419; max-width:640px; line-height:1.55;">
    <p>Hi ${escapeHtml(contact)},</p>
    <p>I hope this note finds you well. I'm Martin Reyes with <strong>Rare Global Food Trading Corp.</strong>,
    one of the Philippines' trusted suppliers of premium food, meat &amp; seafood serving 2,000+ B2B clients nationwide.</p>
    <p>We work with kitchens and operations teams like ${escapeHtml(company)} to provide consistent supply of
    <strong>${escapeHtml(product)}</strong> &mdash; backed by reliable cold-chain logistics and on-time delivery
    (99% timely delivery rate across 20,000+ kg shipped monthly).</p>
    <p>Would it be worth a quick 10-minute call this week to see if our catalog could fit your sourcing needs?
    I'm happy to send our full product catalog and pricing sheet as well.</p>
    <p>Best regards,<br/>
    <strong>Martin Reyes</strong><br/>
    Sales &mdash; Rare Global Food Trading Corp.<br/>
    <a href="https://rareglobalfood.com" style="color:#86000B;">rareglobalfood.com</a></p>
  </div>`;
}

function escapeHtml(s: string) {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!));
}
