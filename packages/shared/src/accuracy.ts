import type { Criterion, CriterionFilters } from './criteria';
import type { MatchableProduct } from './types';
import type { ShopperProfile } from './profile';
import { garmentKind, isFashionPath } from './profile';
import { normalizeText, phraseMatches } from './text';

export type FashionKind = 'shoes' | 'pants' | 'tops';
const TYPE_WORDS: Record<FashionKind, string[]> = {
  shoes: ['chaussure', 'basket', 'sneaker', 'shoes', 'sandale', 'claquette', 'mule', 'running'],
  pants: ['pantalon', 'jean', 'chino', 'cargo', 'jogger', 'legging', 'bermuda'],
  tops: ['t shirt', 'tee shirt', 'polo', 'sweat', 'hoodie', 'chemise', 'pull', 'veste'],
};

export function fashionKind(f: CriterionFilters): FashionKind | null {
  if (f.productType && f.productType !== 'any') return f.productType;
  const specific = f.categoryPaths.map(garmentKind).find(k => k !== 'mixed');
  if (specific) return specific;
  if (!f.categoryPaths.some(isFashionPath)) return null;
  const words = [...f.keywords, ...f.altKeywords].join(' ');
  return (Object.keys(TYPE_WORDS) as FashionKind[]).find(k => TYPE_WORDS[k].some(w => phraseMatches(words, w))) ?? null;
}

/** Accessory descriptions mention garments without being garments themselves. */
export function isFashionAccessory(title: string): boolean {
  return /^(?:(?:lot|set|pack) de \d+ )?(?:sac de (?:lavage|rangement)|filet de lavage|housse|etagere|range chaussures|rangement|organisateur|cintre|support|panier|boite|sangle)s?\b/.test(normalizeText(title));
}

export function matchesFashionType(f: CriterionFilters, title: string, brand: string | null, rawSpecs: Record<string,string> = {}): boolean {
  const kind = fashionKind(f);
  if (!kind) return true;
  if (isFashionAccessory(title)) return false;
  const b = normalizeText(brand);
  const text = normalizeText(title).replace(/\bpepe jeans\b/g, '').replace(b ? new RegExp('\\b' + b + '\\b', 'g') : /$^/, '')
    + ' ' + Object.entries(rawSpecs).filter(([k]) => /type de produit|product type/i.test(k)).map(([,v]) => v).join(' ');
  return TYPE_WORDS[kind].some(w => phraseMatches(text,w));
}

/** Profile constraints apply only to fashion searches, never to unrelated goods. */
export function withProfileConstraints(c: Criterion, p: ShopperProfile): Criterion {
  const kind = fashionKind(c.filters);
  if (!kind) return c;
  const f = c.filters;
  const facet = (code: string) => [...new Set(f.categoryPaths.flatMap(path => new URL(path, 'https://www.marjanemall.ma').searchParams.getAll(code)))];
  const fromUrl = facet(kind === 'shoes' ? 'maas_46800' : 'taille_master');
  const fallback = kind === 'shoes' ? p.shoeSizes : kind === 'pants' ? p.pantsSizes : p.clothingSizes;
  return {...c, filters: {...f, productType: kind,
    maxPrice: f.maxPrice ?? p.maxPrice,
    minDiscountPct: f.minDiscountPct ?? p.minDiscountPct,
    preferredBrands: f.preferredBrands.length ? f.preferredBrands : p.preferredBrands,
    excludedBrands: [...new Set([...f.excludedBrands, ...p.excludedBrands])],
    preferredSellers: f.preferredSellers.length ? f.preferredSellers : p.preferredSellers,
    sizes: f.sizes?.length ? f.sizes : fromUrl.length ? fromUrl : fallback,
    genders: f.genders?.length ? f.genders : facet('maas_28003').length ? facet('maas_28003') : p.genders,
  }};
}

/** Product attributes must come from product data, never from a requested filter URL. */
export function fashionFailures(f: CriterionFilters, p: MatchableProduct): string[] {
  const failures: string[] = [];
  const kind = fashionKind(f);
  // Explicit audience requirements also apply to accessories such as caps.
  const genders = f.genders ?? [];
  if (genders.length) {
    const genderText = Object.entries(p.rawSpecs)
      .filter(([k]) => /genre|gender|sexe/.test(normalizeText(k)))
      .map(([,v]) => normalizeText(v)).join(' ');
    const text = genderText || normalizeText(p.title);
    const aliases: Record<string,string[]> = {Homme:['homme','men','mens','hommes'],Femme:['femme','women','womens'],Garçon:['garcon','boy'],Fille:['fille','girl']};
    const found = Object.entries(aliases).filter(([,words]) => words.some(w => phraseMatches(text,w))).map(([g]) => g);
    const unisex = /\b(unisexe|unisex|mixte)\b/.test(text);
    if (!found.length && !unisex) failures.push('genre non vérifiable sur le produit');
    else if (!found.some(g => genders.includes(g)) && !(unisex && genders.some(g => ['Homme','Femme','Mixte'].includes(g)))) {
      failures.push('genre différent de votre recherche');
    }
  }
  if (!kind) return failures;
  // A brand such as PEPE JEANS cannot prove that a sneaker is a pair of jeans.
  const title = normalizeText(p.title);
  const ownType = matchesFashionType(f,p.title,p.brand,p.rawSpecs);
  if (!ownType) failures.push('type de produit non vérifié pour cette recherche');
  const attrs = Object.entries(p.rawSpecs).map(([k,v]) => [normalizeText(k), v] as const);
  const sizes = f.sizes ?? [];
  if (sizes.length) {
    const label = /pointure|taille|size/;
    const available = attrs.filter(([k]) => label.test(k) && /disponible|available/.test(k));
    const values = (available.length ? available : attrs.filter(([k]) => label.test(k))).map(([,v]) => v).filter(Boolean);
    const sizeInTitle = /\b(?:pointure|taille|size)\s*[: -]?\s*([0-9]{2}(?:[.,][0-9])?|xxxl|xxl|xl|xs|xxs|s|m|l)\b/gi;
    if (!available.length) for (const m of p.title.matchAll(sizeInTitle)) values.push(normalizeText(m[1]));
    if (!values.length) failures.push('taille non vérifiable : aucune taille produit confirmée');
    else if (!sizes.some(s => values.some(v => {
      const options = v.match(/\d{2}(?:\s+\d\/\d|[.,]\d)?|\b(?:xxxl|xxl|xxs|xl|xs|s|m|l)\b/gi) ?? [];
      return options.some(option => option.replace(/\s+/g,' ').toLowerCase() === s.trim().replace(/\s+/g,' ').toLowerCase());
    }))) failures.push(`taille différente (${sizes.join(' / ')} recherchée)`);
  }
  return failures;
}
