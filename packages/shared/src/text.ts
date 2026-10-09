/**
 * Text normalization used for matching keywords, brands and characteristics.
 * Lowercases, strips accents and collapses everything that is not a letter or
 * digit into single spaces, so "Téléviseur QLED 55\"" -> "televiseur qled 55".
 */
export function normalizeText(input: string | null | undefined): string {
  if (!input) return "";
  return input
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/&quot;|&#34;/g, '"')
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

/** Splits a normalized string into tokens. */
export function tokens(input: string): string[] {
  const n = normalizeText(input);
  return n ? n.split(" ") : [];
}

/**
 * True when every token of `phrase` appears in `haystack` as the start of a
 * word ("televiseur" matches "televiseurs", "4k" matches "4k").
 * Tokens of one or two characters must match a whole word, so "W" (women's
 * models such as "GALAXY 8 W") does not match "white". An empty phrase never matches.
 */
export function phraseMatches(haystack: string, phrase: string): boolean {
  const phraseTokens = tokens(phrase);
  if (phraseTokens.length === 0) return false;
  const words = tokens(haystack);
  return phraseTokens.every((t) => words.some((w) => (t.length <= 2 ? w === t : w.startsWith(t))));
}

/** True when any phrase matches. */
export function anyPhraseMatches(haystack: string, phrases: readonly string[]): boolean {
  return phrases.some((p) => phraseMatches(haystack, p));
}

/** Uppercase alphanumeric only — used for model references. */
export function normalizeRef(input: string | null | undefined): string {
  if (!input) return "";
  return input
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "");
}

/** Cleans a list of user-provided strings: trims, drops empties and duplicates. */
export function cleanList(values: readonly string[] | null | undefined): string[] {
  if (!values) return [];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of values) {
    const v = raw.trim();
    if (!v) continue;
    const key = normalizeText(v);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(v);
  }
  return out;
}
