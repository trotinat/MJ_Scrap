import { and, asc, eq, inArray, sql } from "drizzle-orm";
import { listingAppearances, priceHistory, productOffers, products, type Tx } from "@mdw/database";
import { canonicalProductKey } from "@mdw/scraper";
import { extractSpecs, type MatchableProduct, type StockStatus } from "@mdw/shared";
import { historyFacts } from "@mdw/scoring";
import { MARJANE_SHOP_ID } from "@mdw/database";

/** Normalized observation of one offer, from a product page or a listing card. */
export interface OfferObservation {
  shopId?: string;
  sourceId: string;
  url: string;
  title: string;
  brand: string | null;
  modelRef: string | null;
  imageUrl: string | null;
  imageUrls?: string[];
  priceCents: number;
  originalPriceCents: number | null;
  advertisedDiscountPct: number | null;
  seller: string | null;
  stock: StockStatus;
  rating: number | null;
  reviewCount: number | null;
  rawSpecs: Record<string, string>;
  categoryPath: string | null;
  listingPath: string | null;
  /** Every listing where the card was seen during this run (category, promotion page…). */
  listingPaths?: string[];
  source: "detail" | "listing";
  extraction: string;
}

export interface PreviousOfferState {
  priceCents: number | null;
  stock: StockStatus | null;
  status: string | null;
}

export interface SavedObservation {
  offerId: string;
  productId: string;
  isNewOffer: boolean;
  previous: PreviousOfferState;
  observationId: number;
  observedAt: Date;
  matchable: MatchableProduct;
  facts: ReturnType<typeof historyFacts>;
}

/**
 * Persists one observation inside the caller's transaction:
 * upserts the product (by canonical key) and the offer (by source id), and
 * appends a price_history row. Returns the previous offer state so that
 * changes (drops, restocks) can be detected.
 */
export async function saveObservation(tx: Tx, o: OfferObservation, runId: string, now: Date): Promise<SavedObservation> {
  const shopId = o.shopId ?? MARJANE_SHOP_ID;
  const specs = extractSpecs(o.title, o.rawSpecs);
  let key = canonicalProductKey(o.brand, o.modelRef, o.sourceId, specs);

  const [existingOffer] = await tx.select().from(productOffers).where(and(eq(productOffers.shopId, shopId), eq(productOffers.sourceId, o.sourceId))).limit(1).for("update");
  let [existingProduct] = existingOffer ? await tx.select().from(products).where(eq(products.id, existingOffer.productId)).limit(1) : [];
  if (existingProduct && (o.source === 'listing' || key.startsWith('src:'))) key = existingProduct.canonicalKey;
  if (!existingProduct) {
    [existingProduct] = await tx.select().from(products).where(and(eq(products.shopId, shopId), eq(products.canonicalKey, key))).limit(1);
  }

  // Product upsert. A listing-only observation (no specs) never overwrites richer data.
  const productValues = {
    shopId,
    canonicalKey: key,
    name: o.title,
    brand: o.brand,
    modelRef: o.modelRef,
    categoryPath: o.categoryPath,
    imageUrl: o.imageUrl,
    imageUrls: [...new Set([...(existingProduct?.imageUrls ?? []), ...(o.imageUrls ?? (o.imageUrl ? [o.imageUrl] : []))])],
    specs,
    rawSpecs: o.rawSpecs,
    lastSeenAt: now,
    updatedAt: now,
  };
  const updateSet: Record<string, unknown> = { name: o.title, lastSeenAt: now, updatedAt: now };
  if (o.imageUrl) updateSet.imageUrl = o.imageUrl;
  if (o.imageUrls?.length || o.imageUrl) updateSet.imageUrls = productValues.imageUrls;
  if (o.brand) updateSet.brand = o.brand;
  if (o.modelRef) updateSet.modelRef = o.modelRef;
  if (o.categoryPath) updateSet.categoryPath = o.categoryPath;
  if (o.source === "detail") {
    updateSet.specs = { ...existingProduct?.specs, ...specs };
    updateSet.rawSpecs = { ...existingProduct?.rawSpecs, ...o.rawSpecs };
  } else if (Object.keys(o.rawSpecs).length) {
    // Listing data that proves attributes (Shopify feeds) is a complete snapshot: sold-out sizes must not linger.
    updateSet.specs = specs;
    updateSet.rawSpecs = o.rawSpecs;
  }
  const [product] = await tx
    .insert(products)
    .values({ ...productValues, firstSeenAt: now })
    .onConflictDoUpdate({ target: [products.shopId, products.canonicalKey], set: updateSet })
    .returning();

  let offerId: string;
  const previous: PreviousOfferState = {
    priceCents: existingOffer?.currentPriceCents ?? null,
    stock: existingOffer?.stockStatus ?? null,
    status: existingOffer?.status ?? null,
  };

  if (existingOffer) {
    offerId = existingOffer.id;
    const oldProductId = existingOffer.productId;
    await tx
      .update(productOffers)
      .set({
        productId: product!.id,
        url: o.url,
        title: o.title,
        seller: o.seller ?? existingOffer.seller,
        currentPriceCents: o.priceCents,
        originalPriceCents: o.originalPriceCents,
        advertisedDiscountPct: o.advertisedDiscountPct,
        // A listing card rarely shows stock: keep the last detail-page value.
        stockStatus: o.stock !== "unknown" || o.source === "detail" ? o.stock : existingOffer.stockStatus,
        rating: o.rating ?? existingOffer.rating,
        reviewCount: o.reviewCount ?? existingOffer.reviewCount,
        status: "active",
        consecutiveMisses: 0,
        minPriceCents: existingOffer.minPriceCents === null ? o.priceCents : Math.min(existingOffer.minPriceCents, o.priceCents),
        lastListingPath: o.listingPath ?? existingOffer.lastListingPath,
        extraction: o.extraction,
        lastSeenAt: now,
        lastSuccessAt: now,
        lastDetailAt: o.source === "detail" ? now : existingOffer.lastDetailAt,
        updatedAt: now,
      })
      .where(eq(productOffers.id, offerId));
    // Offer moved to a better-identified product: drop the orphan placeholder.
    if (oldProductId !== product!.id) {
      await tx.execute(
        sql`delete from products p where p.id = ${oldProductId} and not exists (select 1 from product_offers o where o.product_id = p.id)`,
      );
    }
  } else {
    const [inserted] = await tx
      .insert(productOffers)
      .values({
        shopId,
        productId: product!.id,
        sourceId: o.sourceId,
        url: o.url,
        title: o.title,
        seller: o.seller,
        currentPriceCents: o.priceCents,
        originalPriceCents: o.originalPriceCents,
        advertisedDiscountPct: o.advertisedDiscountPct,
        stockStatus: o.stock,
        rating: o.rating,
        reviewCount: o.reviewCount,
        minPriceCents: o.priceCents,
        lastListingPath: o.listingPath,
        extraction: o.extraction,
        firstSeenAt: now,
        lastSeenAt: now,
        lastSuccessAt: now,
        lastDetailAt: o.source === "detail" ? now : null,
      })
      .returning({ id: productOffers.id });
    offerId = inserted!.id;
  }

  const [obs] = await tx
    .insert(priceHistory)
    .values({
      offerId,
      runId,
      priceCents: o.priceCents,
      originalPriceCents: o.originalPriceCents,
      advertisedDiscountPct: o.advertisedDiscountPct,
      stockStatus: o.stock,
      source: o.source,
      observedAt: now,
    })
    .returning({ id: priceHistory.id });

  const [history] = (await tx.execute<{n:number; minimum:number; previous_min:number|null; first:Date; previous:number|null}>(sql`
    select count(*)::int as n, min(price_cents)::int as minimum,
      min(price_cents) filter (where id <> ${obs!.id})::int as previous_min,
      min(observed_at) as first,
      (select price_cents from price_history where offer_id = ${offerId} and id <> ${obs!.id}
        order by observed_at desc, id desc limit 1) as previous
    from price_history where offer_id = ${offerId}`)).rows;

  const seenOn = [...new Set([...(o.listingPaths ?? []), ...(o.listingPath ? [o.listingPath] : [])])];
  if(seenOn.length) await tx.insert(listingAppearances)
    .values(seenOn.map(listingPath=>({offerId,listingPath,firstSeenAt:now,lastSeenAt:now})))
    .onConflictDoUpdate({target:[listingAppearances.offerId,listingAppearances.listingPath],set:{lastSeenAt:now}});

  const stockForMatch: StockStatus = o.stock !== "unknown" ? o.stock : (previous.stock ?? "unknown");
  const matchable: MatchableProduct = {
    title: o.title,
    brand: o.brand ?? product!.brand,
    modelRef: o.modelRef ?? product!.modelRef,
    categoryPath: o.categoryPath ?? product!.categoryPath,
    listingPaths: seenOn,
    priceCents: o.priceCents,
    originalPriceCents: o.originalPriceCents,
    advertisedDiscountPct: o.advertisedDiscountPct,
    seller: o.seller ?? null,
    stock: stockForMatch,
    rating: o.rating,
    reviewCount: o.reviewCount,
    rawSpecs: product!.rawSpecs ?? {},
    specs: { ...(product!.specs ?? {}), ...specs },
  };

  return {
    offerId,
    productId: product!.id,
    isNewOffer: !existingOffer,
    previous,
    observationId: obs!.id,
    observedAt: now,
    matchable,
    facts: {observationCount:history!.n, previousPriceCents:history!.previous, minPriceCents:history!.minimum, previousMinPriceCents:history!.previous_min, firstSeenAt:new Date(history!.first)},
  };
}

/** Marks an offer whose product page returned 404/410 as unavailable (never deleted). */
export async function markOfferGone(tx: Tx, offerId: string, now: Date): Promise<void> {
  await tx
    .update(productOffers)
    .set({ status: "unavailable", consecutiveMisses: sql`${productOffers.consecutiveMisses} + 1`, updatedAt: now })
    .where(eq(productOffers.id, offerId));
}

/**
 * Missing-offer policy: an active offer last seen on a listing that was
 * crawled successfully in this run, but which was not seen and not refreshed,
 * gets one "miss". After `missingAfterRuns` consecutive misses it is marked
 * "missing". Offers are never deleted and failed crawls never count as misses.
 */
export async function applyMissingPolicy(
  tx: Tx,
  crawledPaths: string[],
  seenOfferIds: Set<string>,
  missingAfterRuns: number,
  now: Date,
  shopId = MARJANE_SHOP_ID,
): Promise<number> {
  if (crawledPaths.length === 0) return 0;
  const candidates = await tx
    .select({ id: productOffers.id, misses: productOffers.consecutiveMisses })
    .from(productOffers)
    .where(and(eq(productOffers.shopId, shopId), eq(productOffers.status, "active"), inArray(productOffers.lastListingPath, crawledPaths)));
  let marked = 0;
  for (const c of candidates) {
    if (seenOfferIds.has(c.id)) continue;
    const misses = c.misses + 1;
    const status = misses >= missingAfterRuns ? "missing" : "active";
    if (status === "missing") marked++;
    await tx.update(productOffers).set({ consecutiveMisses: misses, status, updatedAt: now }).where(eq(productOffers.id, c.id));
  }
  return marked;
}
