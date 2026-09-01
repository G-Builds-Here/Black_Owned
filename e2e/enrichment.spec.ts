/**
 * LOC-0082 — Enrichment pipeline E2E
 *
 * AC1: End-to-end enrichment happy path.
 *   Given a test business with source "google_maps" and empty content
 *         fields
 *   When an admin triggers enrichment via POST /api/admin/enrichment
 *   Then the business row in Postgres has phone, website, and
 *        description populated from the SearXNG fixture result
 *   And the directory and business detail pages render the enriched
 *        values (rating/review_count stay at the seeded zeros — the
 *        SearXNG lookup does not supply them)
 *
 * Fixture strategy (deterministic, no live SearXNG/Google):
 *   The enrichment engine looks each business up on SearXNG by name
 *   (+ location) and never fetches `scraped_businesses.source_id` — the
 *   share link is only the eligibility gate. This spec:
 *     1. Serves a SearXNG /search fixture from an in-process Node server
 *        on the host (port 9977), routing on the business name in `q`.
 *     2. Recreates the worker container with SEARXNG_URL pointed at the
 *        host (resolved via `host.docker.internal`), preserving image,
 *        command, network, ports, and every other env var.
 *     3. Restores the original worker in afterAll (docker compose) and
 *        verifies its SEARXNG_URL came back.
 *
 * AC2 (idempotent re-run) and AC3 (partial-failure isolation) extend
 * this spec via the seed/cleanup helpers below.
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
// SearXNG fixture results — deterministic, intentionally distinct from any
// real SearXNG output so a pass can never come from stale data. The engine
// derives: website = result URL, description = snippet, phone = first
// US-style number in the snippet (ETL regex). Routing markers are uppercase
// words — RUN_SUFFIX is lowercase base36+hex, so they cannot collide.
// ---------------------------------------------------------------------------

const SEARXNG_FIX_PORT = 9977;

const FIXTURE = {
  website: 'https://fixture-e2e.example',
  content: 'E2E enrichment fixture kitchen. Call (404) 555-0142.',
};
const FIXTURE_PHONE = '(404) 555-0142';

const FIXTURE_2 = {
  website: 'https://ac2-fixture.example',
  content: 'E2E AC2 idempotent fixture kitchen. Call (404) 555-0133.',
};
const FIXTURE_2_PHONE = '(404) 555-0133';

const FIXTURE_3 = {
  website: 'https://ac3-fixture.example',
  content: 'E2E AC3 isolation fixture kitchen. Call (404) 555-0147.',
};
const FIXTURE_3_PHONE = '(404) 555-0147';

// Google-shaped source_id for the eligibility gate; never fetched.
const FIXTURE_SOURCE_ID = 'http://maps.google.e2e-fixture:9977/maps/preview/place?cid=e2e0082';

const WORKER_CONTAINER = 'black-owned-bw-scraper';

interface EnrichFixture {
  businessId: string;
  scrapedId: string;
  jobId: string;
  ownerId: string;
  email: string;
  name: string;
}

let fixtureServer: http.Server | null = null;
let admin: E2ESession;
let biz: EnrichFixture;
let workerTouched = false;
let originalSearxngUrl = '';

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
 * Restore the original worker: stop + remove the fixture worker, let
 * docker compose recreate it, wait for health, and verify the original
 * SEARXNG_URL came back.
 */
async function restoreWorker(): Promise<void> {
  try { execSync(`docker stop ${WORKER_CONTAINER}`); } catch { /* already stopped/gone */ }
  try { execSync(`docker rm ${WORKER_CONTAINER}`); } catch { /* not present */ }
  execSync('docker compose up -d bw-scraper');
  await waitForWorkerHealth();
  expect(workerEnv(), 'worker must come back with the original SEARXNG_URL').toContain(
    originalSearxngUrl
  );
}

/**
 * Start the SearXNG fixture server: answers GET /search?format=json with
 * one result routed by the business name in `q` (uppercase markers keep
 * the routes disjoint); the "IsoFail" marker answers 500 to exercise
 * AC3's failure isolation.
 */
function startSearXngFixtureServer(port: number): Promise<http.Server> {
  return new Promise((resolve, reject) => {
    const server = http.createServer((req, res) => {
      const url = new URL(req.url ?? '/', `http://127.0.0.1:${port}`);
      if (url.pathname !== '/search') {
        res.writeHead(404, { 'Content-Type': 'application/json' });
        res.end('{}');
        return;
      }
      const q = url.searchParams.get('q') ?? '';
      if (q.includes('IsoFail')) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end('{"error": "fixture failure marker"}');
        return;
      }
      let fixture = FIXTURE;
      if (q.includes('Iso')) fixture = FIXTURE_3;
      else if (q.includes('Idem')) fixture = FIXTURE_2;
      const body = JSON.stringify({
        query: q,
        number_of_results: 1,
        results: [
          {
            url: fixture.website,
            title: q,
            content: fixture.content,
            engine: 'searxng',
            score: 1.0,
          },
        ],
        answers: [],
        infoboxes: [],
        suggestions: [],
        articles: [],
      });
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(body);
    });
    server.once('error', reject);
    server.listen(port, '0.0.0.0', () => resolve(server));
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
 * Seed the enrichment fixture: owner user, scrape job, an empty businesses
 * row, and the scraped_businesses source row (google_maps + source_id).
 * The name join (s.name = b.name) is the engine's source-resolution
 * convention. Reusable by AC2 (re-run the same business) and AC3 (two
 * businesses, different source_ids).
 */
function seedEnrichmentBusiness(name: string, sourceId: string): EnrichFixture {
  // Name-derived: multiple ACs seed distinct owner users in one serial
  // file — a fixed email would hit users_email_key on the second seed.
  const email = `e2e-enrich-${RUN_SUFFIX}-${name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}@example.com`;
  const ownerId = psqlReturning(
    `INSERT INTO users (email, password_hash, name, role) VALUES ('${email}', 'test', 'E2E Enrich Owner', 'user') RETURNING id::text`
  );
  const jobId = psqlReturning(
    `INSERT INTO scrape_jobs (source, query, location) VALUES ('e2e-enrich', 'e2e enrichment seed', 'Test') RETURNING id::text`
  );
  const businessId = psqlReturning(
    `INSERT INTO businesses (owner_id, name, category_id, phone, website, description, rating, review_count, menu_url, image_url, social_urls) VALUES ('${ownerId}', '${name}', 'test-enrichment', NULL, NULL, NULL, 0, 0, NULL, NULL, NULL) RETURNING id::text`
  );
  const scrapedId = psqlReturning(
    `INSERT INTO scraped_businesses (scrape_job_id, source, name, source_id) VALUES ('${jobId}', 'google_maps', '${name}', '${sourceId}') RETURNING id::text`
  );
  return { businessId, scrapedId, jobId, ownerId, email, name };
}

/** Tear down the seeded family. Idempotent. */
function cleanupEnrichmentBusiness(b: EnrichFixture | undefined): void {
  if (!b?.businessId) return;
  psql(`DELETE FROM businesses WHERE id='${b.businessId}'`);
  psql(`DELETE FROM scraped_businesses WHERE id='${b.scrapedId}'`);
  psql(`DELETE FROM scrape_jobs WHERE id='${b.jobId}'`);
  psql(`DELETE FROM users WHERE email='${b.email}'`);
}

beforeAll(async () => {
  biz = seedEnrichmentBusiness(`Enrich E2E ${RUN_SUFFIX}`, FIXTURE_SOURCE_ID);
  fixtureServer = await startSearXngFixtureServer(SEARXNG_FIX_PORT);
  originalSearxngUrl =
    workerEnv().find((e) => e.startsWith('SEARXNG_URL=')) ?? 'SEARXNG_URL=http://192.168.68.50:8888';
  recreateWorkerWithSearXng(`http://${workerHostIpv4()}:${SEARXNG_FIX_PORT}`);
  workerTouched = true;
  await waitForWorkerHealth();
  admin = await newSession('e2e-admin-enrich');
  promoteAdmin(admin.email);
  admin = await loginUser(admin.email, E2E_PASSWORD);
  // warmRoutes returns after the first path warms — one call per route.
  await warmRoutes(['/directory']);
  await warmRoutes([`/business/${biz.businessId}`]);
  await warmRoutes(['/api/admin/enrichment']);
}, 240_000);

afterAll(async () => {
  cleanupEnrichmentBusiness(biz);
  try {
    psql(`DELETE FROM users WHERE email='${admin.email}'`);
  } catch {
    /* best effort */
  }
  if (workerTouched) {
    await restoreWorker();
  }
  fixtureServer?.close();
}, 240_000);

test('AC1: admin enrichment trigger enriches the seeded business from the SearXNG fixture', async () => {
  const { status, body } = await apiJson('/api/admin/enrichment', {
    method: 'POST',
    body: { business_ids: [biz.businessId] },
    token: admin.accessToken,
  });

  expect(status, `enrich endpoint: ${JSON.stringify(body).slice(0, 500)}`).toBe(200);
  expect(body.success).toBe(true);
  const report = body.data.report;
  expect(report.summary).toEqual({ total: 1, enriched: 1, skipped: 0, failed: 0 });
  const entry = report.businesses.find((b: { id: string }) => b.id === biz.businessId);
  expect(entry, `business entry missing from report: ${JSON.stringify(report.businesses)}`).toBeDefined();
  expect(entry.error).toBeNull();
  // SearXNG lookups supply exactly three fields; rating/review_count stay
  // at the seeded zeros.
  expect([...entry.applied].sort()).toEqual(['description', 'phone', 'website']);
});

test('AC1: postgres row carries the SearXNG fixture values', () => {
  const row = psql(
    `SELECT COALESCE(phone, '') || '|' || COALESCE(website, '') || '|' || COALESCE(description, '') || '|' || CASE WHEN rating = 0 AND review_count = 0 THEN 'zeros' ELSE 'changed' END FROM businesses WHERE id='${biz.businessId}'`
  );
  expect(row).toBe(`${FIXTURE_PHONE}|${FIXTURE.website}|${FIXTURE.content}|zeros`);
});

test('AC1: directory API exposes the enriched fields', async () => {
  const { status, body } = await apiJson(`/api/directory?search=${encodeURIComponent(biz.name)}`);
  expect(status).toBe(200);
  expect(body.success).toBe(true);
  const item = (body.data.businesses as Array<Record<string, unknown>>).find(
    (b) => b.name === biz.name
  );
  expect(item, `business ${biz.name} not in directory API: ${JSON.stringify(body.data).slice(0, 500)}`).toBeDefined();
  expect(item!.description).toBe(FIXTURE.content);
  expect(Number(item!.rating)).toBe(0);
  expect(Number(item!.reviewCount)).toBe(0);
  expect(item!.website).toBe(FIXTURE.website);
});

test('AC1: directory page renders the enriched card', async ({ page }) => {
  await page.goto(`${BASE_URL}/directory`);
  // Hydration guard: wait for the seeded card before interacting.
  const card = page.getByRole('link', { name: biz.name });
  await expect(card).toBeVisible({ timeout: 30_000 });
  await page.locator('input[aria-label="Search businesses"]').fill(biz.name);

  // Card content: fixture description + zeroed rating/reviews, scoped to the card.
  await expect(card.getByText(FIXTURE.content, { exact: true })).toBeVisible({ timeout: 15_000 });
  await expect(card.getByRole('img', { name: 'Rating: 0 out of 5 stars' })).toBeVisible();
  await expect(card.getByText('(0)', { exact: true })).toBeVisible();
});

test('AC1: detail page renders enriched values with external and on-site review counts separated', async ({ page }) => {
  await page.goto(`${BASE_URL}/business/${biz.businessId}`);

  // Enriched content from the SearXNG fixture.
  await expect(page.getByText(FIXTURE.content, { exact: true })).toBeVisible({ timeout: 15_000 });
  await expect(page.locator(`a[href="tel:${FIXTURE_PHONE}"]`)).toContainText(FIXTURE_PHONE);
  await expect(page.locator(`a[href="${FIXTURE.website}"]`)).toBeVisible();

  // External (Google) count renders zero — the SearXNG lookup supplies no
  // rating/review_count, and the on-site section stays separate.
  await expect(page.getByText('0 reviews on Google', { exact: true })).toBeVisible();
  await expect(page.getByText('No reviews on this site yet.', { exact: true })).toBeVisible();
});

test.describe('AC2: idempotent re-run', () => {
  let biz2: EnrichFixture;

  beforeAll(async () => {
    biz2 = seedEnrichmentBusiness(`Enrich E2E Idem ${RUN_SUFFIX}`, FIXTURE_SOURCE_ID);
    // /directory is already warmed by the root beforeAll.
    await warmRoutes([`/business/${biz2.businessId}`]);
  }, 180_000);

  afterAll(async () => {
    // Strict teardown: AC2's AC requires verified residue-free cleanup.
    // If seeding itself failed, biz2 is undefined and there is nothing to verify.
    cleanupEnrichmentBusiness(biz2);
    if (!biz2) return;

    expect(psql(`SELECT count(*) FROM businesses WHERE name='${biz2.name}'`)).toBe('0');
    expect(psql(`SELECT count(*) FROM scraped_businesses WHERE name='${biz2.name}'`)).toBe('0');
    expect(psql(`SELECT count(*) FROM scrape_jobs WHERE id='${biz2.jobId}'`)).toBe('0');
    expect(psql(`SELECT count(*) FROM users WHERE email='${biz2.email}'`)).toBe('0');
  }, 120_000);

  test('AC2: first enrichment run populates the seeded business', async () => {
    const { status, body } = await apiJson('/api/admin/enrichment', {
      method: 'POST',
      body: { business_ids: [biz2.businessId] },
      token: admin.accessToken,
    });

    expect(status, `first enrich endpoint: ${JSON.stringify(body).slice(0, 500)}`).toBe(200);
    expect(body.success).toBe(true);
    const report = body.data.report;
    expect(report.summary).toEqual({ total: 1, enriched: 1, skipped: 0, failed: 0 });
    const entry = report.businesses.find((b: { id: string }) => b.id === biz2.businessId);
    expect(entry, `business entry missing from report: ${JSON.stringify(report.businesses)}`).toBeDefined();
    expect(entry.error).toBeNull();
    expect([...entry.applied].sort()).toEqual(['description', 'phone', 'website']);
    expect(entry.skipped).toEqual([]);

    const row = psql(
      `SELECT COALESCE(phone, '') || '|' || COALESCE(website, '') || '|' || COALESCE(description, '') || '|' || CASE WHEN rating = 0 AND review_count = 0 THEN 'zeros' ELSE 'changed' END FROM businesses WHERE id='${biz2.businessId}'`
    );
    expect(row).toBe(`${FIXTURE_2_PHONE}|${FIXTURE_2.website}|${FIXTURE_2.content}|zeros`);
  });

  test('AC2: re-running enrichment skips every field and changes no data', async () => {
    // Content fingerprint across every field the pipeline can write, plus
    // updated_at: any write, even a lost-race no-op UPDATE, changes the hash.
    const rowFingerprintSql = `SELECT md5(COALESCE(phone, '') || COALESCE(website, '') || COALESCE(description, '') || COALESCE(rating::text, '') || COALESCE(review_count::text, '') || COALESCE(menu_url, '') || COALESCE(image_url, '') || COALESCE(social_urls::text, '') || COALESCE(updated_at::text, '')) FROM businesses WHERE id='${biz2.businessId}'`;
    const before = psqlReturning(rowFingerprintSql);
    const scrapedBefore = psqlReturning(
      `SELECT md5(name || source || COALESCE(source_id, '')) FROM scraped_businesses WHERE id='${biz2.scrapedId}'`
    );

    const { status, body } = await apiJson('/api/admin/enrichment', {
      method: 'POST',
      body: { business_ids: [biz2.businessId] },
      token: admin.accessToken,
    });

    expect(status, `re-run enrich endpoint: ${JSON.stringify(body).slice(0, 500)}`).toBe(200);
    expect(body.success).toBe(true);
    const report = body.data.report;
    // Summary is a per-BUSINESS classification (bw-scraper api.rs):
    // failed = entry.error, skipped = entry.reason (e.g. "no enrichment
    // source"), otherwise enriched — even when every field was skipped.
    // Field-level idempotency is asserted below (empty applied, complete
    // skipped) plus the byte-identical row and no-duplicate counts.
    expect(report.summary).toEqual({ total: 1, enriched: 1, skipped: 0, failed: 0 });
    const entry = report.businesses.find((b: { id: string }) => b.id === biz2.businessId);
    expect(entry, `business entry missing from report: ${JSON.stringify(report.businesses)}`).toBeDefined();
    expect(entry.error).toBeNull();
    // Idempotency contract: nothing applied, every field the fixture
    // provides is reported as skipped.
    expect(entry.applied).toEqual([]);
    expect([...entry.skipped].sort()).toEqual(['description', 'phone', 'website']);

    // Ground truth: the row is byte-identical and nothing was duplicated.
    const after = psqlReturning(rowFingerprintSql);
    expect(after, `business row changed: before=${before}, after=${after}`).toBe(before);
    expect(psqlReturning(`SELECT md5(name || source || COALESCE(source_id, '')) FROM scraped_businesses WHERE id='${biz2.scrapedId}'`)).toBe(scrapedBefore);
    expect(psql(`SELECT count(*) FROM businesses WHERE name='${biz2.name}'`)).toBe('1');
    expect(psql(`SELECT count(*) FROM scraped_businesses WHERE name='${biz2.name}'`)).toBe('1');
  });

  test('AC2: directory and detail pages render enriched values without duplication', async ({ page }) => {
    await page.goto(`${BASE_URL}/directory`);
    const card = page.getByRole('link', { name: biz2.name });
    await expect(card).toBeVisible({ timeout: 30_000 });
    await page.locator('input[aria-label="Search businesses"]').fill(biz2.name);

    // Card content rendered exactly once.
    await expect(card.getByText(FIXTURE_2.content, { exact: true })).toHaveCount(1, { timeout: 15_000 });
    await expect(card.getByRole('img', { name: 'Rating: 0 out of 5 stars' })).toHaveCount(1);
    await expect(card.getByText('(0)', { exact: true })).toHaveCount(1);

    await page.goto(`${BASE_URL}/business/${biz2.businessId}`);
    // Detail content rendered exactly once.
    await expect(page.getByText(FIXTURE_2.content, { exact: true })).toHaveCount(1, { timeout: 15_000 });
    await expect(page.locator(`a[href="tel:${FIXTURE_2_PHONE}"]`)).toHaveCount(1);
    await expect(page.locator(`a[href="${FIXTURE_2.website}"]`)).toHaveCount(1);
    await expect(page.getByText('0 reviews on Google', { exact: true })).toHaveCount(1);
  });
});

test.describe('AC3: partial-failure isolation', () => {
  // Two businesses, one enrichment run: one whose SearXNG lookup succeeds
  // and one whose lookup fails (the fixture answers 500 for the "IsoFail"
  // marker in the query) — isolation must hold. Both source_ids are
  // Google-shaped so both pass the eligibility gate; only the SearXNG
  // lookup differs.
  const AC3_FIX_SOURCE_ID = 'http://maps.google.e2e-fixture-b:9977/maps/preview/place?cid=e2e0082b';
  const AC3_DEAD_SOURCE_ID = 'http://maps.google.e2e-fixture-dead:9977/maps/preview/place?cid=e2e0082c';

  // Pre-existing data on the failing business: gives the "existing data is
  // unchanged" clause something to verify.
  const DEAD_PRESET = {
    phone: '+15550140021',
    website: 'https://ac3-dead.example',
    description: 'E2E AC3 pre-existing dead-source kitchen',
  };

  let goodBiz: EnrichFixture;
  let badBiz: EnrichFixture;
  let badBefore: string;

  beforeAll(async () => {
    goodBiz = seedEnrichmentBusiness(`Enrich E2E Iso ${RUN_SUFFIX}`, AC3_FIX_SOURCE_ID);
    badBiz = seedEnrichmentBusiness(`Enrich E2E IsoFail ${RUN_SUFFIX}`, AC3_DEAD_SOURCE_ID);
    psql(
      `UPDATE businesses SET phone='${DEAD_PRESET.phone}', website='${DEAD_PRESET.website}', description='${DEAD_PRESET.description}' WHERE id='${badBiz.businessId}'`
    );
  }, 180_000);

  afterAll(async () => {
    // Strict teardown: verified residue-free cleanup for both businesses.
    cleanupEnrichmentBusiness(goodBiz);
    cleanupEnrichmentBusiness(badBiz);
    if (!goodBiz || !badBiz) return;

    for (const b of [goodBiz, badBiz]) {
      expect(psql(`SELECT count(*) FROM businesses WHERE name='${b.name}'`), `businesses residue for ${b.name}`).toBe('0');
      expect(psql(`SELECT count(*) FROM scraped_businesses WHERE name='${b.name}'`), `scraped residue for ${b.name}`).toBe('0');
    }
    expect(psql(`SELECT count(*) FROM scrape_jobs WHERE id='${goodBiz.jobId}'`)).toBe('0');
    expect(psql(`SELECT count(*) FROM scrape_jobs WHERE id='${badBiz.jobId}'`)).toBe('0');
    expect(psql(`SELECT count(*) FROM users WHERE email='${goodBiz.email}'`)).toBe('0');
    expect(psql(`SELECT count(*) FROM users WHERE email='${badBiz.email}'`)).toBe('0');
  }, 120_000);

  test('AC3: one run over a successful + a failing lookup enriches the good one and reports an error for the failing one', async () => {
    // Content fingerprint of the failing row (incl. updated_at) taken BEFORE
    // the run — any write, even a lost-race no-op UPDATE, changes the hash.
    const badFpSql = `SELECT md5(COALESCE(phone, '') || COALESCE(website, '') || COALESCE(description, '') || COALESCE(rating::text, '') || COALESCE(review_count::text, '') || COALESCE(menu_url, '') || COALESCE(image_url, '') || COALESCE(social_urls::text, '') || COALESCE(updated_at::text, '')) FROM businesses WHERE id='${badBiz.businessId}'`;
    badBefore = psqlReturning(badFpSql);

    const { status, body } = await apiJson('/api/admin/enrichment', {
      method: 'POST',
      body: { business_ids: [goodBiz.businessId, badBiz.businessId] },
      token: admin.accessToken,
    });

    expect(status, `enrich endpoint: ${JSON.stringify(body).slice(0, 500)}`).toBe(200);
    expect(body.success).toBe(true);
    const report = body.data.report;
    expect(report.summary).toEqual({ total: 2, enriched: 1, skipped: 0, failed: 1 });

    const good = report.businesses.find((b: { id: string }) => b.id === goodBiz.businessId);
    expect(good, `valid business entry missing: ${JSON.stringify(report.businesses)}`).toBeDefined();
    expect(good.error).toBeNull();
    expect([...good.applied].sort()).toEqual(['description', 'phone', 'website']);
    expect(good.skipped).toEqual([]);

    const bad = report.businesses.find((b: { id: string }) => b.id === badBiz.businessId);
    expect(bad, `failing business entry missing: ${JSON.stringify(report.businesses)}`).toBeDefined();
    expect(bad.error, 'failing business must be reported with an error').not.toBeNull();
    expect(bad.error).toContain('searxng lookup failed');
    expect(bad.applied, 'no field may apply when the lookup fails').toEqual([]);
    expect(bad.skipped).toEqual([]);
  });

  test('AC3: failing business data is byte-identical and good business holds fixture values (psql ground truth)', () => {
    const badFpSql = `SELECT md5(COALESCE(phone, '') || COALESCE(website, '') || COALESCE(description, '') || COALESCE(rating::text, '') || COALESCE(review_count::text, '') || COALESCE(menu_url, '') || COALESCE(image_url, '') || COALESCE(social_urls::text, '') || COALESCE(updated_at::text, '')) FROM businesses WHERE id='${badBiz.businessId}'`;
    expect(psqlReturning(badFpSql), `failing row changed: before=${badBefore}`).toBe(badBefore);

    // Pre-set values survive byte-identical; no partial writes or clobbering.
    const badRow = psql(
      `SELECT COALESCE(phone, '') || '|' || COALESCE(website, '') || '|' || COALESCE(description, '') || '|' || CASE WHEN menu_url IS NULL AND image_url IS NULL AND rating = 0 AND review_count = 0 THEN 'untouched' ELSE 'modified' END FROM businesses WHERE id='${badBiz.businessId}'`
    );
    expect(badRow).toBe(`${DEAD_PRESET.phone}|${DEAD_PRESET.website}|${DEAD_PRESET.description}|untouched`);

    const goodRow = psql(
      `SELECT COALESCE(phone, '') || '|' || COALESCE(website, '') || '|' || COALESCE(description, '') || '|' || CASE WHEN rating = 0 AND review_count = 0 THEN 'zeros' ELSE 'changed' END FROM businesses WHERE id='${goodBiz.businessId}'`
    );
    expect(goodRow).toBe(`${FIXTURE_3_PHONE}|${FIXTURE_3.website}|${FIXTURE_3.content}|zeros`);
  });
});
