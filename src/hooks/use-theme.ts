import { useCallback, useSyncExternalStore } from "react";

export type Theme = "light" | "dark";
const KEY = "rgf-theme";
const listeners = new Set<() => void>();

/** Inline script for <head>: applies the persisted theme before first paint (no flash). */
export const THEME_INIT_SCRIPT = `(function(){try{var t=localStorage.getItem("${KEY}");if(!t){t=window.matchMedia("(prefers-color-scheme: dark)").matches?"dark":"light"}if(t==="dark")document.documentElement.classList.add("dark")}catch(e){}})();`;

function read(): Theme {
  if (typeof document === "undefined") return "light";
  return document.documentElement.classList.contains("dark") ? "dark" : "light";
}

export function setTheme(t: Theme) {
  document.documentElement.classList.toggle("dark", t === "dark");
  try {
    localStorage.setItem(KEY, t);
  } catch {
    /* storage blocked: theme still applies for this session */
  }
  listeners.forEach((l) => l());
}

export function toggleTheme() {
  setTheme(read() === "dark" ? "light" : "dark");
}

function subscribe(cb: () => void) {
  listeners.add(cb);
  return () => listeners.delete(cb);
}

export function useTheme() {
  const theme = useSyncExternalStore(subscribe, read, () => "light" as Theme);
  const toggle = useCallback(() => toggleTheme(), []);
  return { theme, setTheme, toggle };
}
