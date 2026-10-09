#!/usr/bin/env node
/**
 * End-to-end smoke test of a running dashboard (local or deployed).
 *
 *   BASE_URL=https://deals.example.ma E2E_EMAIL=… E2E_PASSWORD=… node scripts/e2e-smoke.mjs
 *
 * Checks: authentication guard, login, every page renders (HTTP 200, no JS
 * errors), criterion create → edit → duplicate → delete through the UI,
 * CSV/XLSX export, and that export is refused without a session.
 * It creates a temporary criterion named "E2E …" and deletes it at the end.
 */
import { chromium } from "playwright";

const base = (process.env.BASE_URL ?? "http://localhost:3000").replace(/\/$/, "");
const email = process.env.E2E_EMAIL;
const password = process.env.E2E_PASSWORD;
if (!email || !password) {
  console.error("E2E_EMAIL et E2E_PASSWORD sont requis");
  process.exit(2);
}

const failures = [];
const check = (ok, label) => {
  console.log(`${ok ? "✔" : "✘"} ${label}`);
  if (!ok) failures.push(label);
};

const browser = await chromium.launch();
try {
  const anon = await browser.newContext();
  const ap = await anon.newPage();
  await ap.goto(`${base}/promotions`);
  check(ap.url().endsWith("/login"), "redirection vers /login sans session");
  const anonExport = await anon.request.get(`${base}/api/export?format=csv`, { maxRedirects: 0 });
  check(anonExport.status() === 401, "export refusé sans session (401)");

  const ctx = await browser.newContext({ viewport: { width: 1366, height: 900 } });
  const page = await ctx.newPage();
  const jsErrors = [];
  page.on("pageerror", (e) => jsErrors.push(e.message));

  await page.goto(`${base}/login`);
  await page.fill("#email", email);
  await page.fill("#password", password);
  await page.click("button[type=submit]");
  await page.waitForURL(`${base}/`, { timeout: 20000 });
  check(true, "connexion");

  for (const p of ["/", "/criteres", "/promotions", "/historique-prix", "/notifications", "/collectes", "/parametres", "/admin"]) {
    const r = await page.goto(`${base}${p}`);
    check(r?.status() === 200, `page ${p}`);
  }

  // Criterion lifecycle through the UI.
  const name = `E2E ${Date.now()}`;
  await page.goto(`${base}/criteres/nouveau`);
  await page.fill("#name", name);
  const kw = page.getByLabel("Mots-clés", { exact: true });
  await kw.fill("téléviseur");
  await kw.press("Enter");
  await page.locator("input[inputmode=decimal]").nth(1).fill("6000"); // prix maximum
  await page.getByRole("button", { name: "Ajouter une règle" }).first().click();
  await page.getByLabel("Valeur").first().fill("55");
  await page.getByRole("button", { name: "Créer le critère" }).click();
  await page.waitForURL(/\/criteres\/[0-9a-f-]{36}$/, { timeout: 20000 });
  check((await page.content()).includes(name), "création d'un critère");
  const detailUrl = page.url();

  await page.goto(`${detailUrl}/modifier`);
  await page.fill("#name", `${name} modifié`);
  await page.getByRole("button", { name: "Enregistrer" }).click();
  await page.waitForURL(detailUrl, { timeout: 20000 });
  check((await page.content()).includes(`${name} modifié`), "modification du critère");

  await page.getByRole("button", { name: "Dupliquer" }).click();
  await page.waitForURL(/\/modifier$/, { timeout: 20000 });
  const copyUrl = page.url().replace(/\/modifier$/, "");
  check((await page.inputValue("#name")).includes("(copie)"), "duplication du critère");

  for (const url of [copyUrl, detailUrl]) {
    await page.goto(url);
    page.once("dialog", (d) => d.accept());
    await page.getByRole("button", { name: "Supprimer" }).click();
    await page.waitForURL(`${base}/criteres`, { timeout: 20000 });
  }
  await page.goto(`${base}/criteres`);
  check(!(await page.content()).includes(name), "suppression des critères de test");

  const csv = await page.request.get(`${base}/api/export?format=csv`);
  check(csv.status() === 200 && (await csv.text()).startsWith("﻿Produit;"), "export CSV");
  const xlsx = await page.request.get(`${base}/api/export?format=xlsx`);
  const body = await xlsx.body();
  check(xlsx.status() === 200 && body.subarray(0, 2).toString() === "PK", "export Excel");

  check(jsErrors.length === 0, `aucune erreur JavaScript${jsErrors.length ? ` (${jsErrors.join(" | ")})` : ""}`);
} catch (err) {
  failures.push(String(err));
  console.error(err);
} finally {
  await browser.close();
}

console.log(failures.length ? `\n${failures.length} échec(s)` : "\nTous les contrôles sont passés.");
process.exit(failures.length ? 1 : 0);
