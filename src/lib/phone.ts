/** Normalize PH numbers exactly like the n8n code: strip non-digits, drop leading 0 or 63, prefix +63. */
export function normalizePhPhone(raw: string | null | undefined): string {
  if (!raw) return "";
  let d = String(raw).replace(/\D/g, "");
  if (d.startsWith("63")) d = d.slice(2);
  else if (d.startsWith("0")) d = d.slice(1);
  return d ? `+63${d}` : "";
}
