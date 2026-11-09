import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { sessionCookie, type SessionUser } from "./session.server";
import { moveGmailThreads, sendGmailMessage } from "./gmail-server";
import { handleGmailTrash } from "../routes/api/gmail-trash";
import { handleGmailSend } from "../routes/api/gmail-send";

vi.mock("./gmail-server", () => ({
  GmailConnectionError: class extends Error {},
  moveGmailThreads: vi.fn(),
  sendGmailMessage: vi.fn(),
}));

function request(body: unknown, role?: SessionUser["role"]) {
  const headers = new Headers({ "Content-Type": "application/json" });
  if (role)
    headers.set(
      "Cookie",
      sessionCookie({ email: "test@example.com", name: "Test", role }).split(";")[0],
    );
  return new Request("http://localhost/api/gmail-action", {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  vi.stubEnv("SESSION_SECRET", "test-session-secret-at-least-sixteen");
  vi.stubEnv("ACTIONS_DRY_RUN", "true");
  vi.stubEnv("GMAIL_SEND_ENABLED", "false");
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.clearAllMocks();
});

describe("Gmail Trash endpoint", () => {
  it("rejects signed-out users and viewers without modifying Gmail", async () => {
    expect((await handleGmailTrash(request({ threadIds: ["abc"] }))).status).toBe(401);
    expect((await handleGmailTrash(request({ threadIds: ["abc"] }, "viewer"))).status).toBe(403);
    expect(moveGmailThreads).not.toHaveBeenCalled();
  });
  it.each([[], ["../messages"], Array(101).fill("abc")])(
    "rejects invalid selections",
    async (threadIds) => {
      expect((await handleGmailTrash(request({ threadIds }, "agent"))).status).toBe(400);
      expect(moveGmailThreads).not.toHaveBeenCalled();
    },
  );
  it("deduplicates selections and reports partial failures", async () => {
    vi.mocked(moveGmailThreads).mockResolvedValue({ moved: ["abc"], failed: ["def"] });
    const response = await handleGmailTrash(request({ threadIds: ["abc", "abc", "def"] }, "admin"));
    expect(moveGmailThreads).toHaveBeenCalledWith(["abc", "def"], false);
    expect(await response.json()).toMatchObject({
      ok: false,
      data: { moved: ["abc"], failed: ["def"] },
    });
  });
  it("supports restoring conversations for Undo", async () => {
    vi.mocked(moveGmailThreads).mockResolvedValue({ moved: ["abc"], failed: [] });
    expect(
      (await handleGmailTrash(request({ threadIds: ["abc"], restore: true }, "agent"))).status,
    ).toBe(200);
    expect(moveGmailThreads).toHaveBeenCalledWith(["abc"], true);
  });
});

describe("dashboard sending", () => {
  const mail = { to: "test@example.com", subject: "Test", html: "<p>Hello</p>" };
  it("blocks viewers and signed-out users", async () => {
    expect((await handleGmailSend(request(mail))).status).toBe(401);
    expect((await handleGmailSend(request(mail, "viewer"))).status).toBe(403);
    expect(sendGmailMessage).not.toHaveBeenCalled();
  });
  it("keeps dry runs from sending mail", async () => {
    const response = await handleGmailSend(request(mail, "agent"));
    expect(await response.json()).toEqual({ ok: true, dryRun: true });
    expect(sendGmailMessage).not.toHaveBeenCalled();
  });
  it("enables email independently while other actions stay in dry run", async () => {
    vi.stubEnv("GMAIL_SEND_ENABLED", "true");
    vi.mocked(sendGmailMessage).mockResolvedValue({
      id: "message",
      threadId: "abc",
      labeled: true,
    });
    const response = await handleGmailSend(
      request({ ...mail, threadId: "abc", inReplyTo: "<original@example.com>" }, "agent"),
    );
    expect(await response.json()).toMatchObject({ ok: true, data: { threadId: "abc" } });
    expect(sendGmailMessage).toHaveBeenCalledWith(
      expect.objectContaining({ threadId: "abc", inReplyTo: "<original@example.com>" }),
    );
    expect(process.env.ACTIONS_DRY_RUN).toBe("true");
  });
});
