/**
 * Social discovery runner.
 *
 * Discovers social media profiles (6 platforms) for businesses in the
 * canonical `businesses` table and writes them to businesses.social_urls.
 * The discovery logic lives in src/services/social-discovery.ts (website
 * extraction, SearXNG search + name-match verification, direct handle
 * probing). Businesses with no discoveries are left NULL so they stay
 * eligible for a re-run.
 *
 * Usage: npx tsx run-social-discovery.ts [options]
 *   --business <id>   Run for a single business by id
 *   --all             Re-run businesses that already have social_urls
 *   --limit <n>       Max businesses to process (default 5)
 *   --delay <ms>      Delay between discovery requests (default 1000)
 *   --dry-run         Print results instead of writing to the database
 *
 * Reads DATABASE_URL from the environment, falling back to the root .env
 * (same convention as scripts/migrate-postgres.mjs). The SearXNG endpoint
 * can be overridden with SEARXNG_URL.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import pg from 'pg';
import {
  discoverSocialProfiles,
  DiscoveryResult,
  Platform,
} from './src/services/social-discovery';

function loadDatabaseUrl(): string {
  if (process.env.DATABASE_URL) return process.env.DATABASE_URL;
  try {
    const env = readFileSync(join(process.cwd(), '.env'), 'utf8');
    const match = env.match(/^DATABASE_URL=(.*)$/m);
    if (match) return match[1].trim().replace(/^['"]|['"]$/g, '');
  } catch {
    // no .env file; fall through to the error below
  }
  throw new Error('DATABASE_URL is not set and no .env was found at the project root');
}

interface CliArgs {
  business?: string;
  all: boolean;
  limit: number;
  delayMs: number;
  dryRun: boolean;
}

function parseArgs(argv: string[]): CliArgs {
  const args: CliArgs = { all: false, limit: 5, delayMs: 1000, dryRun: false };
  for (let i = 0; i < argv.length; i += 1) {
    switch (argv[i]) {
      case '--business':
        args.business = argv[++i];
        break;
      case '--all':
        args.all = true;
        break;
      case '--limit':
        args.limit = Number(argv[++i]) || args.limit;
        break;
      case '--delay':
        args.delayMs = Number(argv[++i]) || args.delayMs;
        break;
      case '--dry-run':
        args.dryRun = true;
        break;
      default:
        throw new Error(`Unknown argument: ${argv[i]}`);
    }
  }
  return args;
}

interface BusinessRow {
  id: string;
  name: string;
  location: string | null;
  website: string | null;
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  const pool = new pg.Pool({ connectionString: loadDatabaseUrl() });

  try {
    let rows: BusinessRow[];
    if (args.business) {
      const res = await pool.query(
        'SELECT id, name, location, website FROM businesses WHERE id = $1',
        [args.business]
      );
      rows = res.rows as BusinessRow[];
      if (rows.length === 0) {
        console.error(`No business found with id ${args.business}`);
        process.exitCode = 1;
        return;
      }
    } else {
      const res = await pool.query(
        `SELECT id, name, location, website
         FROM businesses
         WHERE $1::boolean = TRUE OR social_urls IS NULL
         ORDER BY created_at ASC
         LIMIT $2`,
        [args.all, args.limit]
      );
      rows = res.rows as BusinessRow[];
      if (rows.length === 0) {
        console.log('No businesses to process (all have social_urls — use --all to re-run).');
        return;
      }
    }

    console.log(`Processing ${rows.length} business(es)${args.dryRun ? ' [dry run]' : ''}...\n`);
    let written = 0;
    for (const row of rows) {
      try {
        const result: DiscoveryResult = await discoverSocialProfiles(
          { name: row.name, location: row.location, website: row.website },
          { delayMs: args.delayMs, searxngUrl: process.env.SEARXNG_URL }
        );
        const platforms = Object.keys(result.socialUrls) as Platform[];

        if (args.dryRun) {
          console.log(JSON.stringify({ id: row.id, name: row.name, ...result }, null, 2));
        } else if (platforms.length > 0) {
          await pool.query('UPDATE businesses SET social_urls = $1 WHERE id = $2', [
            JSON.stringify(result.socialUrls),
            row.id,
          ]);
          written += 1;
        }

        console.log(
          `  ${row.name}: ${result.status}` +
            (platforms.length > 0 ? ` -> ${platforms.join(', ')}` : '')
        );
      } catch (err) {
        console.error(
          `  ${row.name}: FAILED — ${err instanceof Error ? err.message : String(err)}`
        );
      }
    }

    if (!args.dryRun) {
      console.log(`\nDone. social_urls written for ${written} of ${rows.length} business(es).`);
    }
  } finally {
    await pool.end();
  }
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exitCode = 1;
});
