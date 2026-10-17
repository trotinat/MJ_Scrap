import { describe, expect, it } from 'vitest';
import { fitsPromotionProfile } from '../src/promotion-profile';
import { EMPTY_PROFILE } from '../src/profile';
import { profileHighlights, suitsProfile } from '../src/media';
const male = {...EMPTY_PROFILE,genders:['Homme'],shoeSizes:['42'],maxPrice:1000};
const item = (title:string,rawSpecs:Record<string,string>={}) => ({title,brand:null,rawSpecs});
describe('promotion profile eligibility',()=>{
  it.each(['Short jeans femme','Women sneakers','Chemise fille','Pantalon garçon'])('excludes incompatible gender: %s',title=>expect(fitsPromotionProfile(item(title),male)).toBe(false));
  it('prefers structured gender over ambiguous marketing',()=>expect(fitsPromotionProfile(item('Baskets homme',{Genre:'Femme',Pointure:'42'}),male)).toBe(false));
  it('requires gender evidence for fashion',()=>expect(fitsPromotionProfile(item('Baskets de ville',{Pointure:'42'}),male)).toBe(false));
  it('accepts matching unisex sizes',()=>expect(fitsPromotionProfile(item('Baskets unisex',{Pointure:'42'}),male)).toBe(true));
  it('rejects wrong or unknown sizes',()=>{expect(fitsPromotionProfile(item('Baskets homme',{Pointure:'41'}),male)).toBe(false);expect(fitsPromotionProfile(item('Baskets homme'),male)).toBe(false);});
  it.each(['Téléviseur 55 pouces','Crème solaire','Maquillage rose','Panier de rangement'])('keeps neutral goods: %s',title=>expect(fitsPromotionProfile(item(title),male)).toBe(true));
  it('hides makeup only by an explicit editable preference, while keeping skincare',()=>{
    const profile = {...male,hiddenCategories:['makeup'] as ('makeup')[]};
    for (const title of ['Rouge à lèvres mat','Liquid Blush','Fard à paupières','Lip Tints','Poudre compacte']) expect(fitsPromotionProfile(item(title),profile)).toBe(false);
    expect(fitsPromotionProfile(item('Écran solaire SPF50'),profile)).toBe(true);
    expect(fitsPromotionProfile(item('Rouge à lèvres mat'),male)).toBe(true);
  });
  it('supports female profiles and an unset profile',()=>{expect(fitsPromotionProfile(item('Robe femme'),{...EMPTY_PROFILE,genders:['Femme']})).toBe(true);expect(fitsPromotionProfile(item('Baskets femme'),EMPTY_PROFILE)).toBe(true);});
  it('does not recommend incompatible cheap products or budget-only matches',()=>{
    expect(profileHighlights({...item('Short femme'),priceCents:1000,discountPct:80},male)).toEqual([]);
    expect(suitsProfile({...item('Téléviseur'),priceCents:1000,discountPct:80},male)).toBe(false);
  });
});

describe('adult relevance and exact variants',()=>{
 it('separates child audience from unisex gender',()=>{const p=item('ADIDAS Sac à dos Pour Enfants Unisexe Noir');expect(fitsPromotionProfile(p,male)).toBe(false);expect(fitsPromotionProfile(p,{...male,audience:'all'})).toBe(true);});
 it('keeps household accessories even when they mention garments',()=>{for(const title of ['Sac de lavage machine – Protection lingerie et chaussures','Étagère à chaussures 4 niveaux','Lot de 10 Cintres en Bois avec Barre de Pantalon']) expect(fitsPromotionProfile(item(title),male)).toBe(true);});
 it('requires the exact shoe size rather than matching fractional sizes',()=>{expect(fitsPromotionProfile(item('Baskets homme',{'Pointures disponibles':'42 2/3'}),male)).toBe(false);expect(fitsPromotionProfile(item('Baskets homme',{'Pointures disponibles':'42, 42 2/3'}),male)).toBe(true);});
 it('makes strict colour optional and rejects ambiguous parent colours',()=>{const p=item('Baskets homme',{Genre:'Homme',Pointure:'42',Couleur:'BLANC'});expect(fitsPromotionProfile(p,{...male,colors:['Noir'],strictColors:false})).toBe(true);expect(fitsPromotionProfile(p,{...male,colors:['Noir'],strictColors:true})).toBe(false);expect(fitsPromotionProfile({...p,rawSpecs:{...p.rawSpecs,Couleur:'Noir, Blanc'}},{...male,colors:['Noir'],strictColors:true})).toBe(false);});
});
