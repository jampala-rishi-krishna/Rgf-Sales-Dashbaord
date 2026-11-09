import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { handleConvertLead } from "@/lib/convert-lead.server";
import { sessionCookie, type Role } from "@/lib/session.server";

const body = {
  preLeadId: "pl-1",
  lead: {
    firstName: "Ana",
    lastName: "Cruz",
    company: "Cruz Bakery",
    phone: "+639171234567",
    email: "ana@cruzbakery.ph",
    product: "Fries",
    channel: "Bakery",
    leadSource: "AI Agent - WhatsApp",
    leadStatus: "Contacted",
    notes: "[WhatsApp] Ana: Yes, send prices",
  },
  repliedChannels: ["whatsapp"],
  firstContactAt: "2026-11-01T01:00:00.000Z",
  firstReplyAt: "2026-11-01T02:00:00.000Z",
};

function req(role: Role | null, payload: unknown = body) {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (role) {
    const c = sessionCookie({ email: `${role}@rareglobalfood.com`, name: role, role });
    headers.cookie = c.split(";")[0];
  }
  return new Request("http://x/api/actions/convert-lead", {
    method: "POST",
    headers,
    body: JSON.stringify(payload),
  });
}

describe("POST /api/actions/convert-lead (handleConvertLead)", () => {
  beforeEach(() => {
    vi.stubEnv("SESSION_SECRET", "test-session-secret-at-least-16-chars");
    vi.stubEnv("FEATURE_LEAD_CONVERSION", "true");
    vi.stubEnv("ACTIONS_DRY_RUN", "true");
    vi.stubEnv("N8N_BASE", "https://n8n.test/webhook");
    vi.stubEnv("N8N_WEBHOOK_AUTH", "secret");
    vi.spyOn(console, "log").mockImplementation(() => {});
  });
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("rejects signed-out requests (401) and viewers (403)", async () => {
    expect((await handleConvertLead(req(null))).status).toBe(401);
    const r = await handleConvertLead(req("viewer"));
    expect(r.status).toBe(403);
    expect(await r.json()).toMatchObject({ ok: false });
  });

  it("is disabled until FEATURE_LEAD_CONVERSION is on", async () => {
    vi.stubEnv("FEATURE_LEAD_CONVERSION", "false");
    const r = await handleConvertLead(req("agent"));
    expect(r.status).toBe(403);
    expect(await r.json()).toEqual({ ok: false, error: "Backend not connected yet" });
  });

  it("validates the body (400)", async () => {
    const r = await handleConvertLead(
      req("agent", { ...body, lead: { ...body.lead, company: "" } }),
    );
    expect(r.status).toBe(400);
    expect((await handleConvertLead(req("agent", { nope: 1 }))).status).toBe(400);
  });

  it("dry run never calls n8n", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const r = await handleConvertLead(req("agent"));
    expect(r.status).toBe(200);
    expect(await r.json()).toMatchObject({ ok: true, dryRun: true, leadId: "dry-run" });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("forwards to n8n with auth + convertedBy and returns the Lead", async () => {
    vi.stubEnv("ACTIONS_DRY_RUN", "false");
    const fetchMock = vi.fn(async () =>
      Response.json({
        ok: true,
        leadId: "L-9",
        zohoUrl: "https://crm.zoho.com/L-9",
        convertedAt: "2026-11-09T00:00:00Z",
      }),
    );
    vi.stubGlobal("fetch", fetchMock);
    const r = await handleConvertLead(req("admin"));
    expect(r.status).toBe(200);
    expect(await r.json()).toEqual({
      ok: true,
      leadId: "L-9",
      zohoUrl: "https://crm.zoho.com/L-9",
      convertedAt: "2026-11-09T00:00:00Z",
    });
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://n8n.test/webhook/dashboard-convert-lead");
    expect((init.headers as Record<string, string>).Authorization).toBe("secret");
    expect(JSON.parse(String(init.body))).toMatchObject({
      preLeadId: "pl-1",
      convertedBy: "admin@rareglobalfood.com",
      repliedChannels: ["whatsapp"],
    });
  });

  it("passes a 409 duplicate through", async () => {
    vi.stubEnv("ACTIONS_DRY_RUN", "false");
    const dup = {
      ok: false,
      duplicate: true,
      existingLeadId: "L-1",
      existingZohoUrl: "https://crm.zoho.com/L-1",
      matchedOn: "phone",
    };
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => Response.json(dup, { status: 409 })),
    );
    const r = await handleConvertLead(req("agent", { ...body, force: false }));
    expect(r.status).toBe(409);
    expect(await r.json()).toEqual(dup);
  });

  it("surfaces n8n errors", async () => {
    vi.stubEnv("ACTIONS_DRY_RUN", "false");
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => Response.json({ ok: false, error: "Zoho rejected" }, { status: 500 })),
    );
    const r = await handleConvertLead(req("agent"));
    expect(r.status).toBe(500);
    expect(await r.json()).toEqual({ ok: false, error: "Zoho rejected" });
  });
});
