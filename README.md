# Black Owned Frontend

A Next.js 16 frontend redesign celebrating Black ownership and Black American/African history.

## Tech Stack

- **Next.js 16** with App Router, **React 19**, **TypeScript**, **Tailwind CSS 4**
- **Rust workspace** (`bw-types`, `bw-ingestion`, `bw-api`, `bw-scraper`) — background ingestion/scraper workers
- **PostgreSQL** (system of record), **NATS JetStream** (event bus), **ClickHouse** (analytics), **Valkey** (cache + rate-limit state), **MinIO** (image object storage)
- **Playwright** — TypeScript scrapers (Google Maps, Yelp, Facebook) and E2E tests
- **Jest** (unit + integration), **cargo-llvm-cov** (Rust coverage in CI)

## Getting Started

```bash
# Install dependencies
npm install

# Configure + start the backing stack (Postgres, NATS, ClickHouse, Valkey, MinIO)
cp .env.example .env        # first time only
docker compose up -d

# Apply the database schema
npm run migrate

# (Optional) seed test data — credentials documented in the file header
# (DATABASE_URL is set in .env; psql runs on the host against the compose Postgres)
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f db/seed/seed_test_data.sql

# Run development server
npm run dev

# Build for production
npm run build

# Run tests
npm test                    # Jest (unit + integration)
npx playwright test         # E2E (Chromium/Firefox/WebKit)
```

## Design System

This project uses a custom design system inspired by Black heritage:

- **Colors**: Earth tones, African textile patterns, Pan-African colors
- **Typography**: Modern, readable, professional fonts
- **Components**: Consistent Button, Card, Badge, Input components

See `src/lib/design-tokens/DESIGN-TOKENS.md` for full documentation.

## Project Structure

```
.
├── src/                       # Next.js 16 web app (App Router)
│   ├── app/
│   │   ├── api/               # 30 REST API routes (auth, businesses, scrape-jobs,
│   │   │                      #   analytics, chat, admin, directory, owner, …)
│   │   ├── admin/             # Admin console (dashboard, review, scrape, users)
│   │   ├── owner/             # Owner dashboard + 3-step claim wizard
│   │   ├── page.tsx           # Home
│   │   └── …                  # about, analytics, business, chat, directory,
│   │                          #   help, login, register, search, terms
│   ├── components/
│   │   └── ui/                # Reusable UI primitives (Button, Card, Badge,
│   │                          #   Input, Modal, Table, …)
│   ├── services/              # TypeScript Playwright scrapers (Google Maps, Yelp,
│   │                          #   Facebook) + scraper-job-executor + duplicate-detection
│   ├── lib/
│   │   ├── db/                # PostgreSQL data-access repositories
│   │   ├── auth/              # JWT (RS256) issue/verify + middleware
│   │   ├── graphql/           # GraphQL resolvers + client
│   │   ├── nats/ minio/ valkey/ chat/   # Service clients
│   │   └── design-tokens/     # Design tokens + DESIGN-TOKENS.md
│   ├── types/                 # Shared TypeScript types
│   └── qa/                    # AC-level QA test suites (scraper-e2e, fuzzy-match, …)
├── bw-types/  bw-ingestion/
│   bw-api/  bw-scraper/       # Rust workspace: shared types, ingestion workers,
│                              #   API, and scraper worker (SearXNG discovery + ETL)
├── migrations/                # PostgreSQL + ClickHouse schema (numbered, idempotent)
├── db/seed/                   # Test-data seed (real bcrypt password hashes)
├── e2e/                       # Playwright end-to-end suites
├── scripts/                   # migrate-postgres.mjs, provision-minio.sh, provision-nats.sh
├── config/jwt/                # JWT key material
├── docker-compose.yml         # Full stack: app + Postgres, NATS, ClickHouse, Valkey, MinIO
├── Dockerfile                 # bw-scraper worker image
└── .env / .env.example        # Configuration (copy .env.example → .env)
```
