"use server";

import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { getDb, runRequests } from "@mdw/database";
import { requireUser } from "@/lib/session";

/**
 * The web app never scrapes by itself: it files a request that the worker
 * picks up within ~15 s (and the worker's lock prevents overlapping runs).
 */
export async function requestRunAction(): Promise<void> {
  const user = await requireUser();
  const db = getDb();
  const pending = await db.select({ id: runRequests.id }).from(runRequests).where(eq(runRequests.status, "pending")).limit(1);
  if (pending.length === 0) await db.insert(runRequests).values({ requestedBy: user.email });
  revalidatePath("/collectes");
}
