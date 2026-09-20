# Implementation Blueprint — LOC-0091 · Login & Admin Access

**Epic:** Login. Public browsing stays open to anonymous visitors; a logged-in **admin** gets access to the `/admin` section. Owner directive: keep the epic **SMALL** — minimal story set (4 Must stories, one of them the E2E test story).

Repo: `C:/Users/Merlin/Documents/repos/Black_Owned` · branch base: `chore/survey-relocation` · surveyed artifacts in `.claude/codebase/` (current — no re-survey needed).

---

## 1. Who / What / Why

| | |
|---|---|
| **Who** | Anonymous visitors (public browsing) · admin users (admin section) |
| **What** | Real session login: login issues an httpOnly session cookie, logout clears it, Navigation reflects session state, `/admin/**` is guarded server-side, GraphQL resolvers get real auth context |
| **Why** | Survey finding 8 / anti-pattern 13: auth today is client-side only — no server guard on `/admin`, Navigation doesn't know session state. **HIGH finding 1:** `/api/graphql` runs with a hardcoded `'Bearer token'` — every resolver executes unauthenticated. |

## 2. What already exists (from survey + C3/C3.5)

- `src/app/api/auth/login/route.ts` — returns JSON token pair (RS256 JWT). No cookie set.
- `src/lib/auth/*` — JWT sign/verify helpers exist (RS256).
- `src/components/ui/Navigation.tsx` — static Sign in / Register links, session-blind.
- `src/app/api/graphql/route.ts` — exists but auth-blind (HIGH finding 1).
- `src/middleware.ts` — **does not exist**. `src/app/admin/` pages exist with no server guard.
- No `logout` route. No `bw-session` cookie anywhere.

## 3. Target locations (justified)

| Path | Action | Why this location |
|---|---|---|
| `src/middleware.ts` | NEW | Next.js Edge middleware is the only server-side guard that runs before `/admin` pages render (App Router convention). |
| `src/lib/auth/session-cookie.ts` | NEW | Cookie set/clear/verify helpers belong in `src/lib/auth/` beside existing JWT helpers (existing pattern: auth logic in `lib`). |
| `src/app/api/auth/login/route.ts` | MODIFY | Set the cookie where tokens are already issued — single issuance point. |
| `src/app/api/auth/logout/route.ts` | NEW | Mirrors existing `auth/login` route convention. |
| `src/components/ui/Navigation.tsx` | MODIFY | Session-aware links; logout call. |
| `src/app/api/graphql/route.ts` | MODIFY | Build resolver context from real request headers (fixes HIGH finding 1). |

## 4. Technology Stack Table (source of truth for story ACs)

| Layer | Technology | Version / Flavor | Constraint |
|-------|-----------|------------------|------------|
| Frontend framework | Next.js | App Router | Route handlers + Edge middleware |
| Session token | RS256 JWT in `bw-session` cookie | existing `src/lib/auth` helpers | **httpOnly** (owner decision — no JS-readable token) |
| API | GraphQL via `/api/graphql` | existing async-graphql-style schema | GraphQL only; no new REST data endpoints |
| Admin guard | Next.js middleware | Edge runtime | Verify with Web Crypto-compatible RS256 verify; redirect anonymous/non-admin → `/login` |
| E2E | Playwright | already in repo devDeps | chromium project; storage-state per role |

## 5. Confidence & Risks

**Confidence: Medium.** Main factor: the cookie+middleware pattern is standard, but Edge-runtime JWT verification and the GraphQL context swap touch two sensitive paths at once.

- **Pitfall:** Edge middleware cannot use Node-only crypto — RS256 verify must work in Web Crypto (`jose`-style). Verify early in STORY-001.
- **Pitfall:** Cookie name/flags must match everywhere: `bw-session`, httpOnly, `path=/`, sameSite=lax.
- **Pitfall:** Logout must clear cookie **and** client localStorage session (Navigation clears client state).
- **Pitfall:** GraphQL context must fall back gracefully — anonymous queries that are public today must keep working (public browsing unchanged).
- **Debt in scope:** HIGH finding 1 (hardcoded bearer token) fixed by STORY-003 — included by owner decision. Deferred: admin role management UI, token refresh rotation.

## 6. Story Map (4 × Must — owner directive: small)

| ID | Story | Type | Layer | Component | Draft ACs | Depends on | Seams | Parallel |
|---|---|---|---|---|---|---|---|---|
| STORY-001 | NextAuthMiddleware: guard /admin with httpOnly session cookie | infrastructure | middleware | next-auth-middleware | Anonymous `/admin/**` → redirect `/login`; valid `bw-session` with admin role → page renders; non-admin logged-in → redirect `/`; logout clears cookie | — | routes, config | yes |
| STORY-002 | Navigation: session-aware header + logout | feature | controller | navigation-component | Anonymous sees Sign in/Register; logged-in sees name + Sign out; Sign out clears cookie + client session and lands on `/` | STORY-001 | routes | no |
| STORY-003 | GraphQLRoute: real auth context from request headers | feature | handler | graphql-route | Resolver context carries the caller's real token/claims; anonymous public queries still pass; unauthenticated private query → auth error (not hardcoded token) | — | — | yes |
| STORY-004 | E2E: login journey integration tests | test | test | test-harness | Admin logs in → sees admin section; anonymous hits `/admin` → redirected to login; logout → admin link gone, `/admin` blocked; GraphQL private query as admin succeeds, anonymous rejected | STORY-001, 002, 003 | — | no |

**Contract ACs:** STORY-002 consumes STORY-001's contract: `session-cookie exposes setSessionCookie/clearSessionCookie/verifySessionCookie + cookie name 'bw-session'` — STORY-002's logout AC references the same cookie name. STORY-004 consumes all three stories' observable behavior.

**Testability:** STORY-001/003 — standard unit/integration (no new infra); STORY-002 — component + e2e; STORY-004 — requires Playwright (already in repo) + seeded admin user fixture.

## 7. C4 Delta

- Delta spec: [`delta-spec.json`](delta-spec.json) — 6 components (add), 6 types, 4 C3 + 3 type relationships.
- Rendered delta: [`c4-delta.html`](c4-delta.html) — **user-approved 2026-09-18** (arrows unified with normal views; color contract: magenta NEW / amber MODIFIED / red REMOVED, click-highlights green solid=feeds / dashed=consumes / white=selected).
- Merge into baseline at story-completion time: `$UB c4-apply-delta --original c4-skeleton.json --delta delta-spec.json`.

## 8. Notes for Alfred

- `depends_on` / seams feed the epic ticket's Story Dependencies table — STORY-001 & 003 parallelizable; STORY-002 serialized behind STORY-001 (seam `routes` overlap on middleware matcher).
- STORY-004 is `type: test` — Dupin last-phase.
- Story IDs are Lucius-internal; map to real LOC keys at creation.
