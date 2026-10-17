import { describe, expect, it } from 'vitest';
import { criterionInputSchema, DEFAULT_SETTINGS, EMPTY_PROFILE, withProfileConstraints, type MatchableProduct } from '@mdw/shared';
import { evaluate, historyFacts } from '../src';

const product = (patch: Partial<MatchableProduct> = {}): MatchableProduct => ({title:'Pantalon Homme taille 32',brand:'Pepe Jeans',modelRef:null,categoryPath:null,listingPaths:['/ventes-flash'],priceCents:19900,originalPriceCents:59900,advertisedDiscountPct:67,seller:null,stock:'unknown',rating:null,reviewCount:null,rawSpecs:{},specs:{},...patch});
const c = (filters: any = {}) => ({id:'c',...criterionInputSchema.parse({name:'Recherche',filters:{categoryPaths:['/vetements-chaussures-bijoux-accessoires/vetements-homme/pantalons-jeans'],keywords:['pantalon','jean'],...filters}})});
const run = (p: MatchableProduct, filters: any = {}) => evaluate(c(filters),p,historyFacts([]),DEFAULT_SETTINGS);

describe('evidence-based fashion matching', () => {
  it('enforces explicit gender for caps as well as clothes', () => {
    const filters = { categoryPaths: ['/vetements-chaussures-bijoux-accessoires/bijoux-accessoires/casquettes-chapeaux-bonnets'], keywords: ['casquette'], genders: ['Homme'] };
    expect(run(product({ title: 'Casquette pour femme', rawSpecs: {} }), filters).isMatch).toBe(false);
    expect(run(product({ title: 'Casquette vintage', rawSpecs: {} }), filters).failedReasons).toContain('genre non vérifiable sur le produit');
    expect(run(product({ title: 'Casquette unisexe', rawSpecs: {} }), filters).isMatch).toBe(true);
    expect(run(product({ title: 'Casquette New Era', rawSpecs: { Genre: 'Homme' } }), filters).isMatch).toBe(true);
    expect(run(product({ title: 'Casquette New Era', rawSpecs: { Genre: 'Femme' } }), filters).isMatch).toBe(false);
  });
  it('does not confuse a brand with a garment', () => {
    expect(run(product({title:'Sneakers PEPE JEANS Homme taille 41'})).isMatch).toBe(false);
    expect(run(product()).isMatch).toBe(true);
  });
  it('never uses a requested URL facet as proof of size', () => {
    const p = product({title:'Pantalon Homme',listingPaths:['/pants?taille_master=32']});
    expect(run(p,{sizes:['32']}).failedReasons).toContain('taille non vérifiable : aucune taille produit confirmée');
    expect(run(product({title:'Pantalon Homme taille 44'}),{sizes:['32','33']}).isMatch).toBe(false);
    expect(run(product(),{sizes:['32','33'],genders:['Homme']}).isMatch).toBe(true);
  });
  it('accepts explicitly available sizes and rejects stockouts and unknown gender', () => {
    expect(run(product({title:'Pantalon',rawSpecs:{'Tailles disponibles':'32, 34',Genre:'Homme'}}),{sizes:['32'],genders:['Homme']}).isMatch).toBe(true);
    expect(run(product({stock:'out_of_stock'})).isMatch).toBe(false);
    expect(run(product({title:'Pantalon taille 32'}),{genders:['Homme']}).isMatch).toBe(false);
    expect(run(product({rawSpecs:{'Tailles disponibles':'44',Taille:'32'}}),{sizes:['32']}).isMatch).toBe(false);
    expect(run(product({rawSpecs:{Genre:'Femme'}}),{genders:['Homme']}).isMatch).toBe(false);
  });
  it('applies profile sizes to the relevant garment, not unrelated goods', () => {
    const p = {...EMPTY_PROFILE,pantsSizes:['32','33'],shoeSizes:['42'],genders:['Homme']};
    expect(withProfileConstraints(c(),p).filters.sizes).toEqual(['32','33']);
    const other=c({categoryPaths:['/maison-cuisine-deco'],keywords:['gourde']});
    expect(withProfileConstraints(other,p).filters.sizes).toEqual([]);
  });
  it('does not call a seller discount alone exceptional', () => {
    const ev=run(product({advertisedDiscountPct:90}));
    expect(ev.score).toBeLessThan(DEFAULT_SETTINGS.thresholds.veryGood);
  });
});

describe('value confidence',()=>{
 it('does not reward a rebound from a temporary spike',()=>{const h=historyFacts([10000,20000,11000].map((priceCents,i)=>({priceCents,observedAt:new Date(2026,9,10+i)})));expect(evaluate(c(),product({priceCents:11000}),h,DEFAULT_SETTINGS).score).toBeLessThan(DEFAULT_SETTINGS.thresholds.veryGood);});
 it('requires five distinct days for a typical-price baseline',()=>{const day=new Date('2026-10-16T12:00:00Z');const points=Array.from({length:6},(_,i)=>({priceCents:i===2?90000:10000,observedAt:new Date(+day-i*86400000)}));expect(historyFacts(points).typical30DayCents).toBe(10000);expect(historyFacts(points.map(p=>({...p,observedAt:day}))).typical30DayCents).toBeNull();});
 it('does not grant official-seller confidence to a name prefix',()=>{const result=run(product({seller:'Marjane Example Shop'}));expect(result.breakdown.find(b=>b.key==='seller')?.value).toBe(0.5);});
});
