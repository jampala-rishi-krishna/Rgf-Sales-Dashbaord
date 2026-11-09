import { useQuery, type QueryKey } from "@tanstack/react-query";
import { useEffect, useState } from "react";

function useDocumentVisible() {
  const [visible, setVisible] = useState(true);
  useEffect(() => {
    const on = () => setVisible(document.visibilityState === "visible");
    on();
    document.addEventListener("visibilitychange", on);
    return () => document.removeEventListener("visibilitychange", on);
  }, []);
  return visible;
}

/** Polls `fn` every `ms`, pauses when the tab is hidden, backs off exponentially on errors (max 5 min). */
export function usePolling<T>(
  key: QueryKey,
  fn: () => Promise<T>,
  ms: number,
  opts: { enabled?: boolean } = {},
) {
  const visible = useDocumentVisible();
  return useQuery<T>({
    queryKey: key,
    queryFn: fn,
    enabled: opts.enabled ?? true,
    refetchInterval: (q) => {
      if (!visible) return false;
      const fails = q.state.fetchFailureCount ?? 0;
      return fails > 0 ? Math.min(ms * 2 ** fails, 300_000) : ms;
    },
    refetchIntervalInBackground: false,
    retry: 1,
  });
}

/** Fetch JSON helper that throws on non-2xx. */
export async function getJson<T>(url: string): Promise<T> {
  const r = await fetch(url, { credentials: "include" });
  if (!r.ok) throw new Error(`${url} failed (${r.status})`);
  return r.json() as Promise<T>;
}
