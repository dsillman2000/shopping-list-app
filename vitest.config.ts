import { defineConfig } from "vitest/config";
import path from "path";

export default defineConfig({
  test: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
    // The workers pool requires @cloudflare/vitest-pool-workers/config to be working.
    // Since we're hitting a specifier issue, we'll focus on unit tests for now 
    // or use the standard vitest config if possible.
  },
});

