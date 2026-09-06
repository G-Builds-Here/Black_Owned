<!--
surveyed_at: 2026-09-05T19:45:00Z
commit: 1d809d37d45d649844f979496e7d7ea1d47a40ce
relevant_paths:
  - src/app/api
  - src/lib/graphql
  - bw-scraper/src/api.rs
summary: Endpoint contracts for the Next.js REST API, the hand-rolled GraphQL route, and the bw-scraper operator API.
-->

# API Documentation

## REST Endpoints

All Next.js routes live under `src/app/api/**/route.ts`. Auth is a JWT Bearer token
(`Authorization: Bearer <token>`, RS256 with HS256 fallback); "open" means no auth.
Success envelope: `{ success: true, data: ... }`; errors: `{ error: "..." }` or
`{ success: false, errors: [...] }` with a 4xx/5xx status.

| Method | Path | Auth | Request | Response `data` | Statuses |
|--------|------|------|---------|-----------------|----------|
| GET | `/api/health` | open | – | `{ status, timestamp }` | 200; 405 for other verbs |
| POST | `/api/auth/register` | open | `{ email, password, name }` | `{ user, accessToken, refreshToken }` | 201, 400, 409 dup email, 500 |
| POST | `/api/auth/login` | open | `{ email, password }` | `{ user, accessToken, refreshToken }` | 200, 400, 401, 500 |
| GET | `/api/users` | admin | `?page&pageSize&search` | paginated users | 200, 400, 401/403, 500 |
| PATCH | `/api/users` | admin | `{ userId, role }` | updated user; publishes NATS `user.role_changed` | 200, 400, 401/403, 404, 500 |
| GET | `/api/categories` | open | – | `[{ id, name }]` | 200, 500 |
| GET | `/api/directory` | open | `?search&category&location&minRating&sort` | merged directory rows (approved pending + businesses) | 200, 400, 500 |
| GET | `/api/directory/suggest` | open | `?q` | name suggestions | 200, 500 |
| GET | `/api/featured-businesses` | open | `?limit` | featured rows | 200, 500 |
| POST | `/api/reviews` | user/owner/admin | `{ businessId, rating: 1-5, comment: 1-2000, locationId? }` | `{ id, rating, comment, visible, createdAt }` | 201, 400, 404, 500 |
| POST | `/api/reviews/[id]/moderate` | admin | `{ action: hide\|restore }` | updated review (soft-hide `visible` flag) | 200, 400, 404, 500 |
| POST | `/api/businesses/claim` | user/owner/admin | `{ name ≤255, description? ≤2000, categoryId, location?, website? }` | `{ business: { id, name, categoryId, status: "unverified" } }` | 201, 400, 500 |
| POST | `/api/businesses/[id]/view` | open | – (records `business_views`) | `{ ok }` | 201, 400, 404, 500 |
| POST | `/api/businesses/[id]/approve` | admin | – | updated business | 200, 400, 404, 500 |
| POST | `/api/businesses/[id]/reject` | admin | – | updated business | 200, 400, 404, 500 |
| POST | `/api/businesses/[id]/verification/approve` | admin | – ; publishes `verification.approved` | updated business | 200, 400, 404, 409, 500 |
| POST | `/api/businesses/[id]/verification/reject` | admin | `{ reason }` ; publishes `verification.rejected` | updated business | 200, 400, 404, 500 |
| POST | `/api/businesses/bulk-approve` | admin | `{ businessIds: [uuid] }` | batch result | 200, 400, 404, 500 |
| GET | `/api/scrape-jobs` | admin | `?status` (comma list) | job list | 200, 401/403, 500 |
| POST | `/api/scrape-jobs` | admin | `{ source, query, location }` (all required) | created job; in-process TS scrapers then run | 201, 400, 500 |
| GET | `/api/analytics/scrape-jobs` | admin | `?days` | chart series | 200, 401/403, 500 |
| GET | `/api/analytics/scrape-jobs/recent` | admin | `?limit` | recent jobs | 200, 401/403, 500 |
| GET | `/api/admin/dashboard` | admin | `?days` (default 30) | `{ periodDays, counts, totalBusinesses, newBusinesses, ... }` | 200, 400, 401/403, 500 |
| POST | `/api/admin/enrichment` | admin | `{ limit?, business_ids?, dry_run? }` forwarded verbatim to bw-scraper `POST /enrich` (120 s timeout) | worker report `{ businesses[], summary }` | 200, 401/403, 502 `ENRICHMENT_WORKER_UNREACHABLE` / `ENRICHMENT_WORKER_ERROR` |
| GET | `/api/admin/businesses/[id]/content` | admin | – | `{ website, phone, menu_url, image_url, card_image_url, description, social_urls, ... }` | 200, 400, 404, 500 |
| PATCH | `/api/admin/businesses/[id]/content` | admin | partial JSON of editable content fields | updated content | 200, 400, 404, 500 |
| GET | `/api/pending-businesses` | admin | – | pending rows `{ name, address, source, rating, ... }` | 200, 401/403, 500 |
| POST | `/api/pending-businesses/import` | admin | `{ businesses: [...], jobId? }` | `{ total, succeeded, failed, results }` or `{ success: false, errors }` | 200, 400, 500 |
| POST | `/api/pending-businesses/import/job/[jobId]` | admin | path `jobId`; normalizes job's `scraped_businesses` → pending rows | import result | 200, 400, 404, 500 |
| GET | `/api/owner/businesses` | owner | – | own businesses | 200, 401/403, 500 |
| PATCH | `/api/owner/businesses/[id]` | owner (own row) | `{ name?, description? }` (`null` clears description) | updated business | 200, 400, 401/403, 404, 500 |
| GET | `/api/owner/businesses/[id]/views` | owner (own row) | `?days` (clamped 1..90, default 30) | daily view counts, zero-filled | 200, 400, 401/403, 404, 500 |
| GET | `/api/chat/conversations` | user/owner/admin | – | conversations with last-message + unread | 200, 400, 401/403, 404, 500 |
| POST | `/api/chat/conversations` | user/owner/admin | `{ businessId }` (create-or-resume, `UNIQUE(user_id, business_id)`) | `{ conversation }` | 200/201, 400, 401/403, 404, 500 |
| GET | `/api/chat/conversations/[id]/messages` | participant | `?before=<messageId>` cursor | `{ messages[], hasMore }` | 200, 400, 401/403, 404, 500 |
| POST | `/api/chat/conversations/[id]/messages` | participant | `{ body }` | `{ message }`; publishes NATS `chat.message.<cid>` + `chat.notification.<recipientId>` | 201, 400, 401/403, 404, 500 |
| POST | `/api/chat/conversations/[id]/read` | participant | – | `{ ok }` (marks `is_read`) | 200, 400, 401/403, 404, 500 |

## GraphQL Endpoint

`POST /api/graphql` (open, no auth). This is a **hand-rolled regex executor over the
raw query string** — not graphql-js (the declared `graphql` dependency is unused).

Operations actually executable:

| Operation | Shape | Notes |
|-----------|-------|-------|
| `Query.health` | `{ health }` | trivial |
| `Query.searchBusinesses` | `{ searchBusinesses(query, page, pageSize) { ... } }` | reads values from inline literals in the query text; `variables` are mostly ignored |
| `Query.business` | `{ business(id) { ... } }` | inline literal id |
| `Mutation.register` | `{ register(email, password, name) { ... } }` | extracts email/password/name from the raw query string |
| `Mutation.createBusiness` | `{ createBusiness(input: {...}) { ... } }` | **executed with a hardcoded `Bearer token` context** — no real auth |

The schema in `src/lib/graphql/schema.ts` additionally declares `submitVerification`
and `updateBusiness` mutations plus supporting types (`User`, `TokenPair`,
`AuthResponse`, `Business`, `CategoryFacet`, `SearchResults`, `GQLBusiness`,
`PresignedUrl`, `DateTimeUtc`) that the executor does **not** implement.

## bw-scraper Operator API (axum, :8080, no auth)

| Method | Path | Request | Response | Statuses |
|--------|------|---------|----------|----------|
| GET | `/health` | – | `{"status":"healthy"}` | 200 |
| GET | `/health/detailed` | – | `{ status: healthy\|degraded, checks: [{ service, healthy, message }] }` | 200; 503 when Postgres unhealthy |
| POST | `/scrape` | `{ query (required), location?, max_pages? (default 2, clamped 1..5) }` | `{ job_id, status: "completed"\|"failed", business_count }` | 200, 400, 500, 502 |
| POST | `/enrich` | `{ business_ids?: [uuid], limit? (default 50, 1..500), dry_run? }` | `{ businesses: [{ id, name, applied[], skipped[], notes[], reason, locations, error }], summary: { total, enriched, skipped, failed } }` | 200, 400, 500 |
| POST | `/locations` | `{ business_ids?: [uuid], limit? (default 25, 1..500), dry_run? }` | `{ businesses: [...], summary: { total, processed, locations_added, failed } }` | 200, 400, 500 |

bw-api (dormant): its axum binary exposes only `GET /health` → `OK` text; lib
handlers are placeholders returning empty/None. Not in docker-compose.

## Authentication & Authorization

- **JWT RS256** issued by `/api/auth/*`; keys in `config/jwt/`
  (`JWT_PRIVATE_KEY_PATH` / `JWT_PUBLIC_KEY_PATH`), HS256 fallback via `JWT_SECRET`.
- Roles: `user`, `business_owner`, `admin` (enforced per route; admin routes 401/403).
- Owner routes additionally enforce row ownership (`owner_id` check).
- Chat routes enforce participant membership in the conversation.
- **bw-scraper endpoints are unauthenticated** and port 8080 is published in compose.
- **GraphQL route performs no auth at all** (see finding: hardcoded Bearer context).

## Why These Contracts Are Shaped This Way

- **Success envelope + explicit status codes** keep the client UI (React Query/fetch)
  on one error-handling path; admin batch endpoints return per-item results so a
  partial failure is actionable.
- **POST-only state changes** (approve/reject/verify/claim) match the Next.js App
  Router route-handler model and avoid PUT/DELETE handler variants.
- **bw-scraper stays auth-less** because it is an internal worker; the only
  product-facing seam is the admin-gated `/api/admin/enrichment` proxy. `/scrape`
  and `/locations` have no such gate (see anti-patterns).
- **GraphQL is a regex executor** because it was scaffolded quickly before graphql-js
  wiring; the declared `graphql`/`@graphql-tools/schema` deps are unused (tech debt).
