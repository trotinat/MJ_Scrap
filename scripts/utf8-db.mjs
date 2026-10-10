/**
 * The embedded PostgreSQL used on Windows was initialised with the system
 * code page (WIN1252), which cannot store characters such as "‑" (U+2011)
 * used in some Marjane product names. These helpers make sure the "mdw"
 * database is UTF-8, converting an existing database once (users, criteria
 * and settings are kept; the old database is renamed, never deleted).
 */

export const UTF8_INITDB_FLAGS = ["--encoding=UTF8", "--locale=C"];

const KEEP_TABLES = ["users", "search_criteria", "application_settings", "notification_settings"];

/** Returns the name of the renamed legacy database when a conversion started, else null. */
export async function ensureUtf8Database(pg, name = "mdw") {
  const client = pg.getPgClient("postgres");
  await client.connect();
  try {
    const { rows } = await client.query("select pg_encoding_to_char(encoding) as enc from pg_database where datname = $1", [name]);
    const create = () => client.query(`create database "${name}" template template0 encoding 'UTF8' lc_collate 'C' lc_ctype 'C'`);
    if (rows.length === 0) {
      await create();
      return null;
    }
    if (rows[0].enc === "UTF8") return null;
    const legacy = `${name}_${rows[0].enc.toLowerCase()}_${new Date().toISOString().slice(0, 10).replace(/-/g, "")}`;
    console.log(`Conversion de la base en UTF-8 (ancienne base conservée sous le nom « ${legacy} »)…`);
    await client.query(`select pg_terminate_backend(pid) from pg_stat_activity where datname = $1 and pid <> pg_backend_pid()`, [name]);
    await client.query(`alter database "${name}" rename to "${legacy}"`);
    await create();
    return legacy;
  } finally {
    await client.end();
  }
}

/** After migrations: copies users, criteria and settings from the legacy database. */
export async function copyFromLegacy(pg, legacy, name = "mdw") {
  const from = pg.getPgClient(legacy);
  const to = pg.getPgClient(name);
  await from.connect();
  await to.connect();
  try {
    await to.query("begin");
    for (const table of KEEP_TABLES) {
      const exists = await from.query("select to_regclass($1) as t", [`public.${table}`]);
      if (!exists.rows[0].t) continue;
      const cols = await to.query(
        "select column_name, data_type from information_schema.columns where table_schema = 'public' and table_name = $1 order by ordinal_position",
        [table],
      );
      const oldCols = new Set((await from.query("select column_name from information_schema.columns where table_schema='public' and table_name=$1", [table])).rows.map((r) => r.column_name));
      const shared = cols.rows.filter((c) => oldCols.has(c.column_name));
      const { rows } = await from.query(`select ${shared.map((c) => `"${c.column_name}"`).join(", ")} from "${table}"`);
      await to.query(`delete from "${table}"`);
      for (const row of rows) {
        const values = shared.map((c) => (/json/.test(c.data_type) && row[c.column_name] !== null ? JSON.stringify(row[c.column_name]) : row[c.column_name]));
        await to.query(
          `insert into "${table}" (${shared.map((c) => `"${c.column_name}"`).join(", ")}) values (${shared.map((_, i) => `$${i + 1}`).join(", ")})`,
          values,
        );
      }
      console.log(`  ${table} : ${rows.length} ligne(s) reprise(s)`);
    }
    await to.query("commit");
  } catch (err) {
    await to.query("rollback").catch(() => undefined);
    throw err;
  } finally {
    await from.end();
    await to.end();
  }
}
