import { describe, expect, it } from "vitest";
import {
  MARA_ASSISTANT_ID,
  mergeCalls,
  pickRecordingUrl,
  recordingCandidates,
  vapiAssistantIds,
} from "./vapi.server";

describe("vapiAssistantIds", () => {
  it("always includes Mara and splits a comma list", () => {
    expect(vapiAssistantIds(undefined)).toEqual([MARA_ASSISTANT_ID]);
    expect(vapiAssistantIds(" a , b,")).toEqual(["a", "b", MARA_ASSISTANT_ID]);
    expect(vapiAssistantIds(MARA_ASSISTANT_ID)).toEqual([MARA_ASSISTANT_ID]);
  });
});

describe("pickRecordingUrl", () => {
  const u = (x: string) => `https://storage.vapi.ai/${x}.wav`;
  it("prefers the newest stereo field, then falls back", () => {
    expect(
      pickRecordingUrl({
        artifact: { recording: { stereoUrl: u("s"), mono: { combinedUrl: u("m") } } },
      }),
    ).toBe(u("s"));
    expect(pickRecordingUrl({ artifact: { recordingUrl: u("r") } })).toBe(u("r"));
    expect(pickRecordingUrl({ stereoRecordingUrl: u("old") })).toBe(u("old"));
    expect(pickRecordingUrl({ recordingUrl: u("m"), stereoRecordingUrl: u("s") }, "mono")).toBe(
      u("m"),
    );
    expect(pickRecordingUrl({})).toBeUndefined();
    expect(pickRecordingUrl(null)).toBeUndefined();
  });
});

describe("recordingCandidates", () => {
  it("puts presigned (private storage) URLs first, then plain ones, deduped", () => {
    const call = {
      recordingUrl: "https://storage/plain.wav",
      artifact: {
        recording: {
          stereoUrl: "https://storage/stereo.wav",
          mono: {
            combinedUrl: "https://storage/plain.wav",
            presignedMonoUrl: "https://r2/mono?sig",
          },
        },
        presignedStereoUrl: "https://r2/stereo?sig",
      },
    };
    expect(recordingCandidates(call)).toEqual([
      "https://r2/stereo?sig",
      "https://r2/mono?sig",
      "https://storage/stereo.wav",
      "https://storage/plain.wav",
    ]);
    expect(recordingCandidates(call, "mono")[0]).toBe("https://r2/mono?sig");
    expect(recordingCandidates({ recordingUrl: "not-a-url" })).toEqual([]);
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
