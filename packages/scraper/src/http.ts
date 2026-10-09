import { EnvHttpProxyAgent, setGlobalDispatcher } from "undici";
import { RobotsRules } from "./robots";
import { assertAllowedUrl, SITE_ORIGIN } from "./url";

export interface FetcherOptions {
  userAgent: string;
  /** Minimum delay between two requests to the site (ms). */
  minDelayMs: number;
  timeoutMs: number;
  maxRetries: number;
  respectRobots: boolean;
  /** Injected for tests. */
  fetchImpl?: typeof fetch;
  sleep?: (ms: number) => Promise<void>;
  now?: () => number;
}

export interface FetchResult {
  url: string;
  status: number;
  body: string;
}

export class AccessBlockedError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = "AccessBlockedError";
  }
}

export class RobotsDisallowedError extends Error {
  constructor(readonly path: string) {
    super(`Chemin interdit par robots.txt : ${path}`);
    this.name = "RobotsDisallowedError";
  }
}

export class HttpError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly url: string,
  ) {
    super(message);
    this.name = "HttpError";
  }
}

let proxyConfigured = false;
/** Honour HTTPS_PROXY / NO_PROXY when the host requires an egress proxy. */
export function configureProxyFromEnv(): void {
  if (proxyConfigured) return;
  proxyConfigured = true;
  if (process.env.HTTPS_PROXY || process.env.https_proxy || process.env.HTTP_PROXY) {
    setGlobalDispatcher(new EnvHttpProxyAgent());
  }
}

const BLOCK_MARKERS = [/captcha/i, /cf-chl|challenge-platform|cf_chl_opt/i, /access denied/i, /are you a robot/i, /perimeterx|px-captcha/i, /datadome/i];

export function looksBlocked(status: number, body: string): boolean {
  if (status === 401 || status === 403 || status === 429 || status === 503) {
    return BLOCK_MARKERS.some((re) => re.test(body.slice(0, 20000))) || status === 403;
  }
  // Some anti-bot systems answer 200 with an interstitial page.
  return body.length < 20000 && BLOCK_MARKERS.slice(0, 2).some((re) => re.test(body)) && !/\/p\//.test(body);
}

/**
 * Polite HTTP client: one request at a time, a minimum delay (with jitter)
 * between requests, bounded retries with exponential backoff on transient
 * failures, Retry-After support, robots.txt enforcement and host allow-listing.
 * It never attempts to bypass CAPTCHAs or access controls: a block aborts.
 */
export class PoliteFetcher {
  private lastRequestAt = 0;
  private robots: RobotsRules | null = null;
  private readonly fetchImpl: typeof fetch;
  private readonly sleep: (ms: number) => Promise<void>;
  private readonly now: () => number;
  requestCount = 0;

  constructor(private readonly opts: FetcherOptions) {
    this.fetchImpl = opts.fetchImpl ?? ((...a) => fetch(...a));
    this.sleep = opts.sleep ?? ((ms) => new Promise((r) => setTimeout(r, ms)));
    this.now = opts.now ?? (() => Date.now());
  }

  async loadRobots(): Promise<RobotsRules> {
    if (this.robots) return this.robots;
    if (!this.opts.respectRobots) return (this.robots = RobotsRules.allowAll());
    try {
      const res = await this.rawGet(`${SITE_ORIGIN}/robots.txt`);
      if (res.status >= 200 && res.status < 300) {
        this.robots = RobotsRules.parse(res.body, this.opts.userAgent);
      } else if (res.status >= 400 && res.status < 500) {
        this.robots = RobotsRules.allowAll(); // RFC 9309: 4xx => no restrictions
      } else {
        throw new HttpError(`robots.txt indisponible (HTTP ${res.status})`, res.status, `${SITE_ORIGIN}/robots.txt`);
      }
    } catch (err) {
      // RFC 9309: if robots.txt is unreachable, assume complete disallow.
      throw new AccessBlockedError(`Impossible de lire robots.txt : ${(err as Error).message}`, 0);
    }
    return this.robots;
  }

  async get(url: string): Promise<FetchResult> {
    const u = assertAllowedUrl(url);
    const robots = await this.loadRobots();
    const pathQuery = u.pathname + u.search;
    if (!robots.isAllowed(pathQuery)) throw new RobotsDisallowedError(pathQuery);

    let attempt = 0;
    for (;;) {
      attempt++;
      let res: FetchResult & { retryAfterMs: number | null };
      try {
        res = await this.rawGet(u.toString());
      } catch (err) {
        if (attempt > this.opts.maxRetries) throw err;
        await this.sleep(this.backoff(attempt));
        continue;
      }
      if (looksBlocked(res.status, res.body)) {
        throw new AccessBlockedError(
          `Accès refusé par le site (HTTP ${res.status}). Le scraper s'arrête sans contourner la protection.`,
          res.status,
        );
      }
      if (res.status === 429 || res.status >= 500) {
        if (attempt > this.opts.maxRetries) {
          throw new HttpError(`HTTP ${res.status} après ${attempt} tentatives`, res.status, u.toString());
        }
        await this.sleep(this.backoff(attempt, res.retryAfterMs));
        continue;
      }
      return { url: res.url, status: res.status, body: res.body };
    }
  }

  private backoff(attempt: number, retryAfterMs?: number | null): number {
    if (retryAfterMs && retryAfterMs > 0) return Math.min(retryAfterMs, 120_000);
    return Math.min(2 ** attempt * 1000 + Math.floor(Math.random() * 500), 60_000);
  }

  private async rawGet(url: string): Promise<FetchResult & { retryAfterMs: number | null }> {
    // Politeness: enforce spacing between requests (with up to 30% jitter).
    const wait = this.lastRequestAt + this.opts.minDelayMs * (1 + Math.random() * 0.3) - this.now();
    if (wait > 0) await this.sleep(wait);
    this.lastRequestAt = this.now();
    this.requestCount++;

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.opts.timeoutMs);
    try {
      const res = await this.fetchImpl(url, {
        method: "GET",
        redirect: "follow",
        signal: controller.signal,
        headers: {
          "user-agent": this.opts.userAgent,
          accept: "text/html,application/xhtml+xml;q=0.9,*/*;q=0.8",
          "accept-language": "fr-MA,fr;q=0.9,en;q=0.5",
        },
      });
      // Redirects must stay on the allowed host.
      if (res.url) assertAllowedUrl(res.url);
      const body = await res.text();
      const ra = res.headers.get("retry-after");
      const retryAfterMs = ra ? (Number.isFinite(Number(ra)) ? Number(ra) * 1000 : Math.max(0, Date.parse(ra) - Date.now())) : null;
      return { url: res.url || url, status: res.status, body, retryAfterMs };
    } finally {
      clearTimeout(timer);
    }
  }
}
