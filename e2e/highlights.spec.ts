/**
 * LOC-0090 — E2E: highlights pipeline integration
 *
 * Drives a business from empty highlights to visible chips and a
 * pull-quote through the real pipeline (bw-scraper worker → Postgres →
 * Next.js directory/detail pages).
 *
 * AC1: Enrichment populates highlights end to end.
 *   Given a fixture business with source google_maps, category food-dining,
 *         NULL highlights and description, a stub homepage whose nav says
 *         "Soul Food" with an og:description of at least 40 chars, and 2
 *         visible seeded reviews sharing the phrase "live music"
 *   When an admin triggers an enrichment run
 *   Then the Postgres row has non-NULL highlights containing "Soul Food"
 *        and a non-NULL description
 *   And the directory card renders 3 or fewer chips
 *   And the detail page renders the chips and a "Customers say" quote from
 *        the seeded reviews
 *
 * AC2: Re-run is idempotent.
 *   Given the business enriched by AC1
 *   When enrichment runs again
 *   Then the report lists highlights as skipped
 *   And the row's highlights value is unchanged
 *
 * AC3: No-extraction path renders nothing.
 *   Given a fixture business whose homepage matches no dictionary terms and
 *         which has no usable reviews
 *   When enrichment runs and the directory loads
 *   Then highlights stays NULL
 *   And the card and detail page show no chip row and no empty section
 *
 * Fixture strategy (deterministic, no live SearXNG/Google):
 *   1. Serves SearXNG /search JSON (routed on the business-name marker in
 *      q) plus the /soul and /plain stub homepages from an in-process Node
 *      server on the host (port 9978 — 9977 is the enrichment spec's port).
 *   2. Recreates the worker container with SEARXNG_URL pointed at the host
 *      (resolved via host.docker.internal), preserving image, command,
 *      network, ports, and every other env var.
 *   3. Seeds businesses + reviews directly in Postgres (category slug
 *      food-dining, highlights NULL).
 *   4. Restores the original worker in afterAll (docker compose, discovered
 *      from the container's compose labels) and verifies its SEARXNG_URL
 *      came back.
 */

import { test, expect, beforeAll, afterAll } from '@playwright/test';
import { execSync, spawnSync } from 'node:child_process';
import http from 'node:http';
import type { E2ESession } from './e2e-utils';
import {
  BASE_URL,
  RUN_SUFFIX,
  E2E_PASSWORD,
  apiJson,
  loginUser,
  newSession,
  psql,
  promoteAdmin,
  warmRoutes,
} from './e2e-utils';

test.describe.configure({ mode: 'serial', timeout: 120_000 });

// ---------------------------------------------------------------------------
// Fixture content
// ---------------------------------------------------------------------------

const HL_FIX_PORT = 9978;
const WORKER_CONTAINER = 'black-owned-bw-scraper';

/**
 * Soul homepage: the nav carries "Soul Food" (prominent-zone hit for the
 * food-dining v1 dictionary). og:description is 40+ chars. No other
 * dictionary term appears anywhere, and "live music" appears ONLY in the
 * seeded reviews — its presence in the highlights therefore proves the
 * review-mining path, not dictionary matching.
 */
const SOUL_HOME_HTML = `<html><head>
<title>HL Soul Kitchen</title>
<meta property="og:description" content="A warm neighborhood kitchen with handcrafted plates and friendly daily service"/>
</head>
<body>
<nav><a href="/menu">Soul Food</a><a href="/about">About</a></nav>
<h1>HL Soul Kitchen</h1>
<p>Welcome to our family kitchen. We cook with care every day.</p>
</body></html>`;

/** Plain homepage: matches no food-dining dictionary term. */
const PLAIN_HOME_HTML = `<html><head>
<title>HL Plain Kitchen</title>
<meta property="og:description" content="A small family kitchen serving everyday plates with friendly service daily"/>
</head>
<body>
<nav><a href="/menu">Menu</a><a href="/about">About</a></nav>
<h1>HL Plain Kitchen</h1>
<p>Welcome to our family kitchen. We cook with care every day.</p>
</body></html>`;

/** Two visible positive reviews sharing the phrase "live music". */
const SOUL_REVIEWS: Array<{ rating: number; comment: string }> = [
  { rating: 5, comment: 'The live music set every Friday was fantastic' },
  { rating: 4, comment: 'Their live music program is worth the trip' },
];

// SearXNG snippets — plain text with a US phone number, no dictionary terms.
const SOUL_SNIPPET = 'A black owned kitchen serving comfort plates. Call (404) 555-0150.';
const SOUL_PHONE = '(404) 555-0150';
const PLAIN_SNIPPET = 'A small family kitchen serving everyday plates. Call (404) 555-0151.';

interface HLFixture {
  businessId: string;
  scrapedId: string;
  jobId: string;
  ownerId: string;
  email: string;
  name: string;
}

let fixtureServer: http.Server | null = null;
let admin: E2ESession;
let soul: HLFixture;
let plain: HLFixture;
let workerTouched = false;
let originalSearxngUrl = '';
let originalComposeProject = '';
let originalComposeFile = '';

// ---------------------------------------------------------------------------
// Docker helpers (same pattern as enrichment.spec.ts)
// ---------------------------------------------------------------------------

/** Host IPv4 as seen from inside the worker container. */
function workerHostIpv4(): string {
  const out = execSync(`docker exec ${WORKER_CONTAINER} getent ahostsv4 host.docker.internal`, {
    encoding: 'utf8',
  });
  const ip = out.trim().split(/\s+/)[0];
  if (!/^\d{1,3}(\.\d{1,3}){3}$/.test(ip)) {
    throw new Error(`no IPv4 for host.docker.internal from worker: ${out.trim()}`);
  }
  return ip;
}

function dockerInspect(format: string): string {
  // Double-quote the format expression so cmd.exe hands it to docker as a
  // single argument.
  const out = execSync(`docker inspect ${WORKER_CONTAINER} --format "${format}"`, {
    encoding: 'utf8',
  });
  return out.trim();
}

function workerEnv(): string[] {
  return JSON.parse(dockerInspect('{{json .Config.Env}}')) as string[];
}

/**
 * Capture the worker's compose labels (project + config file) BEFORE the
 * container is touched, so the restore rebuilds via the original stack
 * regardless of the directory this spec is run from.
 */
function captureComposeOrigin(): void {
  const labels = JSON.parse(dockerInspect('{{json .Config.Labels}}')) as Record<string, string>;
  originalComposeProject = labels['com.docker.compose.project'] ?? '';
  originalComposeFile = labels['com.docker.compose.project.config_files'] ?? '';
}

async function waitForWorkerHealth(timeoutMs = 90_000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    try {
      const res = await fetch('http://127.0.0.1:8080/health');
      if (res.ok) return;
    } catch {
      /* worker not up yet */
    }
    if (Date.now() > deadline) throw new Error('worker /health did not come back up in time');
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
}

/**
 * Recreate the worker container with SEARXNG_URL pointed at the local
 * fixture server, preserving image, command, network, ports, and all
 * other env vars from the original container.
 */
function recreateWorkerWithSearXng(searxngUrl: string): void {
  const image = dockerInspect('{{.Config.Image}}');
  const cmd: string[] = JSON.parse(dockerInspect('{{json .Config.Cmd}}')) ?? [];
  const networks = Object.keys(
    JSON.parse(dockerInspect('{{json .NetworkSettings.Networks}}')) as Record<string, unknown>
  );
  const env = workerEnv().map((e) =>
    e.startsWith('SEARXNG_URL=') ? `SEARXNG_URL=${searxngUrl}` : e
  );
  const portBindings = JSON.parse(
    dockerInspect('{{json .HostConfig.PortBindings}}')
  ) as Record<string, Array<{ HostIp: string; HostPort: string }>>;
  const portArgs = Object.entries(portBindings).flatMap(([containerPort, bindings]) =>
    bindings.flatMap(
      (b) => [
        '--publish',
        `${b.HostIp ? `${b.HostIp}:` : ''}${b.HostPort}:${containerPort.replace('/tcp', '')}`,
      ]
    )
  );
  if (portArgs.length === 0) {
    throw new Error('worker has no published ports; cannot verify health');
  }

  workerTouched = true;
  execSync(`docker stop ${WORKER_CONTAINER}`);
  execSync(`docker rm ${WORKER_CONTAINER}`);
  const args = [
    'run',
    '-d',
    '--name',
    WORKER_CONTAINER,
    ...networks.flatMap((n) => ['--network', n]),
    ...portArgs,
    ...env.flatMap((e) => ['-e', e]),
    image,
    ...cmd,
  ];
  const spawned = spawnSync('docker', args, { encoding: 'utf8' });
  if (spawned.status !== 0) {
    throw new Error(`docker run failed (${spawned.status}): ${spawned.stderr}`);
  }
}

/**
 * Restore the original worker: stop + remove the fixture worker, let the
 * original compose stack recreate it, wait for health, and verify the
 * original SEARXNG_URL came back.
 */
async function restoreWorker(): Promise<void> {
  try { execSync(`docker stop ${WORKER_CONTAINER}`); } catch { /* already stopped/gone */ }
  try { execSync(`docker rm ${WORKER_CONTAINER}`); } catch { /* not present */ }
  const composeArgs = originalComposeProject && originalComposeFile
    ? `-p ${originalComposeProject} -f "${originalComposeFile}"`
    : '';
  execSync(`docker compose ${composeArgs} up -d bw-scraper`);
  await waitForWorkerHealth();
  expect(workerEnv(), 'worker must come back with the original SEARXNG_URL').toContain(
    originalSearxngUrl
  );
}

// ---------------------------------------------------------------------------
// Fixture server + seeding
// ---------------------------------------------------------------------------

/**
 * Start the fixture server: /search answers SearXNG JSON routed by the
 * business-name marker in q ("HL Soul" vs "HL Plain"); /soul and /plain
 * serve the stub homepages. The SearXNG result URLs point back at this
 * server so the worker's homepage fetch stays in-process.
 */
function startHighlightsFixtureServer(hostIp: string): Promise<http.Server> {
  const searxngFor = (page: string, title: string, content: string): string =>
    JSON.stringify({
      query: page,
      number_of_results: 1,
      results: [
        {
          url: `http://${hostIp}:${HL_FIX_PORT}/${page}`,
          title,
          content,
          engine: 'searxng',
          score: 1.0,
        },
      ],
      answers: [],
      infoboxes: [],
      suggestions: [],
      articles: [],
    });

  return new Promise((resolve, reject) => {
    const server = http.createServer((req, res) => {
      const url = new URL(req.url ?? '/', `http://127.0.0.1:${HL_FIX_PORT}`);
      if (url.pathname === '/search') {
        const q = url.searchParams.get('q') ?? '';
        const body = q.includes('HL Soul')
          ? searxngFor('soul', 'HL Soul Kitchen', SOUL_SNIPPET)
          : searxngFor('plain', 'HL Plain Kitchen', PLAIN_SNIPPET);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(body);
        return;
      }
      if (url.pathname === '/soul') {
        res.writeHead(200, { 'Content-Type': 'text/html' });
        res.end(SOUL_HOME_HTML);
        return;
      }
      if (url.pathname === '/plain') {
        res.writeHead(200, { 'Content-Type': 'text/html' });
        res.end(PLAIN_HOME_HTML);
        return;
      }
      res.writeHead(404, { 'Content-Type': 'application/json' });
      res.end('{}');
    });
    server.once('error', reject);
    server.listen(HL_FIX_PORT, '0.0.0.0', () => resolve(server));
  });
}

/**
 * psql (docker exec) appends the command tag ("INSERT 0 1") after the
 * RETURNING row even with -t -A — keep only the first line.
 */
function psqlReturning(sql: string): string {
  return psql(sql).split(/\r?\n/)[0].trim();
}

/**
 * Seed the highlights fixture family: owner user, scrape job, an empty
 * businesses row (category food-dining, NULL highlights), and the
 * google_maps scraped_businesses source row (the name join is the
 * engine's source-resolution convention).
 */
function seedHlBusiness(name: string, sourceId: string): HLFixture {
  // Name-derived: multiple ACs seed distinct owner users in one serial
  // file — a fixed email would hit users_email_key on the second seed.
  const email = `e2e-hl-${RUN_SUFFIX}-${name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}@example.com`;
  const ownerId = psqlReturning(
    `INSERT INTO users (email, password_hash, name, role) VALUES ('${email}', 'test', 'E2E HL Owner', 'user') RETURNING id::text`
  );
  const jobId = psqlReturning(
    `INSERT INTO scrape_jobs (source, query, location) VALUES ('e2e-hl', 'e2e highlights seed', 'Test') RETURNING id::text`
  );
  const businessId = psqlReturning(
    `INSERT INTO businesses (owner_id, name, category_id, phone, website, description, rating, review_count, menu_url, image_url, social_urls) VALUES ('${ownerId}', '${name}', 'food-dining', NULL, NULL, NULL, 0, 0, NULL, NULL, NULL) RETURNING id::text`
  );
  const scrapedId = psqlReturning(
    `INSERT INTO scraped_businesses (scrape_job_id, source, name, source_id) VALUES ('${jobId}', 'google_maps', '${name}', '${sourceId}') RETURNING id::text`
  );
  return { businessId, scrapedId, jobId, ownerId, email, name };
}

/** Tear down one seeded family (reviews first — FK to businesses). Idempotent. */
function cleanupHlBusiness(f: HLFixture | undefined): void {
  if (!f?.businessId) return;
  psql(`DELETE FROM reviews WHERE business_id='${f.businessId}'`);
  psql(`DELETE FROM business_locations WHERE business_id='${f.businessId}'`);
  psql(`DELETE FROM businesses WHERE id='${f.businessId}'`);
  psql(`DELETE FROM scraped_businesses WHERE id='${f.scrapedId}'`);
  psql(`DELETE FROM scrape_jobs WHERE id='${f.jobId}'`);
  psql(`DELETE FROM users WHERE email='${f.email}'`);
}

beforeAll(async () => {
  soul = seedHlBusiness(
    `HL Soul Kitchen ${RUN_SUFFIX}`,
    'http://maps.google.e2e-hl:9978/maps/preview/place?cid=hle2e-soul'
  );
  plain = seedHlBusiness(
    `HL Plain Kitchen ${RUN_SUFFIX}`,
    'http://maps.google.e2e-hl:9978/maps/preview/place?cid=hle2e-plain'
  );
  for (const r of SOUL_REVIEWS) {
    psql(
      `INSERT INTO reviews (business_id, user_id, rating, comment, visible) VALUES ('${soul.businessId}', '${soul.ownerId}', ${r.rating}, '${r.comment}', true)`
    );
  }

  originalSearxngUrl =
    workerEnv().find((e) => e.startsWith('SEARXNG_URL=')) ?? 'SEARXNG_URL=http://192.168.68.50:8888';
  captureComposeOrigin();

  const hostIp = workerHostIpv4();
  fixtureServer = await startHighlightsFixtureServer(hostIp);
  recreateWorkerWithSearXng(`http://${hostIp}:${HL_FIX_PORT}`);
  await waitForWorkerHealth();

  admin = await newSession('e2e-admin-hl');
  promoteAdmin(admin.email);
  admin = await loginUser(admin.email, E2E_PASSWORD);

  // warmRoutes returns after the first path warms — one call per route.
  await warmRoutes(['/directory']);
  await warmRoutes([`/business/${soul.businessId}`, `/business/${plain.businessId}`]);
  await warmRoutes(['/api/admin/enrichment']);
}, 300_000);

afterAll(async () => {
  cleanupHlBusiness(soul);
  cleanupHlBusiness(plain);
  try {
    psql(`DELETE FROM users WHERE email='${admin.email}'`);
  } catch {
    /* best effort */
  }
  if (workerTouched) {
    await restoreWorker();
  }
  fixtureServer?.close();
}, 300_000);

// ---------------------------------------------------------------------------
// AC1: enrichment populates highlights end to end
// ---------------------------------------------------------------------------

test.describe('AC1: enrichment populates highlights end to end', () => {
  test('admin trigger enriches the soul fixture; report applies highlights', async () => {
    const { status, body } = await apiJson('/api/admin/enrichment', {
      method: 'POST',
      body: { business_ids: [soul.businessId] },
      token: admin.accessToken,
    });

    expect(status, `enrich endpoint: ${JSON.stringify(body).slice(0, 500)}`).toBe(200);
    expect(body.success).toBe(true);
    const report = body.data.report;
    const entry = report.businesses.find((b: { id: string }) => b.id === soul.businessId);
    expect(entry, `business entry missing from report: ${JSON.stringify(report.businesses)}`).toBeDefined();
    expect(entry.error).toBeNull();
    expect(entry.applied, 'first run must apply highlights').toContain('highlights');
  });

  test('postgres row has non-NULL highlights containing "Soul Food" and a non-NULL description', () => {
    const row = psqlReturning(
      `SELECT CASE WHEN highlights IS NULL THEN 'null' ELSE highlights::text END || '|' || COALESCE(description, '') FROM businesses WHERE id='${soul.businessId}'`
    );
    const [hl, desc] = row.split('|');

    expect(hl, 'highlights must not be NULL after enrichment').not.toBe('null');
    const entries = JSON.parse(hl) as string[];
    expect(entries).toContain('Soul Food');
    // "live music" occurs only in the seeded reviews — its presence proves
    // the review-mining path reached the DB.
    expect(entries).toContain('live music');
    expect(desc.length, 'description must be non-NULL').toBeGreaterThan(0);
  });

  test('directory card renders 3 or fewer chips', async ({ page }) => {
    await page.goto(`${BASE_URL}/directory`);
    // Hydration guard: wait for the seeded card before interacting.
    const card = page.getByRole('link', { name: soul.name });
    await expect(card).toBeVisible({ timeout: 30_000 });
    await page.locator('input[aria-label="Search businesses"]').fill(soul.name);

    // Exactly the two extracted entries, so the 3-or-fewer cap holds.
    await expect(card.getByText('Soul Food', { exact: true })).toBeVisible({ timeout: 15_000 });
    await expect(card.getByText('live music', { exact: true })).toBeVisible();
    await expect(card.locator('.highlight-chip')).toHaveCount(2);
  });

  test('detail page renders the chips and a "Customers say" quote from the seeded reviews', async ({ page }) => {
    await page.goto(`${BASE_URL}/business/${soul.businessId}`);

    await expect(page.getByText('Soul Food', { exact: true })).toBeVisible({ timeout: 15_000 });
    await expect(page.getByText('live music', { exact: true })).toBeVisible();
    await expect(page.locator('.highlight-chip')).toHaveCount(2);

    // Pull-quote: highest rating wins — the 5-star seeded review.
    await expect(page.getByRole('heading', { name: 'Customers say' })).toBeVisible();
    await expect(
      page.getByText('"The live music set every Friday was fantastic"', { exact: true })
    ).toBeVisible();
  });
});

// ---------------------------------------------------------------------------
// AC2: re-run is idempotent
// ---------------------------------------------------------------------------

test.describe('AC2: re-run is idempotent', () => {
  test('re-run lists highlights as skipped and the row value is unchanged', async () => {
    const fpBefore = psqlReturning(
      `SELECT md5(COALESCE(highlights::text, '')) FROM businesses WHERE id='${soul.businessId}'`
    );

    const { status, body } = await apiJson('/api/admin/enrichment', {
      method: 'POST',
      body: { business_ids: [soul.businessId] },
      token: admin.accessToken,
    });

    expect(status, `re-run enrich endpoint: ${JSON.stringify(body).slice(0, 500)}`).toBe(200);
    const report = body.data.report;
    const entry = report.businesses.find((b: { id: string }) => b.id === soul.businessId);
    expect(entry, `business entry missing from report: ${JSON.stringify(report.businesses)}`).toBeDefined();
    expect(entry.error).toBeNull();
    // Idempotency contract: nothing re-applies, highlights reports skipped.
    expect(entry.applied).not.toContain('highlights');
    expect(entry.skipped).toContain('highlights');

    const fpAfter = psqlReturning(
      `SELECT md5(COALESCE(highlights::text, '')) FROM businesses WHERE id='${soul.businessId}'`
    );
    expect(fpAfter, 'row highlights value must be unchanged by the re-run').toBe(fpBefore);
  });
});

// ---------------------------------------------------------------------------
// AC3: no-extraction path renders nothing
// ---------------------------------------------------------------------------

test.describe('AC3: no-extraction path renders nothing', () => {
  test('enrichment runs and highlights stays NULL', async () => {
    const { status, body } = await apiJson('/api/admin/enrichment', {
      method: 'POST',
      body: { business_ids: [plain.businessId] },
      token: admin.accessToken,
    });

    expect(status, `enrich endpoint: ${JSON.stringify(body).slice(0, 500)}`).toBe(200);
    expect(body.success).toBe(true);
    const entry = body.data.report.businesses.find((b: { id: string }) => b.id === plain.businessId);
    expect(entry, `business entry missing: ${JSON.stringify(body.data.report.businesses)}`).toBeDefined();
    expect(entry.error).toBeNull();
    expect(entry.applied, 'no highlights may apply for the plain fixture').not.toContain('highlights');

    const hl = psqlReturning(
      `SELECT CASE WHEN highlights IS NULL THEN 'null' ELSE 'set' END FROM businesses WHERE id='${plain.businessId}'`
    );
    expect(hl, 'highlights must stay NULL when nothing extracts').toBe('null');
  });

  test('card and detail show no chip row and no empty section', async ({ page }) => {
    await page.goto(`${BASE_URL}/directory`);
    const card = page.getByRole('link', { name: plain.name });
    await expect(card).toBeVisible({ timeout: 30_000 });
    await page.locator('input[aria-label="Search businesses"]').fill(plain.name);
    await expect(card.locator('.highlight-chip')).toHaveCount(0);

    await page.goto(`${BASE_URL}/business/${plain.businessId}`);
    await expect(page.locator('.highlight-chip')).toHaveCount(0);
    await expect(page.getByRole('heading', { name: 'Customers say' })).toHaveCount(0);
    // The reviews section renders its empty state, not a quote block.
    await expect(page.getByText('No reviews on this site yet.', { exact: true })).toBeVisible();
  });
});
