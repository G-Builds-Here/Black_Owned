/**
 * LOC-0101 — E2E: scoring + queue integration tests (epic LOC-0097 gate)
 *
 * End-to-end proof that the quality scorer, the score endpoint (LOC-0099),
 * and the quality-ordered pending queue (LOC-0100) work together: score via
 * real HTTP, queue ordered weakest-first from real seeded pending rows in the
 * live Postgres, and the prioritized read path persists nothing.
 *
 * MOCK-FREE BY RULE: every request is a real fetch against the running app
 * (Playwright `webServer`), every row is real DB state via psql, and the
 * admin session is server-minted (role promoted in DB, then a fresh login so
 * the JWT carries it — the pattern established in admin-console.spec.ts).
 *
 * Scoring reality this suite grades (Dupin ruling, settled from LOC-0098):
 * the pending-import adapter maps only sourceData.phone (15) and
 * .website (20), so the max a pending row can earn is 35 — the ticket's
 * "C scores 50" literal is unreachable and the AC is graded on the
 * OBSERVABLE ORDER A, B, C instead. B and C tie at 35, so their created_at
 * values are staggered and the tie-break (oldest-first) makes the expected
 * order deterministic: flagged [A, B, C]; the repository's default queue
 * order is created_at DESC (pending-import-business-repository.ts), so the
 * unflagged read is the exact reverse [C, B, A].
 */

import { test, expect, beforeAll, afterAll } from '@playwright/test';
import {
  BASE_URL,
  type E2ESession,
  E2E_PASSWORD,
  RUN_SUFFIX,
  apiJson,
  cleanupPendingRows,
  firstCategoryUuid,
  loginUser,
  newSession,
  promoteAdmin,
  psql,
  warmRoutes,
} from './e2e-utils';
import crypto from 'node:crypto';

test.describe.configure({ mode: 'serial', timeout: 120_000 });

let admin: E2ESession;
let rowsBeforeAnyPriorityReads: string[];

// Seeded fixture rows (names carry RUN_SUFFIX so a crashed run's leftovers
// stay identifiable; ids are client-generated for exact post-run cleanup).
const ids = { a: '', b: '', c: '' };
const seededIdList = () => [ids.a, ids.b, ids.c];
const names = {
  a: `E2E LQ Sparse A ${RUN_SUFFIX}`,
  b: `E2E LQ Phone B ${RUN_SUFFIX}`,
  c: `E2E LQ Social C ${RUN_SUFFIX}`,
};

/** Canonical 100-point payload: every signal at full weight. */
const COMPLETE_PAYLOAD = {
  name: `E2E LQ Complete ${RUN_SUFFIX}`,
  phone: '+1-555-0100',
  website: 'https://e2e-quality.example.com',
  socials: ['https://instagram.com/e2e-quality'],
  photos: [
    'https://cdn.example.com/e2e-lq-1.jpg',
    'https://cdn.example.com/e2e-lq-2.jpg',
    'https://cdn.example.com/e2e-lq-3.jpg',
  ],
  openingHours: { monday: { open: '09:00', close: '17:00' } },
};

/**
 * Canonical byte-text of the seeded pending rows. Every column of
 * pending_import_businesses is included — including updated_at, so any
 * write the read path might attempt (touch, status change, re-sort
 * persistence) shows up here. ORDER BY id keeps the text itself stable.
 */
function snapshotSeededPendingRows(): string[] {
  const out = psql(
    `SELECT id || '|' || name || '|' || COALESCE(description, '') || '|' || category_id || '|' ` +
      `|| status || '|' || source || '|' || COALESCE(source_data::text, '') || '|' ` +
      `|| COALESCE(job_id::text, '') || '|' || COALESCE(rejection_reason, '') || '|' ` +
      `|| created_at::text || '|' || updated_at::text ` +
      `FROM pending_import_businesses WHERE id IN ('${ids.a}', '${ids.b}', '${ids.c}') ORDER BY id`
  );
  return out.split(/\r?\n/).filter((line) => line.length > 0);
}

/** Ids of the seeded rows in the order the queue returned them (others dropped). */
function seededIdsInOrder(items: Array<{ id: string }>): string[] {
  const seeded = new Set(seededIdList());
  return items.map((item) => item.id).filter((id) => seeded.has(id));
}

beforeAll(async () => {
  admin = await newSession('e2e-admin-quality');
  promoteAdmin(admin.email);
  admin = await loginUser(admin.email, E2E_PASSWORD);

  const categoryId = firstCategoryUuid();
  ids.a = crypto.randomUUID();
  ids.b = crypto.randomUUID();
  ids.c = crypto.randomUUID();

  // Realistic source_data shapes from the ticket. A: importer passthrough
  // only; B: scraped phone+website (adapter max 35); C: same plus a socials
  // list the pending adapter does not map (still 35). created_at staggered
  // 3h/2h/1h ago makes the tie-break AND the reversed unflagged order
  // deterministic. jsonb_build_object, not inline JSON — the Windows psql
  // quoting constraint documented in e2e-utils.
  psql(
    `INSERT INTO pending_import_businesses (id, name, category_id, source, source_data, created_at) ` +
      `VALUES ('${ids.a}', '${names.a}', '${categoryId}', 'e2e-test', ` +
      `jsonb_build_object('source', 'Google Maps', 'originalId', 'e2e-lq-a-${RUN_SUFFIX}'), ` +
      `NOW() - INTERVAL '3 hours')`
  );
  psql(
    `INSERT INTO pending_import_businesses (id, name, category_id, source, source_data, created_at) ` +
      `VALUES ('${ids.b}', '${names.b}', '${categoryId}', 'e2e-test', ` +
      `jsonb_build_object('phone', '+1-555-0200', 'website', 'https://e2e-lq-b.example.com'), ` +
      `NOW() - INTERVAL '2 hours')`
  );
  psql(
    `INSERT INTO pending_import_businesses (id, name, category_id, source, source_data, created_at) ` +
      `VALUES ('${ids.c}', '${names.c}', '${categoryId}', 'e2e-test', ` +
      `jsonb_build_object('phone', '+1-555-0300', 'website', 'https://e2e-lq-c.example.com', ` +
      `'socials', jsonb_build_array('https://instagram.com/e2e-lq-c')), ` +
      `NOW() - INTERVAL '1 hour')`
  );

  // AC3's Given, taken literally: snapshot the seeded rows before ANY request
  // this suite makes — the warm-up GET and AC2's flagged reads included — so
  // "persists nothing" is verified from the first read onward, not only from
  // the reads AC3 itself issues.
  rowsBeforeAnyPriorityReads = snapshotSeededPendingRows();

  await warmRoutes(['/api/pending-businesses', '/api/quality-score'], admin);
}, 120_000);

afterAll(() => {
  // Guard against a failed beforeAll: unseeded ids are empty strings (uuid
  // cast error) and `admin` may be undefined when the session never formed.
  cleanupPendingRows(seededIdList().filter(Boolean));
  if (admin?.email) {
    psql(`DELETE FROM users WHERE email='${admin.email}'`);
  }
}, 60_000);

// ---------------------------------------------------------------------------
// AC1 — Scoring works end-to-end over HTTP
// ---------------------------------------------------------------------------

test('AC1 complete payload scores 100 with a five-part breakdown that sums', async () => {
  const res = await apiJson('/api/quality-score', {
    method: 'POST',
    token: admin.accessToken,
    body: COMPLETE_PAYLOAD,
  });

  expect(res.status).toBe(200);
  expect(res.body.success).toBe(true);

  const { score, breakdown } = res.body.data;
  expect(score).toBe(100);

  const parts = Object.keys(breakdown).sort();
  expect(parts).toEqual(['hours', 'phone', 'photos', 'socials', 'website']);
  const sum = Object.values(breakdown).reduce((acc: number, points) => acc + (points as number), 0);
  expect(sum).toBe(100);
});

test('AC1 sparse payload scores low through the same surface', async () => {
  const res = await apiJson('/api/quality-score', {
    method: 'POST',
    token: admin.accessToken,
    body: { name: `E2E LQ Bare ${RUN_SUFFIX}` },
  });

  expect(res.status).toBe(200);
  expect(res.body.success).toBe(true);
  expect(res.body.data.score).toBe(0);
});

test('AC1 bad request never reaches scoring', async () => {
  // Raw fetch: apiJson always stringifies, and a JSON-quoted string would be
  // VALID JSON (hitting the shape-check path, not the parse-failure path the
  // AC names). The unparsable body must go over the wire byte-for-byte.
  const res = await fetch(`${BASE_URL}/api/quality-score`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${admin.accessToken}`,
    },
    body: '{"name": "truncated listing",',
  });

  expect(res.status).toBe(400);
  const body = await res.json();
  expect(body.success).toBe(false);
  expect(typeof body.error).toBe('string');
  expect(body.error.length).toBeGreaterThan(0);
  // "no score present": the success envelope's data payload never appears.
  expect(body.data).toBeUndefined();
  expect(body).not.toHaveProperty('score');
});

// ---------------------------------------------------------------------------
// AC2 — The queue prioritizes seeded real-shape data weakest-first
// ---------------------------------------------------------------------------

test('AC2 the queue prioritizes seeded real-shape data weakest-first', async () => {
  const flagged = await apiJson('/api/pending-businesses?prioritize=quality', {
    token: admin.accessToken,
  });
  const unflagged = await apiJson('/api/pending-businesses', {
    token: admin.accessToken,
  });

  expect(flagged.status).toBe(200);
  expect(flagged.body.success).toBe(true);

  // Weakest-first over the seeded rows: A (score 0) then B then C. B and C
  // tie at the adapter max (35) — the oldest-first tie-break orders them.
  // Live DB may hold other pending rows (approval-workflow seeds some from a
  // parallel spec file), so the check is the seeded rows' relative order.
  expect(seededIdsInOrder(flagged.body.data)).toEqual([ids.a, ids.b, ids.c]);

  // Envelope and item shape identical to the unflagged GET: same envelope
  // keys, and the same row maps out to the same item object.
  expect(Object.keys(flagged.body).sort()).toEqual(Object.keys(unflagged.body).sort());
  for (const id of seededIdList()) {
    const flaggedItem = flagged.body.data.find((item: { id: string }) => item.id === id);
    const unflaggedItem = unflagged.body.data.find((item: { id: string }) => item.id === id);
    expect(flaggedItem).toBeDefined();
    expect(flaggedItem).toEqual(unflaggedItem);
  }
});

test('AC2 same seed, unflagged request, unchanged behavior', async () => {
  const unflagged = await apiJson('/api/pending-businesses', {
    token: admin.accessToken,
  });

  expect(unflagged.status).toBe(200);
  expect(unflagged.body.success).toBe(true);

  // Today's default behavior is the repository order, created_at DESC
  // (findPendingByStatus) — untouched by the absent flag. With the seeded
  // rows 3h/2h/1h old, that is exactly the reverse of the quality order.
  expect(seededIdsInOrder(unflagged.body.data)).toEqual([ids.c, ids.b, ids.a]);
});

// ---------------------------------------------------------------------------
// AC3 — The full prioritized read path persists nothing
// ---------------------------------------------------------------------------

test('AC3 the full prioritized read path persists nothing', async () => {
  // `before` was captured in beforeAll, before the suite's first request —
  // so every read in this file (AC2's flagged GETs included) sits inside the
  // verification window. Scoped to this suite's own rows: a parallel spec
  // file owns other pending rows and may insert/delete those while this
  // test runs.
  const before = rowsBeforeAnyPriorityReads;

  const first = await apiJson('/api/pending-businesses?prioritize=quality', {
    token: admin.accessToken,
  });
  const second = await apiJson('/api/pending-businesses?prioritize=quality', {
    token: admin.accessToken,
  });

  expect(first.status).toBe(200);
  expect(second.status).toBe(200);

  const after = snapshotSeededPendingRows();
  expect(after).toEqual(before);

  // No drift: the second response order equals the first. The full list is
  // compared when both reads saw the same row count; a parallel spec
  // inserting pending rows between the two back-to-back GETs would change
  // membership, not ordering, so the seeded relative order is the
  // race-tolerant core of the assertion.
  const orderOne = first.body.data.map((item: { id: string }) => item.id);
  const orderTwo = second.body.data.map((item: { id: string }) => item.id);
  expect(seededIdsInOrder(second.body.data)).toEqual(seededIdsInOrder(first.body.data));
  if (orderOne.length === orderTwo.length) {
    expect(orderTwo).toEqual(orderOne);
  }
});
