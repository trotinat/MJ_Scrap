import {afterAll,afterEach,beforeAll,beforeEach,expect,it,vi} from 'vitest';
import {eq} from 'drizzle-orm';
import {createCriterion,createUser,dealMatches,notifications,productOffers,products,registerSubscriber,saveAppSettings,telegramSubscribers,type DbHandle} from '@mdw/database';
import {DEFAULT_SETTINGS} from '@mdw/shared';
import {deliverToSubscribers} from '../src/delivery';
import {enqueueNotification} from '../src/outbox';
import {describeDb,freshDb,truncateAll} from '../../../test-utils/db';

describeDb('subscriber delivery accuracy',()=>{
 let h:DbHandle;
 beforeAll(async()=>{h=await freshDb();});
 beforeEach(async()=>{await truncateAll(h);await h.db.delete(telegramSubscribers);});
 afterEach(()=>vi.unstubAllGlobals());
 afterAll(async()=>{await h?.close();});
 async function setup(isMatch=true) {
   const user=await createUser(h.db,'owner@example.com','un-mot-de-passe-solide');
   const c=await createCriterion(h.db,{name:'Bottle',filters:{keywords:['gourde']}},user.id);
   const [p]=await h.db.insert(products).values({canonicalKey:'src:test',name:'Gourde'}).returning();
   const [o]=await h.db.insert(productOffers).values({productId:p!.id,sourceId:'test',url:'https://www.marjanemall.ma/p/gourde-test12345',title:'Gourde',currentPriceCents:1000}).returning();
   await h.db.insert(dealMatches).values({criterionId:c.id,offerId:o!.id,isMatch});
   await enqueueNotification(h.db,{dedupeKey:'k',eventType:'new_match',criterionId:c.id,offerId:o!.id,payload:{html:'Deal',imageUrl:null}});
   return [await registerSubscriber(h.db,{chatId:'1'}),await registerSubscriber(h.db,{chatId:'2'})];
 }
 it('honors the global off switch',async()=>{
   const subs=await setup();await saveAppSettings(h.db,{...DEFAULT_SETTINGS,notificationsEnabled:false});
   const fetch=vi.fn();vi.stubGlobal('fetch',fetch);
   expect((await deliverToSubscribers(h.db,subs,{botToken:'test'})).sent).toBe(0);
   expect(fetch).not.toHaveBeenCalled();
 });
 it('filters messages whose match is no longer valid',async()=>{
   const subs=await setup(false);const fetch=vi.fn();vi.stubGlobal('fetch',fetch);
   expect((await deliverToSubscribers(h.db,subs,{botToken:'test'})).filtered).toBe(1);
   expect(fetch).not.toHaveBeenCalled();
 });
 it('retries a failed recipient without resending to the successful recipient',async()=>{
   const subs=await setup();const calls:string[]=[];let recovered=false;
   vi.stubGlobal('fetch',async(_url:unknown,init:RequestInit)=>{
     const chat=String(JSON.parse(String(init.body)).chat_id);calls.push(chat);
     return chat==='2'&&!recovered ? new Response(JSON.stringify({ok:false,description:'Temporary outage'}),{status:502}) : new Response(JSON.stringify({ok:true,result:{message_id:12}}));
   });
   expect((await deliverToSubscribers(h.db,subs,{botToken:'test'})).failed).toBe(1);
   const [row]=await h.db.select().from(notifications);
   expect(row!.payload.deliveredChatIds).toEqual(['1']);
   recovered=true;await h.db.update(notifications).set({nextAttemptAt:new Date(0)}).where(eq(notifications.id,row!.id));
   expect((await deliverToSubscribers(h.db,subs,{botToken:'test'})).sent).toBe(1);
   expect(calls).toEqual(['1','2','2']);
 });
});
