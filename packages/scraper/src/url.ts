/**
 * URL guards. The scraper only ever talks to Marjane Mall over HTTPS; every
 * URL — including ones built from user-entered category paths — goes through
 * these helpers so that the application cannot be turned into an SSRF proxy.
 */
export const SITE_ORIGIN = "https://www.marjanemall.ma";
const ALLOWED_HOSTS = new Set(["www.marjanemall.ma", "marjanemall.ma"]);

export class DisallowedUrlError extends Error {
  constructor(url: string) {
    super(`URL non autorisée : ${url}`);
    this.name = "DisallowedUrlError";
  }
}

export function assertAllowedUrl(raw: string): URL {
  let u: URL;
  try {
    u = new URL(raw);
  } catch {
    throw new DisallowedUrlError(raw);
  }
  if (u.protocol !== "https:" || !ALLOWED_HOSTS.has(u.hostname) || u.username || u.password || (u.port && u.port !== "443")) {
    throw new DisallowedUrlError(raw);
  }
  return u;
}

/** Builds an absolute site URL from a path such as "/tv-son-photo". */
export function siteUrl(pathOrUrl: string): string {
  const u = new URL(pathOrUrl, SITE_ORIGIN);
  assertAllowedUrl(u.toString());
  u.hostname = "www.marjanemall.ma";
  return u.toString();
}

/** Product URLs look like /p/<slug>-<id>. Returns the canonical URL without query/hash. */
export function canonicalProductUrl(href: string): string | null {
  let u: URL;
  try {
    u = new URL(href, SITE_ORIGIN);
  } catch {
    return null;
  }
  if (!ALLOWED_HOSTS.has(u.hostname)) return null;
  const m = /^\/p\/([a-z0-9][a-z0-9-]*[a-z0-9])\/?$/i.exec(u.pathname);
  if (!m) return null;
  return `${SITE_ORIGIN}/p/${m[1]!.toLowerCase()}`;
}

/**
 * The product identifier is the last hyphen-separated segment of the slug
 * ("…-qa55q6faauxmv-abbb332004180907425" -> "abbb332004180907425").
 * Observed IDs are 8+ alphanumeric characters containing digits.
 */
export function sourceIdFromUrl(url: string): string | null {
  const canonical = canonicalProductUrl(url);
  if (!canonical) return null;
  const slug = canonical.slice(canonical.lastIndexOf("/p/") + 3);
  const last = slug.slice(slug.lastIndexOf("-") + 1);
  if (/^[a-z0-9]{6,40}$/i.test(last) && /\d/.test(last)) return last.toLowerCase();
  // Fall back to the whole slug: still stable and unique per listing.
  return slug.toLowerCase();
}

export function pathOf(url: string): string {
  return new URL(url, SITE_ORIGIN).pathname;
}
