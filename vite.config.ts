// Vite configuration for TanStack Start SSR using Lovable preset
import { readFileSync } from "node:fs";
import { defineConfig } from "@lovable.dev/vite-tanstack-config";

const { version } = JSON.parse(
  readFileSync(new URL("./package.json", import.meta.url), "utf8"),
) as {
  version: string;
};

export default defineConfig({
  nitro: {
    preset: "vercel",
  },
  vite: {
    define: { __APP_VERSION__: JSON.stringify(version) },
  },
});
