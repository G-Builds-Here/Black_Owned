/**
 * Postgres migration runner.
 *
 * Applies migrations/postgresql/*.sql in numeric-prefix order, one file per
 * transaction, tracking applied files in schema_migrations. Re-runs are
 * no-ops. Usage: npm run migrate (reads DATABASE_URL, falling back to .env).
 */
import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const migrationsDir = join(root, 'migrations', 'postgresql');

function loadDatabaseUrl() {
  if (process.env.DATABASE_URL) return process.env.DATABASE_URL;
  try {
    const env = readFileSync(join(root, '.env'), 'utf8');
    const match = env.match(/^DATABASE_URL=(.*)$/m);
    if (match) return match[1].trim().replace(/^['"]|['"]$/g, '');
  } catch {
    // no .env file; fall through to the error below
  }
  throw new Error('DATABASE_URL is not set and no .env was found at the project root');
}

const client = new pg.Client({ connectionString: loadDatabaseUrl() });

async function main() {
  await client.connect();
  try {
    await client.query(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        filename TEXT PRIMARY KEY,
        applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);
    const applied = new Set(
      (await client.query('SELECT filename FROM schema_migrations')).rows.map((r) => r.filename)
    );

    const files = readdirSync(migrationsDir)
      .filter((f) => f.endsWith('.sql'))
      .sort((a, b) => {
        const na = Number(a.match(/^(\d+)/)?.[1] ?? Number.MAX_SAFE_INTEGER);
        const nb = Number(b.match(/^(\d+)/)?.[1] ?? Number.MAX_SAFE_INTEGER);
        return na === nb ? a.localeCompare(b) : na - nb;
      });

    let appliedCount = 0;
    for (const file of files) {
      if (applied.has(file)) continue;
      const sql = readFileSync(join(migrationsDir, file), 'utf8');
      console.log(`Applying ${file} ...`);
      try {
        await client.query('BEGIN');
        // No parameters, so node-postgres uses the simple query protocol,
        // which allows multiple statements (including DO $$ blocks) here.
        await client.query(sql);
        await client.query('INSERT INTO schema_migrations (filename) VALUES ($1)', [file]);
        await client.query('COMMIT');
        appliedCount += 1;
      } catch (err) {
        await client.query('ROLLBACK');
        console.error(`Migration ${file} failed: ${err.message}`);
        await client.end();
        process.exit(1);
      }
    }

    if (appliedCount > 0) {
      console.log(`Applied ${appliedCount} migration(s).`);
    } else {
      console.log('Database up to date. No migrations to apply.');
    }
  } finally {
    await client.end();
  }
}

main().catch((err) => {
  console.error(`migrate failed: ${err.message}`);
  process.exit(1);
});
