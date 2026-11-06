import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from "react";
import WaveSurfer from "wavesurfer.js";
import { Loader2, Pause, Play } from "lucide-react";
import { mmss } from "./vapi";

export interface WaveformHandle {
  seek: (seconds: number) => void;
}

interface Props {
  url: string;
  onTime?: (seconds: number) => void;
  onPlayingChange?: (playing: boolean) => void;
}

/** Orange wavesurfer player; falls back to a native <audio> element if wavesurfer fails to load/decode. */
export const WaveformPlayer = forwardRef<WaveformHandle, Props>(function WaveformPlayer(
  { url, onTime, onPlayingChange },
  ref,
) {
  const containerRef = useRef<HTMLDivElement>(null);
  const wsRef = useRef<WaveSurfer | null>(null);
  const audioRef = useRef<HTMLAudioElement>(null);
  const [mode, setMode] = useState<"wave" | "audio" | "none">("wave");
  const [ready, setReady] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [time, setTime] = useState(0);
  const [duration, setDuration] = useState(0);

  const cb = useRef({ onTime, onPlayingChange });
  cb.current = { onTime, onPlayingChange };

  useEffect(() => {
    setMode("wave");
    setReady(false);
    setPlaying(false);
    setTime(0);
    setDuration(0);
    if (!containerRef.current) return;
    let ws: WaveSurfer | null = null;
    try {
      ws = WaveSurfer.create({
        container: containerRef.current,
        url,
        height: 64,
        waveColor: "rgba(249,115,22,0.35)",
        progressColor: "#F97316",
        cursorColor: "#FDBA74",
        cursorWidth: 2,
        barWidth: 2,
        barGap: 2,
        barRadius: 2,
        normalize: true,
        dragToSeek: true,
      });
    } catch {
      setMode("audio");
      return;
    }
    wsRef.current = ws;
    const unsubs = [
      ws.on("ready", (d) => {
        setReady(true);
        setDuration(d);
      }),
      ws.on("timeupdate", (t) => {
        setTime(t);
        cb.current.onTime?.(t);
      }),
      ws.on("play", () => {
        setPlaying(true);
        cb.current.onPlayingChange?.(true);
      }),
      ws.on("pause", () => {
        setPlaying(false);
        cb.current.onPlayingChange?.(false);
      }),
      ws.on("finish", () => {
        setPlaying(false);
        cb.current.onPlayingChange?.(false);
      }),
      ws.on("error", () => setMode("audio")),
    ];
    return () => {
      unsubs.forEach((u) => u());
      try {
        ws?.destroy();
      } catch {
        /* already destroyed */
      }
      wsRef.current = null;
    };
  }, [url]);

  useImperativeHandle(
    ref,
    () => ({
      seek: (s: number) => {
        if (mode === "wave" && wsRef.current && ready) {
          wsRef.current.setTime(s);
          void wsRef.current.play().catch(() => undefined);
        } else if (mode === "audio" && audioRef.current) {
          audioRef.current.currentTime = s;
          void audioRef.current.play().catch(() => undefined);
        }
      },
    }),
    [mode, ready],
  );

  if (mode === "none")
    return <div className="text-sm text-[var(--ch-text-2)]">No recording available.</div>;

  if (mode === "audio") {
    return (
      <audio
        ref={audioRef}
        controls
        src={url}
        className="w-full"
        style={{ accentColor: "#F97316" }}
        onTimeUpdate={(e) => onTime?.(e.currentTarget.currentTime)}
        onPlay={() => onPlayingChange?.(true)}
        onPause={() => onPlayingChange?.(false)}
        onError={() => setMode("none")}
      />
    );
  }

  return (
    <div className="flex items-center gap-3 rounded-2xl bg-black/30 p-3 ring-1 ring-white/5">
      <button
        type="button"
        onClick={() => void wsRef.current?.playPause().catch(() => undefined)}
        disabled={!ready}
        aria-label={playing ? "Pause recording" : "Play recording"}
        className="grid size-11 shrink-0 place-items-center rounded-full bg-[var(--ch)] text-white shadow-lg shadow-orange-500/20 transition-transform hover:scale-105 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-300 disabled:opacity-60 motion-reduce:transition-none motion-reduce:hover:scale-100"
      >
        {!ready ? (
          <Loader2 className="size-5 animate-spin motion-reduce:animate-none" />
        ) : playing ? (
          <Pause className="size-5" />
        ) : (
          <Play className="size-5 translate-x-px" />
        )}
      </button>
      <div className="min-w-0 flex-1">
        <div ref={containerRef} className="w-full" aria-label="Call recording waveform" />
      </div>
      <div className="shrink-0 font-mono text-xs tabular-nums text-[var(--ch-text-2)]">
        {mmss(time)} / {ready ? mmss(duration) : "—"}
      </div>
    </div>
  );
});
