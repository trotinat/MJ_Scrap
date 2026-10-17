import {describe,it,expect} from 'vitest';
import {parseCampaignLinks} from '../src/parse/campaigns';
describe('bounded campaign discovery',()=>{it('deduplicates tracking and refuses foreign or non-campaign routes',()=>{expect(parseCampaignLinks(`<a href="/panier-malin?utm_source=x#listing">x</a><a href="/panier-malin">x</a><a href="https://evil.test/destockage">x</a><a href="/checkout/cart">x</a><a href="/les-deals-de-l-automne">x</a><a href="/panier-malin/maison">x</a>`)).toEqual(['/panier-malin','/les-deals-de-l-automne','/panier-malin/maison']);});});
