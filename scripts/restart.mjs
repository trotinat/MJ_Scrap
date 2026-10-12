#!/usr/bin/env node
/**
 * Clean restart in one command:
 *
 *   pnpm restart            (dev, hot-reload)
 *   pnpm restart --prod     (optimized build)
 *
 * Kills any running local stack (web on 3000, worker, embedded PostgreSQL on
 * 54329), clears a stale lock, then starts a fresh one. Day to day you don't
 * need this — `pnpm start:local` already hot-reloads web (next dev) and worker
 * (tsx watch) on every change. Use this after Tailwind/config edits that the
 * dev server doesn't pick up, or to recover from a crashed process.
 */
import { spawn, spawnSync } from "node:child_process";
import { existsSync, rmSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const prod = process.argv.includes("--prod");

function killStack() {
  if (process.platform === "win32") {
    // Kill only the stack's own processes (start-local, the web/worker, the
    // embedded Postgres) — never this restart script or the pnpm that runs it.
    const ps =
      "Get-CimInstance Win32_Process -Filter \"Name='node.exe' OR Name='postgres.exe'\" " +
      "| Where-Object { $_.CommandLine -match 'start-local|embedded-postgres|apps\\\\web|apps\\\\worker' " +
      `-and $_.CommandLine -notmatch 'restart' -and $_.ProcessId -ne ${process.pid} } ` +
      "| ForEach-Object { try { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue } catch {} }";
    spawnSync("powershell", ["-NoProfile", "-Command", ps], { stdio: "ignore" });
  } else {
    spawnSync("pkill", ["-f", "start-local.mjs"], { stdio: "ignore" });
    spawnSync("pkill", ["-f", `${root}/.localdb`], { stdio: "ignore" });
  }
}

console.log("Arrêt de l'instance en cours…");
killStack();
// Give the OS a moment to release the ports and the data directory.
await new Promise((r) => setTimeout(r, 2500));

const pid = path.join(root, ".localdb", "postmaster.pid");
if (existsSync(pid)) {
  try {
    rmSync(pid);
  } catch {
    /* ignore */
  }
}

console.log(`Démarrage d'une nouvelle instance (${prod ? "prod" : "dev"})…\n`);
const child = spawn("pnpm", [prod ? "start:prod" : "start:local"], { cwd: root, stdio: "inherit", shell: process.platform === "win32" });
child.on("exit", (code) => process.exit(code ?? 0));
process.on("SIGINT", () => child.kill("SIGINT"));
process.on("SIGTERM", () => child.kill("SIGTERM"));
