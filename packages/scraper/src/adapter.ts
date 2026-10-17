import type { ListingItem, ProductDetail } from "@mdw/shared";
import { AccessBlockedError, HttpError, PoliteFetcher, type FetcherOptions } from "./http";
import { ListingRenderer } from "./browser";
import { parseListingHtml } from "./parse/listing";
import { parseEmbeddedProducts } from "./parse/embedded";
import { parseProductPage, ProductParseError } from "./parse/product";
import { parseCampaignLinks } from './parse/campaigns';
import { siteUrl } from "./url";

export interface AdapterOptions extends FetcherOptions {
  /** "auto": HTTP first, Playwright when the server HTML has no products. */
  renderMode: "auto" | "never" | "always";
  renderTimeoutMs: number;
  /** Browser channel for rendering. "auto" tries Edge, Chrome, then bundled Chromium. */
  renderChannel?: "auto" | "msedge" | "chrome" | "chromium";
}

export interface ListingResult {
  path: string;
  items: ListingItem[];
  method: "http" | "browser";
  pagesLoaded: number;
  /** Only complete catalog coverage can be used to infer that an offer disappeared. */
  complete?: boolean;
}

export type DetailResult =
  | { kind: "ok"; detail: ProductDetail }
  | { kind: "gone"; status: number }
  | { kind: "error"; message: string; status?: number; unavailable?: boolean };

/** Interface used by the worker, so tests can inject a fake site. */
export interface SiteAdapter {
  discover(path: string, maxPages: number): Promise<ListingResult>;
  fetchProduct(url: string): Promise<DetailResult>;
  discoverCampaigns?(): Promise<string[]>;
  close(): Promise<void>;
  readonly requestCount: number;
}

/**
 * Marjane Mall adapter: HTTP + Cheerio wherever the server renders the data,
 * Playwright only for client-rendered listings.
 */
export class MarjaneAdapter implements SiteAdapter {
  private readonly fetcher: PoliteFetcher;
  private renderer: ListingRenderer | null = null;
  private renderDisabled = false;

  constructor(private readonly opts: AdapterOptions) {
    this.fetcher = new PoliteFetcher(opts);
  }

  get requestCount(): number {
    return this.fetcher.requestCount;
  }

  private getRenderer(maxPages: number): ListingRenderer {
    if (!this.renderer) {
      this.renderer = new ListingRenderer({
        userAgent: this.opts.userAgent,
        timeoutMs: this.opts.renderTimeoutMs,
        maxPages,
        minDelayMs: this.opts.minDelayMs,
        channel: this.opts.renderChannel ?? "auto",
      });
    }
    return this.renderer;
  }

  async discoverCampaigns(): Promise<string[]> {
    const res = await this.fetcher.get(siteUrl('/'));
    if (res.status >= 400) throw new HttpError(`Campagnes HTTP ${res.status}`,res.status,res.url);
    return parseCampaignLinks(res.body);
  }

  async discover(path: string, maxPages: number): Promise<ListingResult> {
    const url = siteUrl(path);
    // One plain request per listing. The products are read from the page data
    // the server embeds (exact JSON values); the visible-text parser is only a
    // fallback. URL filters (size, gender…) are not applied by the server: the
    // criterion's own filters do that work afterwards.
    const filtered = new URL(url).searchParams.size > 0;
    if (filtered && this.opts.renderMode === 'never') throw new HttpError('Filtres non vérifiables sans rendu navigateur', 0, url);
    if (this.opts.renderMode !== "always" && !filtered) {
      const res = await this.fetcher.get(url);
      if (res.status === 404 || res.status === 410) throw new HttpError(`Page introuvable (HTTP ${res.status})`, res.status, url);
      if (res.status >= 400) throw new HttpError(`HTTP ${res.status}`, res.status, url);
      const items = mergeItems(parseEmbeddedProducts(res.body, path), parseListingHtml(res.body, path));
      if (items.length > 0 || this.opts.renderMode === "never") {
        return { path, items, method: "http", pagesLoaded: 1, complete: false };
      }
    }
    // Last resort for a page whose server response holds no product at all.
    await this.fetcher.loadRobots().then((r) => {
      const u = new URL(url);
      if (!r.isAllowed(u.pathname + u.search)) throw new HttpError("Interdit par robots.txt", 0, url);
    });
    // A broken or missing browser must never stall the run: after one failure
    // (or a hard timeout) the remaining client-rendered pages are skipped.
    if (this.renderDisabled) throw new HttpError('Rendu indisponible après un échec précédent : couverture non vérifiée', 0, url);
    try {
      const html = await withTimeout(this.getRenderer(maxPages).render(url), this.opts.renderTimeoutMs, "Rendu du navigateur trop long");
      // Embedded server sliders can ignore URL facets; filtered pages use rendered cards only.
      const items = filtered ? parseListingHtml(html, path) : mergeItems(parseEmbeddedProducts(html, path), parseListingHtml(html, path));
      return { path, items, method: "browser", pagesLoaded: this.renderer?.pagesLoaded ?? 1, complete: false };
    } catch (err) {
      if (err instanceof AccessBlockedError) throw err;
      this.renderDisabled = true;
      await this.renderer?.close().catch(() => undefined);
      this.renderer = null;
      throw new HttpError(`Navigateur indisponible : ${String((err as Error).message ?? err).split("\n")[0]?.slice(0, 160)}. Lancez « pnpm setup:browser » une fois.`, 0, url);
    }
  }

  async fetchProduct(url: string): Promise<DetailResult> {
    let res;
    try {
      res = await this.fetcher.get(url);
    } catch (err) {
      if (err instanceof HttpError) return { kind: "error", message: err.message, status: err.status };
      throw err; // AccessBlockedError / robots errors abort the run
    }
    if (res.status === 404 || res.status === 410) return { kind: "gone", status: res.status };
    if (res.status >= 400) return { kind: "error", message: `HTTP ${res.status}`, status: res.status };
    try {
      return { kind: "ok", detail: parseProductPage(res.body, res.url || url) };
    } catch (err) {
      if (err instanceof ProductParseError) {
        // A redirect to a listing / 404 template means the product is gone.
        if (/introuvable|404/i.test(res.body.slice(0, 5000)) && !/\/p\//.test(res.url)) return { kind: "gone", status: 404 };
        return { kind: "error", message: `Extraction impossible : ${err.message}`, ...(err.unavailable ? {unavailable:true} : {}) };
      }
      throw err;
    }
  }

  /** Raw HTML of a page (used by the probe command to save fixtures). */
  async fetchRaw(url: string): Promise<{ status: number; body: string }> {
    const res = await this.fetcher.get(url);
    return { status: res.status, body: res.body };
  }

  async renderRaw(url: string, maxPages: number): Promise<string> {
    return this.getRenderer(maxPages).render(url);
  }

  async close(): Promise<void> {
    await this.renderer?.close();
  }
}

/** Page-data items first (exact values); text-parsed cards only fill gaps. */
function mergeItems(primary: ListingItem[], fallback: ListingItem[]): ListingItem[] {
  const out = new Map(primary.map((i) => [i.url, i]));
  for (const i of fallback) {
    const p = out.get(i.url);
    if (!p) out.set(i.url, i);
    else if (!p.imageUrl && i.imageUrl) p.imageUrl = i.imageUrl;
  }
  return [...out.values()];
}

function withTimeout<T>(p: Promise<T>, ms: number, message: string): Promise<T> {
  let t: NodeJS.Timeout;
  const timeout = new Promise<never>((_, rej) => {
    t = setTimeout(() => rej(new Error(message)), ms);
  });
  return Promise.race([p, timeout]).finally(() => clearTimeout(t));
}
