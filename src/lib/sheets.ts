import Papa from "papaparse";

export const EMAIL_SHEET_ID = import.meta.env.VITE_EMAIL_SHEET_ID;
export const SMS_SHEET_ID = import.meta.env.VITE_SMS_SHEET_ID;

export function csvUrl(sheetId: string, tab: string) {
  return `https://docs.google.com/spreadsheets/d/${sheetId}/gviz/tq?tqx=out:csv&sheet=${encodeURIComponent(tab)}`;
}

export async function fetchSheet<T = Record<string, string>>(sheetId: string, tab: string): Promise<T[]> {
  const res = await fetch(csvUrl(sheetId, tab));
  if (!res.ok) throw new Error(`Sheet fetch failed: ${res.status}`);
  const text = await res.text();
  const parsed = Papa.parse<Record<string, string>>(text, { header: true, skipEmptyLines: true });

  // Google Sheets header rows may use spaces ("Company Name") instead of the
  // underscored keys this app's row interfaces expect ("Company_Name"). Normalize
  // every key so either convention in the sheet maps to the same object shape.
  const normalized = parsed.data.map((row) => {
    const clean: Record<string, string> = {};
    for (const [key, val] of Object.entries(row)) {
      clean[key.trim().replace(/\s+/g, "_")] = val;
    }
    return clean;
  });

  return normalized as T[];
}

export interface EmailRow {
  Date_Sent: string;
  Time_Sent: string;
  Lead_ID: string;
  Company_Name: string;
  Contact_Name: string;
  Email_Sent_To: string;
  Product_Offered: string;
  Channel: string;
  Email_Subject: string;
  Status: string;
  Gmail_Message_ID: string;
}

export interface SmsRow {
  Date_Sent: string;
  Time_Sent: string;
  Lead_ID: string;
  Company_Name: string;
  Contact_Name: string;
  Phone: string;
  Product_Offered: string;
  Channel: string;
  Message_Sent: string;
  Status: string;
  API_Response: string;
}
