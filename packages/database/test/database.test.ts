import { afterAll, beforeAll, beforeEach, expect, it } from "vitest";
import {
  countUsers,
  createCriterion,
  createSession,
  createUser,
  deleteCriterion,
  deleteSession,
  duplicateCriterion,
  getAppSettings,
  getCriterion,
  getUserProfile,
  hashPassword,
  isLoginRateLimited,
  listCriteria,
  listUserShops,
  grantUserShop,
  revokeUserShop,
  shops,
  recordLoginAttempt,
  saveAppSettings,
  saveUserProfile,
  setCriterionEnabled,
  setUserPassword,
  SCRAPE_LOCK_KEY,
  validateSession,
  verifyPassword,
  withAdvisoryLock,
  type DbHandle,
} from "../src";
import { EXAMPLE_CRITERIA, DEFAULT_SETTINGS } from "@mdw/shared";
import { describeDb, freshDb, truncateAll } from "../../../test-utils/db";

describeDb("database (PostgreSQL)", () => {
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

  it("hashes passwords with scrypt and verifies them", async () => {
    const hash = await hashPassword("correct horse battery");
    expect(hash.startsWith("scrypt$")).toBe(true);
    expect(await verifyPassword("correct horse battery", hash)).toBe(true);
    expect(await verifyPassword("wrong password!!", hash)).toBe(false);
    await expect(hashPassword("short")).rejects.toThrow();
  });

  it("creates sessions, validates and revokes them", async () => {
    const user = await createUser(h.db, "Admin@Example.com", "un-mot-de-passe-solide");
    expect(user.email).toBe("admin@example.com");
    const { token } = await createSession(h.db, user.id, { ip: "1.2.3.4" });
    expect((await validateSession(h.db, token))?.email).toBe("admin@example.com");
    expect(await validateSession(h.db, "x".repeat(43))).toBeNull();
    expect(await validateSession(h.db, undefined)).toBeNull();
    await deleteSession(h.db, token);
    expect(await validateSession(h.db, token)).toBeNull();
  });

  it("password change revokes all sessions", async () => {
    const user = await createUser(h.db, "a@b.ma", "un-mot-de-passe-solide");
    const { token } = await createSession(h.db, user.id);
    await setUserPassword(h.db, user.id, "un-autre-mot-de-passe");
    expect(await validateSession(h.db, token)).toBeNull();
  });

  it("rate-limits repeated failed logins", async () => {
    for (let i = 0; i < 5; i++) await recordLoginAttempt(h.db, "9.9.9.9", "a@b.ma", false);
    expect(await isLoginRateLimited(h.db, "9.9.9.9", null)).toBe(true);
    expect(await isLoginRateLimited(h.db, "8.8.8.8", null)).toBe(false);
  });

  it("rejects duplicate e-mails (case-insensitive)", async () => {
    await createUser(h.db, "a@b.ma", "un-mot-de-passe-solide");
    await expect(createUser(h.db, "A@B.MA", "un-mot-de-passe-solide")).rejects.toThrow();
    expect(await countUsers(h.db)).toBe(1);
  });

  it("supports criterion create / duplicate / enable / delete", async () => {
    const user = await createUser(h.db, "owner@example.com", "un-mot-de-passe-solide");
    const c = await createCriterion(h.db, EXAMPLE_CRITERIA[0]!, user.id);
    expect(c.filters.maxPrice).toBe(6000);
    const copy = await duplicateCriterion(h.db, c.id, user.id);
    expect(copy?.name).toContain("(copie)");
    expect(copy?.enabled).toBe(false);
    await setCriterionEnabled(h.db, c.id, true, user.id);
    expect((await listCriteria(h.db, { enabledOnly: true })).map((x) => x.id)).toEqual([c.id]);
    await deleteCriterion(h.db, c.id, user.id);
    expect(await getCriterion(h.db, c.id, user.id)).toBeNull();
  });

  it("isolates searches and shopper profiles between users", async () => {
    const houssam = await createUser(h.db, "houssam@test.com", "un-mot-de-passe-solide");
    const saad = await createUser(h.db, "saad@admin.local", "un-mot-de-passe-solide");
    const search = await createCriterion(h.db, EXAMPLE_CRITERIA[0]!, houssam.id);
    await saveUserProfile(h.db, houssam.id, { ...await getUserProfile(h.db, houssam.id), genders: ["Homme"] });
    expect((await listCriteria(h.db, { userId: houssam.id })).map(c => c.id)).toEqual([search.id]);
    expect(await listCriteria(h.db, { userId: saad.id })).toEqual([]);
    expect(await getCriterion(h.db, search.id, saad.id)).toBeNull();
    expect((await getUserProfile(h.db, saad.id)).genders).toEqual([]);
    expect(await duplicateCriterion(h.db, search.id, saad.id)).toBeNull();
    await setCriterionEnabled(h.db, search.id, false, saad.id);
    expect((await getCriterion(h.db, search.id, houssam.id))?.enabled).toBe(search.enabled);
    await deleteCriterion(h.db, search.id, saad.id);
    expect(await getCriterion(h.db, search.id, houssam.id)).not.toBeNull();
  });

  it("keeps shop access per account and blocks unauthorized searches", async () => {
    const a = await createUser(h.db, "a@b.ma", "un-mot-de-passe-solide");
    const b = await createUser(h.db, "b@b.ma", "un-mot-de-passe-solide");
    await h.db.insert(shops).values({ id: "nike-ma", name: "Nike Maroc", baseUrl: "https://www.nike.com/ma", active: true });
    expect((await listUserShops(h.db, a.id)).map(s => s.id)).toEqual(["marjane-mall"]);
    await expect(createCriterion(h.db, { ...EXAMPLE_CRITERIA[0]!, shopId: "nike-ma" }, a.id)).rejects.toThrow("Boutique indisponible");
    await grantUserShop(h.db, a.id, "nike-ma");
    const c = await createCriterion(h.db, { ...EXAMPLE_CRITERIA[0]!, shopId: "nike-ma", enabled: true }, a.id);
    expect((await listCriteria(h.db, { enabledOnly: true, shopId: "nike-ma" })).map(x => x.id)).toEqual([c.id]);
    expect((await listUserShops(h.db, b.id)).map(s => s.id)).toEqual(["marjane-mall"]);
    await revokeUserShop(h.db, a.id, "nike-ma");
    expect(await listCriteria(h.db, { enabledOnly: true, shopId: "nike-ma" })).toEqual([]);
  });

  it("stores settings with defaults", async () => {
    expect(await getAppSettings(h.db)).toEqual(DEFAULT_SETTINGS);
    await saveAppSettings(h.db, { ...DEFAULT_SETTINGS, requestDelayMs: 5000 });
    expect((await getAppSettings(h.db)).requestDelayMs).toBe(5000);
  });

  it("advisory lock prevents overlapping runs", async () => {
    let release!: () => void;
    const holding = new Promise<void>((r) => (release = r));
    const first = withAdvisoryLock(h.pool, SCRAPE_LOCK_KEY, () => holding.then(() => "first"));
    await new Promise((r) => setTimeout(r, 100));
    const second = await withAdvisoryLock(h.pool, SCRAPE_LOCK_KEY, async () => "second");
    expect(second.acquired).toBe(false);
    release();
    expect(await first).toEqual({ acquired: true, value: "first" });
    const third = await withAdvisoryLock(h.pool, SCRAPE_LOCK_KEY, async () => "third");
    expect(third).toEqual({ acquired: true, value: "third" });
  });
});
