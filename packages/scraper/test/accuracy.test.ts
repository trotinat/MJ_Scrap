import {describe,expect,it} from 'vitest';
import {PoliteFetcher} from '../src/http';
import {canonicalProductKey} from '../src/normalize';
import {parseProductPage} from '../src/parse/product';
import {embeddedDetail} from '../src/parse/product-data';

const html=(amounts=[199,199],disabled=false) => {
 const records = [
  ['1',{id:123,sku:'TEST12345_group',type_id:'configurable',name:'Pantalon',custom_attributes:[{attribute_code:'url_key',value:'pantalon-test12345-group'}],extension_attributes:{brand_name:'Test',seller_name:'Marjane',product_attributes:[[{label:'Genre',value:'Homme'}]]}}],
  ['2',{productId:'123',prices:{finalPrice:{amount:199},oldPrice:{amount:399}},optionPrices:Object.fromEntries(amounts.map((n,i)=>[i,{finalPrice:{amount:n}}]))}],
 ];
 return '<html><body><h1>Pantalon Homme</h1><h4>Taille</h4><div><button '+(disabled?'disabled':'')+'>32</button><button disabled>44</button></div>'+records.map(([id,v])=>'<script>self.__next_f.push([1,'+JSON.stringify(id+':'+JSON.stringify(v)+'\n')+'])</script>').join('')+'</body></html>';
};
describe('crawler accuracy regressions',()=>{
 it('reads the matching configurable product price and only enabled sizes',()=>{
   const p=parseProductPage(html(),'https://www.marjanemall.ma/p/pantalon-test12345-group');
   expect(p).toMatchObject({priceCents:19900,originalPriceCents:39900,extraction:'embedded-data',stock:'in_stock',rawSpecs:{'Tailles disponibles':'32',Genre:'Homme'}});
 });
 it('refuses ambiguous variant prices and does not invent stock for disabled sizes',()=>{
   expect(()=>parseProductPage(html([199,299]),'https://www.marjanemall.ma/p/pantalon-test12345-group')).toThrow(/Prix/);
   expect(parseProductPage(html([199,199],true),'https://www.marjanemall.ma/p/pantalon-test12345-group').stock).toBe('out_of_stock');
 });
 it('does not merge variants whose size and colour are unknown',()=>{
   expect(canonicalProductKey('Adidas','MODEL123','blue41')).not.toBe(canonicalProductKey('Adidas','MODEL123','red42'));
 });
 it('resolves byte-length-prefixed Flight strings used for real variant prices',()=>{
   const config=JSON.stringify({productId:'123',prices:{finalPrice:{amount:199},oldPrice:{amount:399}},optionPrices:{one:{finalPrice:{amount:199}}},label:'Choisissez votre modèle'});
   const product={id:123,sku:'TEST12345_group',type_id:'configurable',custom_attributes:[{attribute_code:'url_key',value:'pantalon-test12345-group'}]};
   const flight='1:'+JSON.stringify(product)+'\n2:T'+Buffer.byteLength(config).toString(16)+','+config+'\n3:'+JSON.stringify({configuration:'$2'})+'\n';
   const body='<script>self.__next_f.push([1,'+JSON.stringify(flight)+'])</script>';
   expect(embeddedDetail(body,'pantalon-test12345-group')?.amount).toBe(199);
 });
 it('rejects a foreign redirect before making a request to it',async()=>{
   const requested:string[]=[];
   const f=new PoliteFetcher({userAgent:'test',minDelayMs:0,timeoutMs:1000,maxRetries:0,respectRobots:false,fetchImpl:async input=>{requested.push(String(input));return new Response('',{status:302,headers:{location:'https://example.com/private'}});}});
   await expect(f.get('https://www.marjanemall.ma/test')).rejects.toThrow(/non autorisée/);
   expect(requested).toEqual(['https://www.marjanemall.ma/test']);
 });
});

describe('variant evidence',()=>{it('keeps colour, size and price on the same variant without inventing stock',()=>{
 const product={id:9,sku:'SHOE_group',type_id:'configurable',custom_attributes:[{attribute_code:'url_key',value:'shoe-aaatest123-group'}]};
 const config={productId:'9',prices:{finalPrice:{amount:100}},attributes:{colour:{label:'Couleur',options:[{label:'Noir',products:['a']},{label:'Blanc',products:['b']}]},size:{label:'Taille',options:[{label:'42',products:['a']},{label:'43',products:['b']}]}},optionPrices:{a:{finalPrice:{amount:100}},b:{finalPrice:{amount:120}}}};
 const body=[product,config].map((v,i)=>'<script>self.__next_f.push([1,'+JSON.stringify(i+':'+JSON.stringify(v)+'\n')+'])</script>').join('');
 const result=embeddedDetail(body,'shoe-aaatest123-group');
 expect(JSON.parse(result!.specs['Variantes observées (stock à confirmer)']!)).toEqual([{attributes:{Couleur:'Noir',Taille:'42'},priceCents:10000,stock:'unknown'},{attributes:{Couleur:'Blanc',Taille:'43'},priceCents:12000,stock:'unknown'}]);
 expect(result?.amount).toBeNull();
});});
