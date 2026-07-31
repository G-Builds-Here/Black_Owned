<!--
surveyed_at: 2026-07-31T08:00:33Z
commit: f43142ed0117498d3b05a2409d4893181c7506d0
relevant_paths:
- src/app/**
- src/components/**
- src/lib/**
- bw-api/src/**
- bw-ingestion/src/**
summary: 40+ components cataloged across frontend, API, and Rust services.
-->

# Component Inventory

## Core Components

### Frontend Application (Next.js)

| Component | Path | Responsibility |
|-----------|------|----------------|
| **Main Application** | `src/app/` | Next.js app router pages for directory, search, business detail, admin console |
| **UI Components** | `src/components/ui/` | Reusable React components: Card, SearchBar, FilterBar, Tabs, Dropdown, Toast, Navigation |
| **Business Components** | `src/components/` | BusinessCard, BusinessDetail for displaying business information |
| **Admin Components** | `src/components/admin/` | UserManagement table and admin-specific UI |

### API Layer (Next.js API Routes)

| Component | Path | Responsibility |
|-----------|------|----------------|
| **GraphQL Endpoint** | `src/app/api/graphql/route.ts` | GraphQL query/mutation handler with custom parser |
| **Auth Routes** | `src/app/api/auth/` | Login, register, token refresh endpoints |
| **User Management API** | `src/app/api/users/route.ts` | User listing, role/status updates |

### Business Logic (Rust - bw-api)

| Component | Path | Responsibility |
|-----------|------|----------------|
| **GraphQL Schema** | `bw-api/src/graphql/schema.rs` | Async-graphql schema configuration |
| **Query Root** | `bw-api/src/graphql/queries.rs` | Resolvers for businesses, business, reviews, categories, search |
| **Mutation Root** | `bw-api/src/graphql/mutations.rs` | Resolvers for createBusiness, updateBusiness, submitReview, deleteReview |
| **GraphQL Types** | `bw-api/src/graphql/types.rs` | GQLBusiness, GQLReview, GQLUser, GQLCategory, BusinessConnection |
| **Auth Middleware** | `bw-api/src/middleware/auth.rs` | JWT validation, user extraction, AuthLayerBuilder |
| **Rate Limiter** | `bw-api/src/middleware/rate_limiter.rs` | Request rate limiting with RateLimiterStore, RateLimitConfig |
| **Image Routes** | `bw-api/src/routes/images.rs` | Image upload handling, validation, presigned URL generation |

### Background Services (Rust - bw-ingestion)

| Component | Path | Responsibility |
|-----------|------|----------------|
| **Email Service** | `bw-ingestion/src/email_service.rs` | Email template rendering, SMTP configuration, email publishing |
| **Email Consumer** | `bw-ingestion/src/email_consumer.rs` | NATS email message processing, retry handling |
| **Email Publisher** | `bw-ingestion/src/email_publisher.rs` | NATS email message publishing |
| **Image Processor** | `bw-ingestion/src/image_processor.rs` | Image transformation, MinIO integration |
| **Image Publisher** | `bw-ingestion/src/image_publisher.rs` | Image processing job publishing to NATS |
| **Image Worker** | `bw-ingestion/src/image_worker.rs` | Background image processing worker |
| **Cache Service** | `bw-ingestion/src/cache_service.rs` | Cache management, cache entry storage |
| **Cache Invalidator** | `bw-ingestion/src/cache_invalidator.rs` | Cache invalidation on data changes |
| **Chat Consumer** | `bw-ingestion/src/chat_consumer.rs` | NATS chat message processing |
| **Chat Persistence** | `bw-ingestion/src/background_service.rs` | Chat message persistence service |
| **Resend Client** | `bw-ingestion/src/resend_client.rs` | External email API integration |

### Domain Types (Rust - bw-types)

| Component | Path | Responsibility |
|-----------|------|----------------|
| **Business** | `bw-types/src/lib.rs` | Business entity (id, name, description, category_id, owner_id, verified, created_at) |
| **Review** | `bw-types/src/lib.rs` | Review entity (id, business_id, user_id, rating, comment, created_at) |
| **User** | `bw-types/src/lib.rs` | User entity (id, email, display_name, created_at) |
| **Verification** | `bw-types/src/lib.rs` | Verification record (id, business_id, verifier_id, verified_at, method) |
| **Category** | `bw-types/src/lib.rs` | Category entity (id, name, description) |
| **Message** | `bw-types/src/lib.rs` | Message entity for platform messaging |
| **Event** | `bw-types/src/lib.rs` | Event entity for platform events |
| **Email Types** | `bw-types/src/email.rs` | SmtpConfig, NatsEmailPayload, EmailTemplate |

### Data Access (TypeScript)

| Component | Path | Responsibility |
|-----------|------|----------------|
| **Business Repository** | `src/lib/db/business-repository.ts` | Business CRUD operations, find by ID, update |
| **User Repository** | `src/lib/db/user-repository.ts` | User CRUD, findByEmail, create, password hashing |
| **User Management Repository** | `src/lib/db/user-management-repository.ts` | User listing with pagination, role/status updates |
| **Business Schema** | `src/lib/graphql/business-schema.ts` | GraphQL type definitions for Business, Query, Mutation |
| **Resolvers** | `src/lib/graphql/resolvers.ts` | GraphQL resolver implementations for business, search, auth |

### Infrastructure Services

| Component | Path | Responsibility |
|-----------|------|----------------|
| **MinIO Service** | `src/lib/minio/minio-service.ts` | Object storage operations, presigned URL generation |
| **Valkey Client** | `src/lib/valkey/valkey-client.ts` | Redis/Valkey operations, refresh token storage |
| **NATS Client** | `src/lib/nats/client.ts` | NATS connection, message publishing |
| **Cache Invalidator** | `src/lib/nats/cache-invalidator.ts` | Cache invalidation event publishing |

## Component Relationships

### Dependency Graph

```
┌─────────────────────────────────────────────────────────────┐
│                      Next.js Application                     │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────────────┐  │
│  │   Pages     │  │  UI Utils   │  │  API Routes         │  │
│  └─────────────┘  └─────────────┘  └─────────────────────┘  │
└───────────────────────────┬─────────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────────┐
│                    TypeScript Services                       │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────────────┐  │
│  │ Repositories│  │  GraphQL    │  │  Infrastructure     │  │
│  │             │  │  Resolvers  │  │  (MinIO, Valkey)    │  │
│  └─────────────┘  └─────────────┘  └─────────────────────┘  │
└───────────────────────────┬─────────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────────┐
│                      Rust Services                           │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────────────┐  │
│  │  bw-api     │  │bw-ingestion │  │    bw-types         │  │
│  │  (GraphQL)  │  │  (Workers)  │  │    (Types)          │  │
│  └─────────────┘  └─────────────┘  └─────────────────────┘  │
└───────────────────────────┬─────────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────────┐
│                     Infrastructure                           │
│  PostgreSQL  │  Valkey  │  MinIO  │  NATS  │  ClickHouse    │
└─────────────────────────────────────────────────────────────┘
```

### Key Component Interactions

| Source | Target | Relationship | Description |
|--------|--------|--------------|-------------|
| GraphQL Endpoint | Resolvers | Calls | Routes queries/mutations to resolver functions |
| Resolvers | Repositories | Calls | Data access for business/user operations |
| Resolvers | MinIO Service | Calls | Generate presigned URLs for uploads |
| Resolvers | Valkey Client | Calls | Cache read/write, token storage |
| bw-api | bw-types | Depends on | Type definitions for domain entities |
| bw-api | bw-ingestion | Depends on | Shared functionality, email/image processing |
| bw-ingestion | NATS | Publishes/Subscribes | Event-driven communication |
| bw-ingestion | MinIO | Reads/Writes | Image storage and retrieval |
| bw-ingestion | ClickHouse | Writes | Analytics data persistence |
| Cache Invalidator | NATS | Publishes | Cache invalidation events |

## Data Models

### Core Entities

| Entity | Fields | Relationships |
|--------|--------|---------------|
| **Business** | id, name, description, category_id, owner_id, verified, created_at, location | belongs_to Category, owned_by User |
| **Review** | id, business_id, user_id, rating, comment, created_at | belongs_to Business, written_by User |
| **User** | id, email, display_name, created_at, role, status | owns Businesses, writes Reviews |
| **Category** | id, name, description | categorizes Businesses |
| **Verification** | id, business_id, verifier_id, verified_at, method | verifies Business, performed_by User |

### GraphQL Type Mappings

| GraphQL Type | Rust Type | TypeScript Type |
|--------------|-----------|-----------------|
| GQLBusiness | Business | Business |
| GQLReview | Review | - |
| GQLUser | User | User |
| GQLCategory | Category | - |
| BusinessConnection | - | SearchBusinessesResult |
| DateTimeUtc | DateTime<Utc> | { timestamp: number } |
