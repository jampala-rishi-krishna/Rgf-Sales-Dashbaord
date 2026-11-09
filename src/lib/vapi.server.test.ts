import { describe, expect, it } from "vitest";
import { MARA_ASSISTANT_ID, mergeCalls, pickRecordingUrl, vapiAssistantIds } from "./vapi.server";

describe("vapiAssistantIds", () => {
  it("always includes Mara and splits a comma list", () => {
    expect(vapiAssistantIds(undefined)).toEqual([MARA_ASSISTANT_ID]);
    expect(vapiAssistantIds(" a , b,")).toEqual(["a", "b", MARA_ASSISTANT_ID]);
    expect(vapiAssistantIds(MARA_ASSISTANT_ID)).toEqual([MARA_ASSISTANT_ID]);
  });
});

describe("pickRecordingUrl", () => {
  it("prefers the newest stereo field, then falls back", () => {
    expect(
      pickRecordingUrl({ artifact: { recording: { stereoUrl: "s", mono: { combinedUrl: "m" } } } }),
    ).toBe("s");
    expect(pickRecordingUrl({ artifact: { recordingUrl: "r" } })).toBe("r");
    expect(pickRecordingUrl({ stereoRecordingUrl: "old" })).toBe("old");
    expect(pickRecordingUrl({ recordingUrl: "m", stereoRecordingUrl: "s" }, "mono")).toBe("m");
    expect(pickRecordingUrl({})).toBeUndefined();
    expect(pickRecordingUrl(null)).toBeUndefined();
  });
});

describe("mergeCalls", () => {
  it("dedupes by id, sorts newest first and caps", () => {
    const a = [
      { id: "1", createdAt: "2026-01-01" },
      { id: "2", createdAt: "2026-03-01" },
    ];
    const b = [{ id: "2", createdAt: "2026-03-01" }, { id: "3", createdAt: "2026-02-01" }, null];
    expect(mergeCalls([a, b], 2).map((c) => c.id)).toEqual(["2", "3"]);
  });
});
