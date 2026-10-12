import { defineConfig } from "tsup";

// Bundles the worker and the workspace packages into dist/; third-party
// dependencies (pg, playwright, pino…) stay external and are installed in the image.
export default defineConfig({
  entry: ["src/index.ts", "src/cli.ts", "src/bot.ts"],
  format: ["esm"],
  platform: "node",
  target: "node22",
  outDir: "dist",
  clean: true,
  sourcemap: true,
  splitting: true,
  noExternal: [/^@mdw\//],
  external: ["playwright", "playwright-core", "pg", "pg-native", "pino", "croner", "drizzle-orm", "zod", "cheerio", "undici"],
});
