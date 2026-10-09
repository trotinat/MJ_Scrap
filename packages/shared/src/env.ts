import { existsSync } from "node:fs";
import path from "node:path";

/**
 * Loads the project-root `.env` (next to pnpm-workspace.yaml) for local runs
 * without Docker. Variables already set in the environment always win, so
 * Docker / systemd configuration is never overridden.
 */
export function loadRootEnv(start = process.cwd()): string | null {
  let dir = path.resolve(start);
  for (let i = 0; i < 6; i++) {
    if (existsSync(path.join(dir, "pnpm-workspace.yaml"))) {
      const file = path.join(dir, ".env");
      if (!existsSync(file)) return null;
      process.loadEnvFile(file); // Node >= 20.12; does not override existing variables
      return file;
    }
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return null;
}
