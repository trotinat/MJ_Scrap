import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { notificationAttempts, notifications, type DbHandle } from "@mdw/database";
import {
  backoffMs,
  enqueueNotification,
  escapeHtml,
  formatDealMessage,
  processOutbox,
  redact,
  retryNotification,
  TelegramClient,
  TelegramError,
} from "../src";
import { describeDb, freshDb, truncateAll } from "../../../test-utils/db";

const TOKEN = "123456789:AAEhBOweik6ad9r_QXMENQjcrGbqCr4K-ra";

type Call = { url: string; body: Record<string, unknown> };
function fakeTelegram(responder: (call: Call, n: number) => { status: number; json: unknown }) {
  const calls: Call[] = [];
  const fetchImpl = (async (input: string | URL | Request, init?: RequestInit) => {
    const call = { url: String(input), body: JSON.parse(String(init?.body ?? "{}")) };
    calls.push(call);
    const r = responder(call, calls.length);
    return new Response(JSON.stringify(r.json), { status: r.status, headers: { "content-type": "application/json" } });
  }) as typeof fetch;
  return { client: new TelegramClient({ botToken: TOKEN, chatId: "42", fetchImpl }), calls };
}
const ok = (id = 1) => ({ status: 200, json: { ok: true, result: { message_id: id } } });

describe("message formatting", () => {
  const base = {
    event: "price_drop" as const,
    criterionName: "Smart TV <55\">",
    title: "Téléviseur Samsung QLED 55 pouces & co",
    url: "https://www.marjanemall.ma/p/tv-abbb332004180907425",
    priceCents: 414900,
    originalPriceCents: 650000,
    advertisedDiscountPct: 36,
    previousPriceCents: 449900,
    changeVsPreviousPct: -7.8,
    stock: "in_stock" as const,
    seller: "ElectroElaissi",
    score: 87,
    dealClass: "exceptional" as const,
    explanation: "Cette TV correspond à vos critères : écran 55 pouces, résolution 4K.",
    observedAt: new Date("2026-10-09T17:04:00Z"),
  };

  it("contains every required field in French with a clickable link", () => {
    const html = formatDealMessage(base);
    expect(html).toContain("📉 Baisse de prix");
    expect(html).toContain("Offre exceptionnelle (87/100)");
    expect(html).toContain("<b>4 149,00 MAD</b> <s>6 500,00 MAD</s>");
    expect(html).toContain("Remise annoncée par le site : -36 %");
    expect(html).toContain("Évolution observée : -7.8 % (relevé précédent 4 499,00 MAD)");
    expect(html).toContain("En stock · Vendu par ElectroElaissi");
    expect(html).toContain('<a href="https://www.marjanemall.ma/p/tv-abbb332004180907425">Voir l\'offre sur Marjane Mall</a>');
    expect(html).toContain("Relevé le 9 oct. 2026, 18:04");
    expect(html).toContain("&amp; co");
    expect(html).toContain("Smart TV &lt;55&quot;&gt;");
  });

  it("omits the observed change when there is no history and fits the caption limit", () => {
    const html = formatDealMessage({ ...base, previousPriceCents: null, changeVsPreviousPct: null, explanation: "x ".repeat(2000) });
    expect(html).not.toContain("Évolution observée");
    expect(html.length).toBeLessThanOrEqual(1024);
  });

  it("escapes HTML", () => {
    expect(escapeHtml("<script>&")).toBe("&lt;script&gt;&amp;");
  });
});

describe("Telegram client", () => {
  it("sends photos with a caption and returns the message id", async () => {
    const { client, calls } = fakeTelegram(() => ok(77));
    expect(await client.sendDeal("<b>hi</b>", "https://img.example/a.jpg")).toEqual({ messageId: 77 });
    expect(calls[0]!.url).toMatch(/\/sendPhoto$/);
    expect(calls[0]!.body).toMatchObject({ chat_id: "42", photo: "https://img.example/a.jpg", parse_mode: "HTML" });
  });

  it("falls back to text when Telegram cannot fetch the image", async () => {
    const { client, calls } = fakeTelegram((c) =>
      c.url.endsWith("/sendPhoto") ? { status: 400, json: { ok: false, description: "Bad Request: wrong type of the web page content" } } : ok(5),
    );
    expect(await client.sendDeal("<b>hi</b>", "https://img.example/a.jpg")).toEqual({ messageId: 5 });
    expect(calls.map((c) => c.url.split("/").pop())).toEqual(["sendPhoto", "sendMessage"]);
  });

  it("classifies errors and never leaks the token", async () => {
    const { client } = fakeTelegram(() => ({ status: 401, json: { ok: false, description: `Unauthorized for bot${TOKEN}` } }));
    const err = (await client.sendMessage("x").catch((e) => e)) as TelegramError;
    expect(err).toBeInstanceOf(TelegramError);
    expect(err.permanent).toBe(true);
    expect(err.message).not.toContain(TOKEN);
    const rl = fakeTelegram(() => ({ status: 429, json: { ok: false, description: "Too Many Requests", parameters: { retry_after: 7 } } }));
    const e2 = (await rl.client.sendMessage("x").catch((e) => e)) as TelegramError;
    expect(e2.retryAfter).toBe(7);
    expect(e2.permanent).toBe(false);
    expect(redact(`https://api.telegram.org/bot${TOKEN}/x`, TOKEN)).not.toContain(TOKEN);
  });

  it("backoff grows exponentially and is capped", () => {
    expect(backoffMs(1)).toBe(30_000);
    expect(backoffMs(2)).toBe(60_000);
    expect(backoffMs(20)).toBe(3_600_000);
  });
});

describeDb("outbox (PostgreSQL)", () => {
  let h: DbHandle;
  beforeAll(async () => {
    h = await freshDb();
  });
  afterAll(async () => {
    await h?.close();
  });
  beforeEach(async () => {
    await truncateAll(h);
  });

  const payload = { html: "<b>Deal</b>", imageUrl: null };

  it("is idempotent: the same event is enqueued and sent once", async () => {
    const a = await enqueueNotification(h.db, { dedupeKey: "drop:c:o:100", eventType: "price_drop", payload });
    const b = await enqueueNotification(h.db, { dedupeKey: "drop:c:o:100", eventType: "price_drop", payload });
    expect(a).not.toBeNull();
    expect(b).toBeNull();
    const { client, calls } = fakeTelegram(() => ok(9));
    expect(await processOutbox(h.db, client)).toEqual({ sent: 1, failed: 0, dead: 0 });
    expect(await processOutbox(h.db, client)).toEqual({ sent: 0, failed: 0, dead: 0 });
    expect(calls).toHaveLength(1);
    const [row] = await h.db.select().from(notifications);
    expect(row).toMatchObject({ status: "sent", attempts: 1, telegramMessageId: 9 });
  });

  it("retries with backoff when Telegram is down, then delivers", async () => {
    await enqueueNotification(h.db, { dedupeKey: "k1", eventType: "new_match", payload });
    let clock = new Date(Date.now() + 1000);
    const now = () => clock;
    let up = false;
    const { client } = fakeTelegram(() => (up ? ok(11) : { status: 502, json: { ok: false, description: "Bad Gateway" } }));

    expect(await processOutbox(h.db, client, { now })).toEqual({ sent: 0, failed: 1, dead: 0 });
    let [row] = await h.db.select().from(notifications);
    expect(row!.status).toBe("failed");
    expect(row!.nextAttemptAt.getTime()).toBe(clock.getTime() + 30_000);

    // Not due yet -> nothing happens.
    expect(await processOutbox(h.db, client, { now })).toEqual({ sent: 0, failed: 0, dead: 0 });

    clock = new Date(clock.getTime() + 31_000);
    up = true;
    expect(await processOutbox(h.db, client, { now })).toEqual({ sent: 1, failed: 0, dead: 0 });
    [row] = await h.db.select().from(notifications);
    expect(row).toMatchObject({ status: "sent", attempts: 2, telegramMessageId: 11 });
    const attempts = await h.db.select().from(notificationAttempts).where(eq(notificationAttempts.notificationId, row!.id));
    expect(attempts.map((a) => a.success)).toEqual([false, true]);
  });

  it("gives up after maxAttempts and on permanent errors; can be retried manually", async () => {
    const id = await enqueueNotification(h.db, { dedupeKey: "k2", eventType: "new_match", payload });
    const { client } = fakeTelegram(() => ({ status: 400, json: { ok: false, description: "Bad Request: chat not found" } }));
    expect(await processOutbox(h.db, client)).toEqual({ sent: 0, failed: 0, dead: 1 });
    await retryNotification(h.db, id!);
    const [row] = await h.db.select().from(notifications);
    expect(row).toMatchObject({ status: "pending", attempts: 0 });
  });

  it("reclaims notifications stuck in 'sending' after the lease expires", async () => {
    await enqueueNotification(h.db, { dedupeKey: "k3", eventType: "new_match", payload });
    await h.db.update(notifications).set({ status: "sending", lockedUntil: new Date(Date.now() - 1000) });
    const { client } = fakeTelegram(() => ok(3));
    expect((await processOutbox(h.db, client)).sent).toBe(1);
  });
});
