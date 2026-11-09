// Zoho Leads (converted) types shared by /api/crm/leads, the /leads tab and conversion state.
// Pure and client-safe.
import type { ConvertChannel } from "@/lib/conversion";

export interface LeadField {
  apiName: string;
  label: string;
  type: string;
}

/** One Zoho Lead as returned by n8n /dashboard-leads (flattened; extra fields allowed). */
export interface LeadRecord {
  id: string;
  First_Name?: string;
  Last_Name?: string;
  Company?: string;
  Phone?: string;
  Mobile?: string;
  Email?: string;
  Lead_Source?: string;
  Lead_Status?: string;
  Owner?: string;
  Owner_id?: string;
  Created_Time?: string;
  Modified_Time?: string;
  Description?: string;
  [key: string]: unknown;
}

/** A Pre-Lead → Lead conversion recorded by the dashboard (via n8n). */
export interface LeadConversion {
  leadId: string;
  preLeadId: string;
  convertedAt: string;
  convertedBy?: string;
  repliedChannels?: ConvertChannel[];
  firstContactAt?: string;
  firstReplyAt?: string;
}

/** GET /api/crm/leads response. `connected:false` when n8n isn't configured/published. */
export interface LeadsResponse {
  ok: boolean;
  connected: boolean;
  count: number;
  fetchedAt?: string;
  fields: LeadField[];
  leads: LeadRecord[];
  conversions: LeadConversion[];
  error?: string;
}
