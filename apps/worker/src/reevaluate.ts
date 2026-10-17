import { and, eq, inArray, sql } from 'drizzle-orm';
import { dealMatches, getAppSettings, getUserProfile, listCriteria, listingAppearances, notifications, priceHistory, productOffers, products, SCRAPE_LOCK_KEY, withAdvisoryLock, type Db } from '@mdw/database';
import type pg from 'pg';
import { evaluate, historyFacts } from '@mdw/scoring';
import { withProfileConstraints } from '@mdw/shared';

/** Refresh saved matches after rule changes, without crawling, inventing observations or sending alerts. */
export async function reevaluateSaved(db: Db, pool: pg.Pool) {
  return withAdvisoryLock(pool, SCRAPE_LOCK_KEY, async () => {
    const settings = await getAppSettings(db);
    const criteria = await Promise.all((await listCriteria(db)).map(async c =>
      withProfileConstraints(c, await getUserProfile(db, c.ownerId!))));
    const rows = await db.select({o:productOffers,p:products}).from(productOffers).innerJoin(products,eq(products.id,productOffers.productId));
    const appearances = await db.select().from(listingAppearances);
    const paths = new Map<string,string[]>();
    for(const a of appearances) paths.set(a.offerId,[...(paths.get(a.offerId) ?? []),a.listingPath]);
    let matches = 0;
    for (const {o,p} of rows) {
      if (o.currentPriceCents === null) continue;
      const history = await db.select({priceCents:priceHistory.priceCents,observedAt:priceHistory.observedAt}).from(priceHistory).where(eq(priceHistory.offerId,o.id)).orderBy(priceHistory.observedAt,priceHistory.id);
      for(const c of criteria) {
        if (c.shopId !== o.shopId) continue;
        const ev = evaluate(c,{title:o.title,brand:p.brand,modelRef:p.modelRef,categoryPath:p.categoryPath,listingPaths:paths.get(o.id),priceCents:o.currentPriceCents,originalPriceCents:o.originalPriceCents,advertisedDiscountPct:o.advertisedDiscountPct,seller:o.seller,stock:o.stockStatus,rating:o.rating,reviewCount:o.reviewCount,rawSpecs:p.rawSpecs,specs:p.specs},historyFacts(history),settings);
        const valid = c.enabled && o.status === 'active' && ev.isMatch;
        if(valid) matches++;
        const values = {isMatch:valid,score:ev.score,dealClass:ev.dealClass,explanation:ev.explanation,breakdown:ev.breakdown,failedReasons:ev.failedReasons,priceCents:o.currentPriceCents,lastEvaluatedAt:new Date()};
        const [previous] = await db.select({id:dealMatches.id}).from(dealMatches).where(and(eq(dealMatches.offerId,o.id),eq(dealMatches.criterionId,c.id))).limit(1);
        if(previous) await db.update(dealMatches).set(values).where(eq(dealMatches.id,previous.id));
        else if(valid) await db.insert(dealMatches).values({...values,offerId:o.id,criterionId:c.id,firstMatchedAt:new Date()});
      }
    }
    // Pending messages created by older matching rules must not outlive their eligibility.
    await db.update(notifications).set({status:'dead',lockedUntil:null,lastError:'Correspondance non confirmée après vérification des critères'})
      .where(and(inArray(notifications.status,['pending','failed']),sql`not exists (select 1 from deal_matches m where m.offer_id = ${notifications.offerId} and m.criterion_id = ${notifications.criterionId} and m.is_match)`));
    return {offers:rows.length,matches};
  });
}
