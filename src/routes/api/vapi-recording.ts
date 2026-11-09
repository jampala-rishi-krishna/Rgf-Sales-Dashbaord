import { createFileRoute } from "@tanstack/react-router";
import { recordingCandidates } from "@/lib/vapi.server";

const err = (error: string, status: number) =>
  new Response(JSON.stringify({ error }), {
    status,
    headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
  });

// Streams a call's recording: reads the call from Vapi, then fetches the recording URL
// stored on it (artifact.recording / stereoRecordingUrl / recordingUrl) server-side.
export const Route = createFileRoute("/api/vapi-recording")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const key = process.env.VAPI_PRIVATE_KEY;
        if (!key) return err("Vapi credentials not configured", 500);
        const url = new URL(request.url);
        const callId = url.searchParams.get("callId");
        if (!callId || !/^[\w-]{6,64}$/.test(callId)) return err("Missing callId", 400);
        const prefer = url.searchParams.get("type") === "mono" ? "mono" : "stereo";
        try {
          const callRes = await fetch(`https://api.vapi.ai/call/${encodeURIComponent(callId)}`, {
            headers: { Authorization: `Bearer ${key}` },
            signal: AbortSignal.timeout(20_000),
          });
          if (!callRes.ok) return err(`Vapi call lookup failed: ${callRes.status}`, callRes.status);
          const urls = recordingCandidates(await callRes.json(), prefer);
          if (!urls.length) return err("No recording for this call", 404);
          let audio: Response | null = null;
          const tried: string[] = [];
          for (const u of urls) {
            const r = await fetch(u, { signal: AbortSignal.timeout(60_000) }).catch(() => null);
            if (r?.ok && r.body) {
              audio = r;
              break;
            }
            tried.push(`${new URL(u).hostname}:${r?.status ?? "network"}`);
          }
          if (!audio) {
            console.warn(`[vapi-recording] call=${callId} no playable URL (${tried.join(", ")})`);
            return err("Recording is not available yet", 502);
          }
          const headers = new Headers({
            "Content-Type": audio.headers.get("content-type") ?? "audio/wav",
            "Cache-Control": "private, max-age=3600",
          });
          const len = audio.headers.get("content-length");
          if (len) headers.set("Content-Length", len);
          return new Response(audio.body, { status: 200, headers });
        } catch (e) {
          console.error("[vapi-recording] error:", e);
          return err("Failed to fetch recording", 502);
        }
      },
    },
  },
});
