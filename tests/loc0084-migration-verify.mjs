/**
 * LOC-0084 acceptance test — migration 022 (businesses.highlights JSONB).
 *
 * Encodes the story Gherkin:
 *   AC1: businesses.highlights exists as nullable JSONB; schema_migrations
 *        records 022; existing rows untouched (highlights NULL, others intact)
 *   AC2: re-applying 022 exits 0 and schema_migrations holds EXACTLY one row
 *        for 022
 *
 * The repo has no full migration runner on this branch (the 001-021 chain and
 * scripts/migrate-postgres.mjs are not committed here), so APPLY=1 acts as a
 * minimal runner: it executes the 022 SQL file and records it in
 * schema_migrations (the runner's convention — the SQL file itself never
 * inserts into schema_migrations).
 *
 * Usage (run from the repo root against a throwaway Postgres):
 *   RED (fresh DB, migration not applied):
 *     DATABASE_URL=postgresql://user:pass@host:port/db node tests/loc0084-migration-verify.mjs
 *   GREEN (apply 022, then assert):
 *     DATABASE_URL=... APPLY=1 node tests/loc0084-migration-verify.mjs
 *   AC2 (idempotent re-run, assert exactly one schema_migrations row):
 *     DATABASE_URL=... APPLY=1 EXACT_ONE=1 node tests/loc0084-migration-verify.mjs
 *
 * Exit code: 0 = all checks passed, 1 = at least one check failed.
 */
import pg from 'pg';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const MIGRATION_FILE = path.join(
  __dirname, '..', 'migrations', 'postgresql', '022_add_highlights_to_business.sql'
);
const MIGRATION_NAME = '022_add_highlights_to_business.sql';
const APPLY = process.env.APPLY === '1';
const EXACT_ONE = process.env.EXACT_ONE === '1';

async function main() {
  if (!process.env.DATABASE_URL) {
    console.error('DATABASE_URL is required');
    process.exit(2);
  }
  const client = new pg.Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();
  const results = [];
  function check(name, pass, detail) {
    results.push({ name, pass: !!pass, detail });
  }

  // Test fixture: minimal businesses table + one pre-existing row, and the
  // schema_migrations bookkeeping table (runner convention). All idempotent,
  // so the same throwaway DB can back RED, GREEN, and the AC2 re-run.
  await client.query(`
    CREATE TABLE IF NOT EXISTS businesses (
      id SERIAL PRIMARY KEY,
      name TEXT NOT NULL,
      category_id TEXT,
      verification_status TEXT
    )`);
  await client.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      filename TEXT PRIMARY KEY
    )`);
  await client.query(`
    INSERT INTO businesses (name, category_id, verification_status)
    SELECT 'loc0084-test-business', 'test', 'unverified'
    WHERE NOT EXISTS (SELECT 1 FROM businesses WHERE name = 'loc0084-test-business')
  `);

  // Minimal runner: apply 022, then record it in schema_migrations.
  // Idempotent: IF NOT EXISTS on the column + ON CONFLICT on the record.
  let applyError = null;
  if (APPLY) {
    try {
      const sql = fs.readFileSync(MIGRATION_FILE, 'utf8');
      await client.query(sql);
      await client.query(
        `INSERT INTO schema_migrations (filename) VALUES ($1)
         ON CONFLICT (filename) DO NOTHING`,
        [MIGRATION_NAME]
      );
      console.log(`Applied ${MIGRATION_NAME}`);
    } catch (e) {
      applyError = e;
    }
  }
  if (EXACT_ONE) {
    check('AC2-Then: re-apply run exits 0 with no error', applyError === null,
      applyError ? applyError.message : 'ok');
  }

  // AC1: column exists as nullable JSONB
  try {
    const r = await client.query(`
      SELECT data_type, is_nullable FROM information_schema.columns
      WHERE table_name = 'businesses' AND column_name = 'highlights'
    `);
    check('AC1-Then: businesses.highlights exists', r.rowCount > 0, `rows=${r.rowCount}`);
    if (r.rowCount > 0) {
      check('AC1-Then: data_type is jsonb', r.rows[0].data_type === 'jsonb', r.rows[0].data_type);
      check('AC1-Then: column is nullable', r.rows[0].is_nullable === 'YES', r.rows[0].is_nullable);
    }
  } catch (e) {
    check('AC1-Then: column lookup', false, e.message);
  }

  // AC1-And: schema_migrations records 022 as applied
  try {
    const r = await client.query(`
      SELECT count(*)::int AS n FROM schema_migrations
      WHERE filename = $1
    `, [MIGRATION_NAME]);
    check('AC1-And: schema_migrations records 022', r.rows[0].n >= 1, `count=${r.rows[0].n}`);
    if (EXACT_ONE) {
      check('AC2-And: exactly one row for 022', r.rows[0].n === 1, `count=${r.rows[0].n}`);
    }
  } catch (e) {
    check('AC1-And: schema_migrations lookup', false, e.message);
  }

  // AC1 Scenario 2: existing row untouched — highlights NULL, other cols intact
  try {
    const r = await client.query(`
      SELECT highlights, name, category_id, verification_status
      FROM businesses WHERE name = 'loc0084-test-business'
    `);
    check('AC1-Scenario2: test row present', r.rowCount === 1, `rows=${r.rowCount}`);
    if (r.rowCount === 1) {
      check('AC1-Scenario2: highlights is NULL', r.rows[0].highlights === null,
        JSON.stringify(r.rows[0].highlights));
      check('AC1-Scenario2: name unchanged', r.rows[0].name === 'loc0084-test-business',
        r.rows[0].name);
      check('AC1-Scenario2: category_id unchanged', r.rows[0].category_id === 'test',
        r.rows[0].category_id);
    }
  } catch (e) {
    check('AC1-Scenario2: row check', false, e.message);
  }

  const failed = results.filter((x) => !x.pass);
  for (const x of results) {
    console.log(`${x.pass ? '[PASS]' : '[FAIL]'} ${x.name}${x.detail ? ` — ${x.detail}` : ''}`);
  }
  console.log(failed.length === 0 ? 'ALL CHECKS PASSED' : `${failed.length} CHECK(S) FAILED`);
  await client.end();
  process.exitCode = failed.length === 0 ? 0 : 1;
}

main();
