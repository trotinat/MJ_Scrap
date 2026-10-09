import type { CheerioAPI, Cheerio } from "cheerio";
import type { AnyNode } from "domhandler";

const SKIP = new Set(["script", "style", "noscript", "template", "svg", "iframe", "head"]);

/**
 * Collects the visible text of an element as an ordered list of trimmed,
 * non-empty text nodes. Keeping node boundaries (instead of `.text()`, which
 * glues "MARJANE" and "89900DH" together) makes price parsing far more robust.
 */
export function textLines($: CheerioAPI, root: Cheerio<AnyNode>): string[] {
  const out: string[] = [];
  const walk = (node: AnyNode) => {
    if (node.type === "text") {
      const t = (node as unknown as { data: string }).data.replace(/\s+/g, " ").trim();
      if (t) out.push(decodeEntities(t));
      return;
    }
    if (node.type === "tag" || node.type === "root") {
      const el = node as unknown as { name?: string; children?: AnyNode[]; attribs?: Record<string, string> };
      if (el.name && SKIP.has(el.name)) return;
      if (el.attribs && (el.attribs.hidden !== undefined || el.attribs["aria-hidden"] === "true")) return;
      for (const child of el.children ?? []) walk(child);
    }
  };
  root.each((_, n) => walk(n));
  return out;
}

export function decodeEntities(s: string): string {
  return s
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&amp;/g, "&")
    .replace(/&nbsp;/g, " ");
}

/** Absolute http(s) URL or null. Rejects data:, javascript:, etc. */
export function safeHttpUrl(raw: string | undefined | null, base: string): string | null {
  if (!raw) return null;
  const first = raw.split(",")[0]!.trim().split(/\s+/)[0]!; // srcset -> first URL
  try {
    const u = new URL(first, base);
    if (u.protocol !== "https:" && u.protocol !== "http:") return null;
    if (u.protocol === "http:") u.protocol = "https:";
    return u.toString().slice(0, 1000);
  } catch {
    return null;
  }
}
