import { defineConfig } from "vitest/config";

export default defineConfig({
  // No CSS in this package — point Vite's PostCSS lookup at an empty inline
  // config so it doesn't search upward and pick up the parent neural-draft
  // project's tailwind-based postcss.config.js.
  css: {
    postcss: { plugins: [] },
  },
  test: {
    include: ["tests/**/*.test.ts"],
    environment: "node",
    globals: false,
    testTimeout: 10_000,
    coverage: {
      provider: "v8",
      include: ["src/**/*.ts"],
      exclude: ["src/types.ts", "src/index.ts"],
    },
  },
});
