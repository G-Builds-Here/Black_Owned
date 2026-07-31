# Black Owned - Survey Findings

**Survey Date:** 2026-07-31 | **Commit:** f43142ed | **Mode:** AIDLC-1

## Executive Summary

Black Owned is a dual-stack platform for discovering and managing Black-owned businesses. Built with Next.js/TypeScript frontend and Rust (bw-api) backend, it implements a GraphQL-first architecture with polyglot persistence (PostgreSQL, Valkey, MinIO, ClickHouse) and event-driven messaging via NATS.

---

## Business Overview

### Core Capabilities

| Capability | Description | User Types |
|------------|-------------|------------|
| Business Directory | Browse, search, and filter Black-owned businesses | All users |
| Business Claiming | Owners can claim and verify their businesses | Business owners |
| Verification Workflow | Document-based verification with admin approval | Business owners, Admins |
| Image Management | Upload and manage business images via MinIO | Business owners, Admins |
| Admin Console | User and business management dashboard | Admins, Super-admins |

### User Types

| Role | Permission Level | Key Capabilities |
|------|------------------|------------------|
| user | Level 1 | Browse directory, view businesses |
| business_owner | Level 2 | Claim businesses, manage listings |
| admin | Level 3 | Review verifications, moderate content |
| super_admin | Level 4 | Full system access, user management |

---

## Architecture Highlights

### Technology Stack

**Frontend:**
- Next.js 14 (App Router) - SEO-optimized SSR for directory pages
- React 18 with TypeScript
- Tailwind CSS for design system (Kente/Bogolanfini cultural patterns)

**Backend:**
- **bw-api** (Rust) - High-performance GraphQL API using async-graphql
- **bw-ingestion** (Rust) - Data processing pipeline
- **bw-types** - Shared type definitions

**Data Layer:**
| System | Purpose | Why Chosen |
|--------|---------|------------|
| PostgreSQL | Primary relational data | ACID compliance, complex queries |
| Valkey | Session/cache layer | Redis fork after SSPL licensing change |
| MinIO | Object storage (images) | S3-compatible, self-hosted |
| ClickHouse | Analytics | High-volume event aggregation |
| NATS | Event messaging | Cache invalidation, async workflows |

### Architectural Patterns

1. **Layered Architecture**
   - Presentation: Next.js pages and components
   - Application: Route handlers, GraphQL resolvers
   - Domain: Business logic, repositories
   - Infrastructure: Database clients, MinIO, NATS

2. **GraphQL-First API**
   - Schema defined in Rust (bw-api/src/graphql/schema.rs)
   - TypeScript resolvers for Node.js fallback
   - Type-safe code generation

3. **Polyglot Persistence**
   - Each data store serves a specific purpose
   - No single point of failure
   - Optimized for specific query patterns

4. **Event-Driven Cache Coherence**
   - NATS events trigger cache invalidation
   - Distributed cache consistency across instances

---

## Component Inventory

### Frontend Components (40+ total)

**Pages:**
- `/` - Home page with featured businesses
- `/directory` - Business listing with filters
- `/search` - Advanced search
- `/business/[id]` - Business detail and claiming
- `/admin` - Admin dashboard
- `/admin/users` - User management

**UI Components:**
- Card, BusinessCard - Display patterns
- Navigation, Tabs, Dropdown - Navigation patterns
- SearchBar, FilterBar - Discovery patterns
- UserTable - Admin data display
- Toast - Feedback patterns

**Backend Services:**
- `business-repository.ts` - Data access layer
- `minio-service.ts` - Object storage operations
- `valkey-client.ts` - Cache operations
- `nats/client.ts`, `cache-invalidator.ts` - Event handling
- `image-service.ts` - Business logic for image management

### Rust Modules

- `bw-api/src/graphql/` - GraphQL schema, queries, mutations, types
- `bw-api/src/routes/` - REST endpoints
- `bw-api/src/middleware/` - Authentication middleware
- `bw-types/` - Shared type definitions

---

## API Surface

### REST Endpoints (10 total)

| Method | Path | Purpose | Auth |
|--------|------|---------|------|
| GET | /api/users | List users | Admin |
| POST | /api/users | Create user | Admin |
| PUT | /api/users/:id | Update user | Admin |
| DELETE | /api/users/:id | Delete user | Super-admin |
| POST | /api/auth/login | User authentication | Public |
| POST | /api/auth/register | User registration | Public |
| GET | /api/images/presigned-url | Image upload URL | Authenticated |
| POST | /api/images/upload | Complete upload | Authenticated |
| GET | /api/businesses/:id/verification-docs | Verification docs | Business owner |
| POST | /api/businesses/:id/claim | Claim business | Business owner |

### GraphQL Operations (13 total)

**Queries:**
- `businesses` - List all businesses with pagination
- `business(id!)` - Single business by ID
- `users` - List users (admin only)
- `me` - Current user profile

**Mutations:**
- `createBusiness` - Create new business listing
- `updateBusiness` - Update business details
- `deleteBusiness` - Remove business
- `claimBusiness` - Claim ownership
- `uploadVerificationDoc` - Submit verification documents
- `approveVerification` - Admin approval
- `updateUser` - Update user details
- `deleteUser` - Delete user account

---

## Test Infrastructure

### Test Types

| Type | Framework | Coverage | Location |
|------|-----------|----------|----------|
| Unit | Jest | Business logic, utilities | `src/**/*.spec.ts` |
| Integration | Vitest | Service layer, API | `src/**/*.test.ts` |
| E2E | Playwright | AC validation, critical paths | `e2e/*.spec.ts` |
| Rust Integration | async-graphql | bw-api GraphQL layer | `bw-api/src/graphql/tests.rs` |

### Test Coverage

- **E2E Tests:** 2 spec files covering AC1-AC3 (Design System, UI Components, Directory) and AC8 (Performance)
- **Rust Tests:** 9 integration tests in bw-api
- **Unit Tests:** Business repository, token refresh, MinIO service

### Known Gaps

- Service layer tests missing for: `business-repository.ts`, `minio-service.ts`, `nats/cache-invalidator.ts`, `valkey-client.ts`
- No coverage thresholds configured
- Playwright webServer disabled in config (requires external environment)

---

## Anti-Patterns Identified

### HIGH Severity

| Finding | Location | Impact | Mitigation |
|---------|----------|--------|------------|
| Hardcoded database credentials | Multiple config files | Security vulnerability, environment coupling | Use environment variables or secret management |

### MEDIUM Severity

| Finding | Location | Impact | Mitigation |
|---------|----------|--------|------------|
| TypeScript config inconsistency | tsconfig.json vs package.json | Build confusion, IDE issues | Standardize on single config source |
| FID measurement inaccuracy | web-vitals.ts | Misleading performance metrics | Use INP as primary metric |
| GraphQL schema recreation overhead | bw-api/src/graphql/schema.rs | Slow cold starts, resource waste | Cache compiled schema |
| Missing service layer tests | Multiple services | Uncovered business logic | Add integration tests |

### LOW Severity

| Finding | Location | Impact | Mitigation |
|---------|----------|--------|------------|
| Missing coverage config | jest.config.ts | Unknown test coverage | Add coverage thresholds |
| Playwright webServer disabled | playwright.config.ts | Manual env required for E2E | Configure testcontainers or mock |
| Missing error handling | Various routes | Poor error feedback | Add centralized error handling |
| Inconsistent naming | Components, functions | Cognitive load | Establish naming conventions |
| Missing integration test matrix | Test suite | Uncovered edge cases | Add matrix testing |

---

## Cross-Cutting Concerns

### Security

- JWT-based authentication with role-based access control
- Role hierarchy: user(1) < business_owner(2) < admin/moderator(3) < super_admin(4)
- Presigned URLs for secure image uploads (15-minute expiry)

### Performance

- Dual backend strategy (Node.js + Rust) enables gradual migration
- Valkey caching reduces database load
- ClickHouse for analytics offloads primary database

### Operational

- NATS event bus for distributed cache coherence
- Container-based deployment (docker-compose.yml)
- Health check endpoints for monitoring

---

## Recommendations

### Immediate (HIGH Priority)

1. **Remove hardcoded credentials** - Move all secrets to environment variables or secret management service
2. **Add coverage thresholds** - Prevent regression in test coverage
3. **Enable Playwright webServer** - Configure testcontainers for automated E2E

### Short-term (MEDIUM Priority)

1. **Standardize TypeScript config** - Resolve tsconfig/package.json inconsistencies
2. **Add service layer tests** - Cover business-repository, minio-service, nats handlers
3. **Schema caching** - Implement GraphQL schema compilation cache

### Long-term (LOW Priority)

1. **Error handling framework** - Centralized error handling with proper HTTP status codes
2. **Naming conventions** - Document and enforce consistent naming patterns
3. **Performance monitoring** - Add APM integration for production monitoring

---

## Change Triggers

| File | Trigger |
|------|---------|
| overview.md | Initial survey - business capabilities documentation |
| technology-stack.md | Initial survey - tech stack analysis |
| architecture.md | Initial survey - architectural pattern extraction |
| component-inventory.md | Initial survey - component catalog |
| api-documentation.md | Initial survey - API surface documentation |
| dependencies.md | Initial survey - dependency analysis |
| test-infrastructure.md | Initial survey - test strategy documentation |
| anti-patterns.md | Initial survey - quality issue identification |
| findings.md | Initial survey - cross-cutting synthesis |
