import type { ShopperProfile } from './profile';
import { criterionFiltersSchema } from './criteria';
import { fashionFailures, matchesFashionType, isFashionAccessory } from './accuracy';
import { normalizeText, phraseMatches } from './text';

export interface PromotionProfileInput {
  title: string;
  brand: string | null;
  rawSpecs?: Record<string, string>;
  categoryPath?: string | null;
}
const BASE_FILTERS = criterionFiltersSchema.parse({keywords:['promotion']});

/** Feed eligibility is independent of a discount or a budget badge. Never infer gender from colour or cosmetics. */
export function fitsPromotionProfile(item: PromotionProfileInput, profile: ShopperProfile): boolean {
  const rawSpecs = item.rawSpecs ?? {};
  const title = normalizeText(item.title);
  const audienceText = title + ' ' + Object.entries(rawSpecs).filter(([k]) => /age|public|audience/i.test(k)).map(([,v]) => normalizeText(v)).join(' ');
  const child = /\b(enfant|enfants|junior|kids|kid|baby|bebe|garcon|fille|boys|girls)\b/.test(audienceText);
  const audience = profile.audience ?? (profile.genders.some(g => ['Garçon','Fille'].includes(g)) ? 'child' : 'adult');
  if (audience === 'adult' && child) return false;
  if (audience === 'child' && /\b(adulte|adult|homme|femme)\b/.test(audienceText) && !child) return false;
  const makeup = /\b(maquillage|makeup|make up|lipstick|lipgloss|lip gloss|lip tint|lip tints|gloss|blush|eyeliner|mascara|foundation|eyebrow|microblading|rouge a levres|fard a|fard aux|poudre compacte|fond de teint|vernis a ongles|faux cils)\b/.test(title);
  if (profile.hiddenCategories?.includes('makeup') && makeup) return false;
  const structuredGender = Object.entries(rawSpecs).filter(([k]) => /^(genre|gender|sexe)$/i.test(k.trim())).map(([,v]) => normalizeText(v)).join(' ');
  const text = structuredGender || title;
  const aliases: Record<string,string[]> = {Homme:['homme','hommes','men','mens','male'],Femme:['femme','femmes','women','womens','female'],Garçon:['garcon','boy','boys'],Fille:['fille','girl','girls']};
  const unisex = /\b(unisexe|unisex|mixte)\b/.test(text);
  const found = Object.entries(aliases).filter(([,words]) => words.some(w => phraseMatches(text,w))).map(([g]) => g);
  const selected = profile.genders;
  const constrained = selected.length > 0 && !selected.includes('Mixte');
  if (constrained && !unisex && found.length && !found.some(g => selected.includes(g))) return false;
  if (profile.excludedBrands.some(b => normalizeText(b) === normalizeText(item.brand) || phraseMatches(item.title,b))) return false;

  const base = BASE_FILTERS;
  const neutralAccessory = isFashionAccessory(item.title) || /^(ballon)\b/.test(title);
  const kind = neutralAccessory ? undefined : (['shoes','pants','tops'] as const).find(productType => matchesFashionType({...base,productType},item.title,item.brand,rawSpecs));
  const fashion = !neutralAccessory && (Boolean(kind) || /\b(robe|chemisier|jupe|soutien gorge|lingerie|blouse|dress|skirt|legging|pyjama|jacket|shirt|trousers|chaussette|socks)\b/.test(title)
    || /vetements|chaussures|mode-sport/.test(item.categoryPath ?? ''));
  if (constrained && fashion && !unisex && !found.length) return false;
  if (kind && (profile.strictColors ?? profile.colors.length > 0) && profile.colors.length) {
    const rawColors = Object.entries(rawSpecs).filter(([k]) => /^(couleur|color|colour)$/i.test(k.trim())).map(([,v]) => v);
    const colors = rawColors.map(normalizeText);
    if (!colors.length || !profile.colors.some(c => colors.some(v => phraseMatches(v,c)))) return false;
    // A multi-colour parent cannot prove the colour × size combination.
    if (rawSpecs['Variantes observées (stock à confirmer)']) return false;
    if (rawColors.some(v => /[,;/]|multicolore|aleatoire/.test(v))) return false;
  }
  if (kind) {
    const sizes = kind === 'shoes' ? profile.shoeSizes : kind === 'pants' ? profile.pantsSizes : profile.clothingSizes;
    // Gender was checked above, including the English labels; size evidence must still come from the product.
    return fashionFailures({...base,productType:kind,sizes,genders:[]}, {
      title:item.title,brand:item.brand,modelRef:null,categoryPath:item.categoryPath ?? null,priceCents:0,originalPriceCents:null,
      advertisedDiscountPct:null,seller:null,stock:'unknown',rating:null,reviewCount:null,rawSpecs,specs:{},
    }).length === 0;
  }
  return true;
}
