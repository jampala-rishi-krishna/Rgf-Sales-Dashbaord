// Server-only Vapi helpers. Never import from client code.

/** Mara's assistant (used by the "[DASHBOARD] Single Lead Call (Mara)" n8n workflow). */
export const MARA_ASSISTANT_ID = "4e74769f-63d6-402d-8ac7-f9ba8bb1a9b9";

/** Assistants whose calls appear on the Calls tab: VAPI_ASSISTANT_ID (comma-separated) + Mara. */
export function vapiAssistantIds(env = process.env.VAPI_ASSISTANT_ID): string[] {
  const ids = (env ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  return Array.from(new Set([...ids, MARA_ASSISTANT_ID]));
}

type Rec = Record<string, unknown>;
const str = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim() : undefined);

/** First string value for `key` anywhere inside `obj` (Vapi nests presigned URLs). */
function findKeyDeep(
  obj: unknown,
  test: (k: string) => boolean,
  seen = new Set<object>(),
): string[] {
  const out: string[] = [];
  if (!obj || typeof obj !== "object" || seen.has(obj as object)) return out;
  seen.add(obj as object);
  for (const [k, v] of Object.entries(obj as Rec)) {
    if (typeof v === "string" && v.trim() && test(k)) out.push(v.trim());
    else if (v && typeof v === "object") out.push(...findKeyDeep(v, test, seen));
  }
  return out;
}

/**
 * Recording URLs to try, best first. Private (HIPAA) storage only serves the presigned
 * URLs, so those come first; then the plain fields (stereo or mono preferred).
 */
export function recordingCandidates(call: unknown, prefer: "stereo" | "mono" = "stereo"): string[] {
  const c = (call ?? {}) as Rec;
  const a = (c.artifact ?? {}) as Rec;
  const rec = (a.recording ?? {}) as Rec;
  const mono = (rec.mono ?? {}) as Rec;
  const presStereo = findKeyDeep(c, (k) => /^presigned.*stereo.*url$/i.test(k));
  const presMono = findKeyDeep(c, (k) => /^presigned.*(mono|combined).*url$/i.test(k));
  const presAny = findKeyDeep(c, (k) => /^presigned.*url$/i.test(k));
  const stereo = [rec.stereoUrl, a.stereoRecordingUrl, c.stereoRecordingUrl].map(str);
  const single = [mono.combinedUrl, a.recordingUrl, c.recordingUrl].map(str);
  const ordered =
    prefer === "stereo"
      ? [...presStereo, ...presMono, ...presAny, ...stereo, ...single]
      : [...presMono, ...presStereo, ...presAny, ...single, ...stereo];
  return Array.from(new Set(ordered.filter((u): u is string => !!u && /^https?:\/\//.test(u))));
}

/** Best recording URL on a Vapi call object. */
export function pickRecordingUrl(
  call: unknown,
  prefer: "stereo" | "mono" = "stereo",
): string | undefined {
  return recordingCandidates(call, prefer)[0];
}

/** Merge call lists from several assistants: dedupe by id, newest first, cap at `limit`. */
export function mergeCalls(lists: unknown[][], limit: number): Rec[] {
  const byId = new Map<string, Rec>();
  for (const list of lists)
    for (const c of list)
      if (c && typeof c === "object" && typeof (c as Rec).id === "string")
        byId.set((c as Rec).id as string, c as Rec);
  return Array.from(byId.values())
    .sort((a, b) => String(b.createdAt ?? "").localeCompare(String(a.createdAt ?? "")))
    .slice(0, limit);
}
