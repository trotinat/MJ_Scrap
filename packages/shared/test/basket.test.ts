import {describe,it,expect} from 'vitest';
import {estimateBasket} from '../src/basket';
describe('conditional basket estimates',()=>{
 it('counts only eligible merchandise towards the threshold',()=>{const r=estimateBasket([{id:'a',priceCents:29900,quantity:1,eligible:true},{id:'b',priceCents:10000,quantity:1,eligible:false}]);expect(r.discountCents).toBe(0);expect(r.remainingCents).toBe(100);expect(r.totalCents).toBeNull();});
 it('applies the threshold exactly and never discounts delivery',()=>{const r=estimateBasket([{id:'a',priceCents:15000,quantity:2,eligible:true},{id:'b',priceCents:10000,quantity:1,eligible:false}],1800);expect(r.discountCents).toBe(3000);expect(r.totalCents).toBe(38800);});
 it('rejects invalid money or quantities',()=>{expect(()=>estimateBasket([{id:'a',priceCents:NaN,quantity:1,eligible:true}])).toThrow();expect(()=>estimateBasket([],-1)).toThrow();});
});
