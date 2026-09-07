/**
 * Geocoding backfill.
 *
 * Fills lat/lng for businesses and approved pending imports that have a
 * location/address but no coordinates yet, using OpenStreetMap Nominatim
 * (1 request per ~1.1s per their usage policy). Idempotent: rows that
 * already have coordinates are skipped, and distinct address strings are
 * deduped before requesting. Usage: npm run geocode (reads DATABASE_URL,
 * falling back to .env).
 */
import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');

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

const NOMINATIM = 'https://nominatim.openstreetmap.org/search';
const USER_AGENT = 'black-owned-directory/0.1 (geocoding backfill, low volume)';

// Addresses without a "City, ST" shape geocode to the wrong city (Nominatim
// guesses across the US). Only geocode values with a recognizable place,
// mirroring the directory API's deriveLocation rule.
function isGeocodable(address) {
  const parts = address.split(',').map((p) => p.trim()).filter(Boolean);
  return parts.length >= 2 && /^(?:[A-Za-z]{2})(?:\s+\d{5})?$/.test(parts[parts.length - 1]);
}
const SLEEP_MS = 1100;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function geocode(address) {
  const url = `${NOMINATIM}?format=json&limit=1&q=${encodeURIComponent(address)}`;
  const res = await fetch(url, {
    headers: { 'User-Agent': USER_AGENT, Accept: 'application/json' },
  });
  if (!res.ok) throw new Error(`Nominatim responded ${res.status}`);
  const data = await res.json();
  if (!Array.isArray(data) || data.length === 0) return null;
  return { lat: parseFloat(data[0].lat), lng: parseFloat(data[0].lon) };
}

async function main() {
  const client = new pg.Client({ connectionString: loadDatabaseUrl() });
  await client.connect();

  try {
    const pendingRows = (
      await client.query(
        `SELECT id, COALESCE(source_data->>'address', '') AS addr
         FROM pending_import_businesses
         WHERE lat IS NULL AND COALESCE(source_data->>'address', '') <> ''`
      )
    ).rows;

    const canonicalRows = (
      await client.query(
        `SELECT id, COALESCE(location, '') AS addr
         FROM businesses
         WHERE lat IS NULL AND location IS NOT NULL AND location <> ''`
      )
    ).rows;

    const addresses = new Set(
      [
        ...pendingRows.map((r) => r.addr.trim()),
        ...canonicalRows.map((r) => r.addr.trim()),
      ].filter((a) => isGeocodable(a))
    );

    const results = new Map(); // addr -> { lat, lng } | null
    for (const addr of addresses) {
      process.stdout.write(`Geocoding "${addr}" ... `);
      try {
        const geo = await geocode(addr);
        results.set(addr, geo);
        console.log(geo ? `${geo.lat}, ${geo.lng}` : 'no result');
      } catch (err) {
        results.set(addr, null);
        console.log(`error: ${err.message}`);
      }
      await sleep(SLEEP_MS);
    }

    let updated = 0;
    for (const r of pendingRows) {
      const geo = results.get(r.addr.trim());
      if (!geo) continue;
      const res = await client.query(
        'UPDATE pending_import_businesses SET lat = $1, lng = $2 WHERE id = $3',
        [geo.lat, geo.lng, r.id]
      );
      updated += res.rowCount;
    }
    for (const r of canonicalRows) {
      const geo = results.get(r.addr.trim());
      if (!geo) continue;
      const res = await client.query(
        'UPDATE businesses SET lat = $1, lng = $2 WHERE id = $3',
        [geo.lat, geo.lng, r.id]
      );
      updated += res.rowCount;
    }

    console.log(`Updated ${updated} row(s). Re-run to backfill any newly imported businesses.`);
  } finally {
    await client.end();
  }
}

main().catch((err) => {
  console.error(`geocode failed: ${err.message}`);
  process.exit(1);
});
