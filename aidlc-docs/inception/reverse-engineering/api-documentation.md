<!--
surveyed_at: 2026-08-27T02:40:39Z
commit: 5a67ed37776c18bc32c9f8e783cb67e23b6c1641
relevant_paths:
- src/app/api
- src/lib/graphql
- bw-scraper/src/api.rs
summary: All HTTP endpoints with auth, request/response shapes, and status codes.
-->

# API Documentation

## Authentication

- **JWT RS256** (asymmetric): access + refresh token pair; keys in `config/jwt`; secret via `JWT_SECRET`. Refresh tokens stored in Valkey (`refresh:{token}`) — revocable, survives restarts.
- **Role middleware**: `createAuthMiddleware(requiredRoles?)` (src/lib/auth/jwt-middleware.ts) — roles: `user` (default) | `business_owner` | `admin`. 401 (missing/invalid/expired token), 403 (insufficient role).
- **Browser chat**: session access token from localStorage, events relayed over NATS WebSocket (ws://localhost:8081).
- bw-scraper HTTP API: **no auth** (internal LAN service on :8080).

## Next.js App — `src/app/api/**`

Auth column: open | any role (user|business_owner|admin) | admin.

| Method | Path | Auth | Request | Response | Status |
|---|---|---|---|---|---|
| GET | /api/health | open | – | {status:'healthy', timestamp} | 200; 405 other methods |
| POST | /api/auth/register | open | {email, password, name} | {success, user, tokens:{accessToken,refreshToken}} | 201; 400; 409 |
| POST | /api/auth/login | open | {email, password} | same envelope | 200; 400; 401 |
| GET | /api/directory | open | ?search&category&location&minRating&sort | {success, data:{businesses[], facets, total}} — loads ALL rows, filters in JS | 200; 400; 500 |
| GET | /api/directory/suggest | open | ?q (≥2 chars) | suggestions[] max 5 | 200; 500 |
| GET | /api/categories | open | – | categories[{id,name}] | 200; 500 |
| GET | /api/featured-businesses | open | ?limit=1..50 | businesses[] | 200; 500 |
| POST | /api/businesses/[id]/view | open | id in path | {success:true} | 201; 400; 404 |
| POST | /api/graphql | open* | {query, variables} — regex mini-parser, NOT graphql-js | GraphQL envelope for health/searchBusinesses/businesses/business/register/createBusiness | 200; 400; 405; 500 |
| POST | /api/reviews | any role | {businessId, rating 1-5, comment ≤2000, locationId?} | review | 201; 400; 404 |
| GET | /api/chat/conversations | any role | – | conversations[+unreadCount] | 200; 500 |
| POST | /api/chat/conversations | any role | {businessId} | conversation (create-or-resume, UNIQUE(user,business)) | 201; 400; 404 |
| GET | /api/chat/conversations/[id]/messages | any role | ?before=<uuid cursor> | messages[] | 200; 400; 404 |
| POST | /api/chat/conversations/[id]/messages | any role | {body ≤2000} | {message, delivered} | 201; 400; 404 |
| POST | /api/chat/conversations/[id]/read | any role | – | {success} | 200; 400; 404 |
| GET | /api/owner/businesses | any role | – | owner's businesses | 200; 500 |
| PATCH | /api/owner/businesses/[id] | any role | {name? ≤255, description?} | business | 200; 400; 404 (404 if not yours) |
| GET | /api/owner/businesses/[id]/views | any role | ?days=1..90 | daily view series | 200; 400; 403; 404 |
| POST | /api/businesses/claim | any role | {name, description?, categoryId, location?, website?} | business (status:unverified) | 201; 400 (x5 validation codes) |
| POST | /api/businesses/[id]/approve | admin | – | business (approved) | 200; 400; 404 |
| POST | /api/businesses/[id]/reject | admin | {reason 1-500} | business (rejected+reason) | 200; 400; 404 |
| POST | /api/businesses/bulk-approve | admin | {businessIds: uuid[]} | {approvedCount, approvedBusinesses} — transactional | 200; 400; 404; 500 |
| POST | /api/businesses/[id]/verification/approve | admin | – | verified | 200; 400; 404 |
| POST | /api/businesses/[id]/verification/reject | admin | {reason} | {success} | 200; 400; 404 |
| POST | /api/reviews/[id]/moderate | admin | {action:'approve'\|'hide'} | {success} — soft-hide via visible flag | 200; 400; 404 |
| GET | /api/pending-businesses | admin | – | pending_review queue (address/rating from source_data JSONB) | 200; 500 |
| POST | /api/pending-businesses/import | admin | {businesses[], jobId?} | {total,succeeded,failed,results,errors} — transactional | 200; 400; 500 |
| POST | /api/pending-businesses/import/job/[jobId] | admin | jobId in path | {total,imported,skipped,duplicates[],results} — fuzzy dedup (DUPLICATE_NAME/ADDRESS_THRESHOLD env) | 200; 400; 404 |
| GET | /api/scrape-jobs | admin | ?status=pending,running | jobs | 200; 400; 500 |
| POST | /api/scrape-jobs | admin | {source, query, location} | job — inserts 'pending' row ONLY; never executed (finding H3) | 201; 400 |
| GET | /api/analytics/scrape-jobs | admin | ?days=1..365 | aggregates (counts, import rate, durations) | 200; 400; 500 |
| GET | /api/analytics/scrape-jobs/recent | admin | ?limit=1..100 | jobs[] | 200; 400; 500 |
| GET | /api/admin/dashboard | admin | ?days=1..365 | counts, jobStats, reviewQueue, recentJobs | 200; 400; 500 |
| GET | /api/users | admin | ?page&pageSize≤100&search | {users, total} | 200; 400; 500 |
| PATCH | /api/users | admin | {userId, role} | user + NATS role_changed publish | 200; 401; 403; 400; 404 |
| PATCH | /api/users/status | admin | – | **dead route** — exported as PATCH_STATUS, not a valid App Router export (finding H2) | 404 |

\* /api/graphql: "open" but `createBusiness` can never authenticate — context hardcodes a fake `Bearer token` (finding H5).

## bw-scraper (Rust, :8080)

| Method | Path | Auth | Request | Response | Status |
|---|---|---|---|---|---|
| GET | /health | none | – | {status:'healthy'} | 200 |
| GET | /health/detailed | none | – | {status, checks[]: Postgres, NATS?, Valkey?, ClickHouse?} | 200; 503 |
| POST | /scrape | none | {query, location?, max_pages? 1-5} | {job_id, status, business_count} | 200; 400; 502 {error} |

## Known Gaps

- User-management UI calls `PATCH /api/users/role` and `PATCH /api/users/status` — neither exists as a reachable route (finding H2).
- No SQL pagination anywhere: `/api/directory` + suggest load the full directory into memory and filter in JS.
