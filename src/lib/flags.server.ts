// Server-only feature flags (never import from client code).
import { googleSsoEnabled } from "./google-oauth.server";

const on = (v: string | undefined) => v === "true" || v === "1";

export function getFlags() {
  return {
    manualReply: on(process.env.FEATURE_MANUAL_REPLY),
    singleCall: on(process.env.FEATURE_SINGLE_CALL),
    campaignRuns: on(process.env.FEATURE_CAMPAIGN_RUNS),
    agentEvents: on(process.env.FEATURE_AGENT_EVENTS),
    crm: on(process.env.FEATURE_CRM),
    googleSso: googleSsoEnabled(),
    leadConversion: on(process.env.FEATURE_LEAD_CONVERSION),
    leadsTab: on(process.env.FEATURE_LEADS_TAB),
    emailSend: process.env.GMAIL_SEND_ENABLED === "true" || !isDryRun(),
  };
}

/** Dry run unless explicitly disabled. Missing env = dry run. */
export function isDryRun(): boolean {
  return process.env.ACTIONS_DRY_RUN !== "false";
}
