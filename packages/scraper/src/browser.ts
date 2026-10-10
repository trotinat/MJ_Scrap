import type { Browser, BrowserContext } from "playwright";
import { assertAllowedUrl } from "./url";
import { looksBlocked, AccessBlockedError } from "./http";

const TRACKERS =
  /(googletagmanager|google-analytics|doubleclick|googlesyndication|facebook|fbcdn|hotjar|tiktok|snapchat|clarity\.ms|criteo|taboola|outbrain|bing\.com|linkedin|twitter|segment\.(io|com)|newrelic|sentry\.io|nr-data)/i;

export interface RenderOptions {
  userAgent: string;
  timeoutMs: number;
  /** How many times to scroll / click "Voir plus" to load more products. */
  maxPages: number;
  minDelayMs: number;
}

/**
 * Renders client-side listing pages with headless Chromium. Images, fonts and
 * media are blocked to keep CPU/RAM/bandwidth low, as are analytics/ads
 * trackers. Only the navigation URL is chosen by us, and it is validated
 * against the allow-listed host. One browser is reused for the whole run and
 * closed afterwards.
 */
export class ListingRenderer {
  private browser: Browser | null = null;
  private context: BrowserContext | null = null;

  constructor(private readonly opts: RenderOptions) {}

  private async ensure(): Promise<BrowserContext> {
    if (this.context) return this.context;
    const { chromium } = await import("playwright");
    this.browser = await chromium.launch({
      headless: true,
      args: ["--disable-dev-shm-usage", "--no-zygote", "--disable-gpu", "--disable-extensions"],
    });
    this.context = await this.browser.newContext({
      userAgent: this.opts.userAgent,
      locale: "fr-MA",
      timezoneId: "Africa/Casablanca",
      viewport: { width: 1366, height: 900 },
      javaScriptEnabled: true,
    });
    await this.context.route("**/*", (route) => {
      const req = route.request();
      const type = req.resourceType();
      if (type === "image" || type === "font" || type === "media") return route.abort();
      let host = "";
      try {
        host = new URL(req.url()).hostname;
      } catch {
        return route.abort();
      }
      // The page's own scripts may call its search/catalog provider, so other
      // hosts are allowed — except analytics/ads, which are useless here.
      if (TRACKERS.test(host)) return route.abort();
      return route.continue();
    });
    return this.context;
  }

  /** Returns the rendered HTML after loading up to `maxPages` batches of products. */
  async render(url: string): Promise<string> {
    assertAllowedUrl(url);
    const ctx = await this.ensure();
    const page = await ctx.newPage();
    try {
      const resp = await page.goto(url, { waitUntil: "domcontentloaded", timeout: this.opts.timeoutMs });
      const status = resp?.status() ?? 0;
      await page.waitForSelector('a[href*="/p/"]', { timeout: Math.min(20_000, this.opts.timeoutMs) }).catch(() => undefined);
      const first = await page.content();
      if (looksBlocked(status, first)) {
        throw new AccessBlockedError(`Accès refusé lors du rendu (HTTP ${status})`, status);
      }

      let previousCount = await page.locator('a[href*="/p/"]').count();
      for (let i = 1; i < this.opts.maxPages; i++) {
        await page.mouse.wheel(0, 6000);
        await page.waitForTimeout(400);
        const more = page.getByRole("button", { name: /voir plus|charger plus|afficher plus/i }).first();
        if (await more.isVisible().catch(() => false)) {
          await more.click({ timeout: 5000 }).catch(() => undefined);
        }
        await page.waitForTimeout(1200);
        const count = await page.locator('a[href*="/p/"]').count();
        if (count <= previousCount) break; // nothing more loaded
        previousCount = count;
      }
      return await page.content();
    } finally {
      await page.close().catch(() => undefined);
    }
  }

  async close(): Promise<void> {
    await this.context?.close().catch(() => undefined);
    await this.browser?.close().catch(() => undefined);
    this.context = null;
    this.browser = null;
  }
}
