/**
 * LOC-0082 — Enrichment pipeline E2E
 *
 * AC1: End-to-end enrichment happy path.
 *   Given a test business with source "google_maps", a share-link source_id,
 *         and empty phone/website/description/rating/review_count
 *   When an admin triggers enrichment via POST /api/admin/enrichment
 *   Then the business row in Postgres has phone, website, description,
 *        rating, and review_count populated from the fixture source
 *   And the directory and business detail pages render the enriched values
 *   And external (Google) review count displays separately from on-site
 *        reviews
 *
 * Fixture strategy (deterministic, no live Google):
 *   bw-scraper fetches `scraped_businesses.source_id` directly, and
 *   `is_google_share_link()` requires the URL to be Google-shaped (host
 *   contains "google."), so this spec:
 *     1. Serves the place-JSON fixture from an in-process Node server on the
 *        host (port 9977).
 *     2. Maps the Google-shaped hostname `maps.google.e2e-fixture` to the
 *        host's IPv4 (resolved via `host.docker.internal`) inside the worker
 *        container's /etc/hosts (`docker exec -u root`).
 *     3. Seeds `source_id = http://maps.google.e2e-fixture:9977/...`.
 *   The worker's single outbound fetch lands on the fixture; the menu pass is
 *   N/A (pre-run website is NULL) and the fixture carries no `photos`, so
 *   there are zero other external calls.
 *
 * AC2 (idempotent re-run) and AC3 (partial-failure isolation) extend this
 * spec via the seed/cleanup helpers below.
 */

import { test, expect, beforeAll, afterAll } from '@playwright/test';
import { execSync } from 'node:child_process';
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
// Fixture source data — deterministic, intentionally distinct from
// bw-scraper/tests/fixtures/place-json/southern_kitchen.json so a pass can
// never come from stale real data. No `photos` (photo pass NotApplicable —
// no external HEAD) and no `social` (social_urls not planned): exactly one
// outbound fetch per enrich call.
// ---------------------------------------------------------------------------

const FIXTURE_PORT = 9977;
const FIXTURE_HOST = 'maps.google.e2e-fixture';
const FIXTURE_SOURCE_ID = `http://${FIXTURE_HOST}:${FIXTURE_PORT}/maps/preview/place?cid=e2e0082`;

const FIXTURE = {
  phone: '+15550119342',
  website: 'https://fixture-e2e.example',
  description: 'E2E enrichment fixture kitchen',
  rating: 4.8,
  review_count: 137,
};
// AC2 (idempotent re-run) fixture — distinct identity (host/port/cid/values)
// so AC1 and AC2 stay independent when run serially in this file. The
// website domain is IANA-reserved (.example never resolves), so the
// post-enrichment menu-discovery pass fetches it once, fails at DNS, and
// writes nothing: deterministic, zero other outbound traffic.
const FIXTURE_2_PORT = 9978;
const FIXTURE_2_HOST = 'maps.google.e2e-fixture-a';
const FIXTURE_2_SOURCE_ID = `http://${FIXTURE_2_HOST}:${FIXTURE_2_PORT}/maps/preview/place?cid=e2e0082a`;

const FIXTURE_2 = {
  phone: '+15550128473',
  website: 'https://ac2-fixture.example',
  description: 'E2E AC2 idempotent fixture kitchen',
  rating: 4.2,
  review_count: 58,
};

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
let fixtureServer2: http.Server | null = null;

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

/**
 * Point the worker container's /etc/hosts at `host` -> `ip`.
 * /etc/hosts is a bind mount (rename fails EBUSY, so sed -i cannot work):
 * filter, cat over the same inode, append.
 * NOTE: the sh -c program is wrapped in double quotes only — execSync on
 * Windows goes through cmd.exe, which treats single quotes as literal and
 * would hand `sh -c` only the word `grep`. Host/IP contain no shell
 * metacharacters (validated upstream), so no inner quoting is needed.
 */
function setWorkerHostsEntry(ip: string, host: string): void {
  execSync(
    `docker exec -u root ${WORKER_CONTAINER} sh -c "grep -v ${host} /etc/hosts > /tmp/hosts.new && cat /tmp/hosts.new > /etc/hosts && echo ${ip} ${host} >> /etc/hosts"`,
    { encoding: 'utf8' }
  );
}

/** Remove a previous entry for `host` from the worker's /etc/hosts. */
function removeWorkerHostsEntry(host: string): void {
  execSync(
    `docker exec -u root ${WORKER_CONTAINER} sh -c "grep -v ${host} /etc/hosts > /tmp/hosts.new && cat /tmp/hosts.new > /etc/hosts"`,
    { encoding: 'utf8' }
  );
}
/**
 * Start an in-process fixture server on `port` that serves `fixture` as
 * JSON on every path. The worker's Google share-link fetch lands here.
 */
function startFixtureServer(port: number, fixture: object): Promise<http.Server> {
  const { promise, resolve, reject } = Promise.withResolvers<http.Server>();
  const body = JSON.stringify(fixture);
  const server = http.createServer((_req, res) => {
    res.writeHead(200, {
      'Content-Type': 'application/json',
      'Content-Length': Buffer.byteLength(body),
    });
    res.end(body);
  });
  server.once('error', reject);
  server.listen(port, '0.0.0.0', () => resolve(server));
  return promise;
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
  setWorkerHostsEntry(workerHostIpv4(), FIXTURE_HOST);
  fixtureServer = await startFixtureServer(FIXTURE_PORT, FIXTURE);
  admin = await newSession('e2e-admin-enrich');
  promoteAdmin(admin.email);
  admin = await loginUser(admin.email, E2E_PASSWORD);
  // warmRoutes returns after the first path warms — one call per route.
  await warmRoutes(['/directory']);
  await warmRoutes([`/business/${biz.businessId}`]);
  await warmRoutes(['/api/admin/enrichment']);
}, 180_000);

afterAll(async () => {
  try {
    removeWorkerHostsEntry(FIXTURE_HOST);
  } catch {
    /* best effort — the container entry is inert without the fixture server */
  }
  cleanupEnrichmentBusiness(biz);
  try {
    psql(`DELETE FROM users WHERE email='${admin.email}'`);
  } catch {
    /* best effort */
  }
  fixtureServer?.close();
}, 120_000);

test('AC1: admin enrichment trigger enriches the seeded business from the fixture source', async () => {
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
  for (const field of ['phone', 'website', 'description', 'rating', 'review_count']) {
    expect(entry.applied, `field ${field} not applied: ${JSON.stringify(entry.applied)}`).toContain(field);
  }
});

test('AC1: postgres row carries the fixture values', () => {
  const row = psql(
    `SELECT COALESCE(phone, '') || '|' || COALESCE(website, '') || '|' || COALESCE(description, '') || '|' || CASE WHEN rating = ${FIXTURE.rating} THEN 'ok' ELSE rating::text END || '|' || review_count FROM businesses WHERE id='${biz.businessId}'`
  );
  expect(row).toBe(`${FIXTURE.phone}|${FIXTURE.website}|${FIXTURE.description}|ok|${FIXTURE.review_count}`);
});

test('AC1: directory API exposes the enriched fields', async () => {
  const { status, body } = await apiJson(`/api/directory?search=${encodeURIComponent(biz.name)}`);
  expect(status).toBe(200);
  expect(body.success).toBe(true);
  const item = (body.data.businesses as Array<Record<string, unknown>>).find(
    (b) => b.name === biz.name
  );
  expect(item, `business ${biz.name} not in directory API: ${JSON.stringify(body.data).slice(0, 500)}`).toBeDefined();
  expect(item!.description).toBe(FIXTURE.description);
  expect(Number(item!.rating)).toBeCloseTo(FIXTURE.rating, 5);
  expect(Number(item!.reviewCount)).toBe(FIXTURE.review_count);
  expect(item!.website).toBe(FIXTURE.website);
});

test('AC1: directory page renders the enriched card', async ({ page }) => {
  await page.goto(`${BASE_URL}/directory`);
  // Hydration guard: wait for the seeded card before interacting.
  const card = page.getByRole('link', { name: biz.name });
  await expect(card).toBeVisible({ timeout: 30_000 });
  await page.locator('input[aria-label="Search businesses"]').fill(biz.name);

  // Card content: fixture description + rating stars + review count, scoped to the card.
  await expect(card.getByText(FIXTURE.description, { exact: true })).toBeVisible({ timeout: 15_000 });
  await expect(card.getByRole('img', { name: `Rating: ${FIXTURE.rating} out of 5 stars` })).toBeVisible();
  await expect(card.getByText(`(${FIXTURE.review_count})`, { exact: true })).toBeVisible();
});

test('AC1: detail page renders enriched values with external and on-site review counts separated', async ({ page }) => {
  await page.goto(`${BASE_URL}/business/${biz.businessId}`);

  // Enriched content from the fixture source.
  await expect(page.getByText(FIXTURE.description, { exact: true })).toBeVisible({ timeout: 15_000 });
  await expect(page.locator(`a[href="tel:${FIXTURE.phone}"]`)).toContainText(FIXTURE.phone);
  await expect(page.locator(`a[href="${FIXTURE.website}"]`)).toBeVisible();

  // External (Google) rating + review count, labelled by source.
  await expect(page.getByText(`${FIXTURE.review_count} reviews on Google`, { exact: true })).toBeVisible();
  // The star span makes the div text "★4.8", so exact-match can't target
  // the value node — substring match, first hit wins.
  await expect(page.getByText(String(FIXTURE.rating)).first()).toBeVisible();

  // On-site review section: zero site reviews, displayed separately from
  // the Google count above.
  await expect(page.getByText('No reviews on this site yet.', { exact: true })).toBeVisible();
});
test.describe('AC2: idempotent re-run', () => {
  let biz2: EnrichFixture;

  beforeAll(async () => {
    biz2 = seedEnrichmentBusiness(`Enrich E2E 2 ${RUN_SUFFIX}`, FIXTURE_2_SOURCE_ID);
    setWorkerHostsEntry(workerHostIpv4(), FIXTURE_2_HOST);
    fixtureServer2 = await startFixtureServer(FIXTURE_2_PORT, FIXTURE_2);
    // /directory is already warmed by the root beforeAll.
    await warmRoutes([`/business/${biz2.businessId}`]);
  }, 180_000);

  afterAll(async () => {
    // Strict teardown: AC2's AC requires verified residue-free cleanup.
    // If seeding itself failed, biz2 is undefined and there is nothing to verify.
    removeWorkerHostsEntry(FIXTURE_2_HOST);
    cleanupEnrichmentBusiness(biz2);
    fixtureServer2?.close();
    if (!biz2) return;

    expect(psql(`SELECT count(*) FROM businesses WHERE name='${biz2.name}'`)).toBe('0');
    expect(psql(`SELECT count(*) FROM scraped_businesses WHERE name='${biz2.name}'`)).toBe('0');
    expect(psql(`SELECT count(*) FROM scrape_jobs WHERE id='${biz2.jobId}'`)).toBe('0');
    expect(psql(`SELECT count(*) FROM users WHERE email='${biz2.email}'`)).toBe('0');
    const hosts = execSync(`docker exec ${WORKER_CONTAINER} cat /etc/hosts`, { encoding: 'utf8' });
    expect(hosts, 'worker /etc/hosts must not keep the AC2 fixture host').not.toContain(FIXTURE_2_HOST);
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
    expect([...entry.applied].sort()).toEqual(['description', 'phone', 'rating', 'review_count', 'website']);
    expect(entry.skipped).toEqual([]);

    const row = psql(
      `SELECT COALESCE(phone, '') || '|' || COALESCE(website, '') || '|' || COALESCE(description, '') || '|' || CASE WHEN rating = ${FIXTURE_2.rating} THEN 'ok' ELSE rating::text END || '|' || review_count FROM businesses WHERE id='${biz2.businessId}'`
    );
    expect(row).toBe(
      `${FIXTURE_2.phone}|${FIXTURE_2.website}|${FIXTURE_2.description}|ok|${FIXTURE_2.review_count}`
    );
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
    expect([...entry.skipped].sort()).toEqual(['description', 'phone', 'rating', 'review_count', 'website']);

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
    await expect(card.getByText(FIXTURE_2.description, { exact: true })).toHaveCount(1, { timeout: 15_000 });
    await expect(card.getByRole('img', { name: `Rating: ${FIXTURE_2.rating} out of 5 stars` })).toHaveCount(1);
    await expect(card.getByText(`(${FIXTURE_2.review_count})`, { exact: true })).toHaveCount(1);

    await page.goto(`${BASE_URL}/business/${biz2.businessId}`);
    // Detail content rendered exactly once.
    await expect(page.getByText(FIXTURE_2.description, { exact: true })).toHaveCount(1, { timeout: 15_000 });
    await expect(page.locator(`a[href="tel:${FIXTURE_2.phone}"]`)).toHaveCount(1);
    await expect(page.locator(`a[href="${FIXTURE_2.website}"]`)).toHaveCount(1);
    await expect(page.getByText(`${FIXTURE_2.review_count} reviews on Google`, { exact: true })).toHaveCount(1);
  });
});
