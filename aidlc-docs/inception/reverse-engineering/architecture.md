<!--
surveyed_at: 2026-07-31T08:00:33Z
commit: f43142ed0117498d3b05a2409d4893181c7506d0
relevant_paths:
- src/app/**
- src/lib/**
- bw-api/src/**
summary: Layered architecture with polyglot persistence and event-driven communication.
-->

# Architecture

## Overview

Black Owned is a full-stack platform connecting Black business owners with consumers. The system uses a polyglot architecture combining Next.js/TypeScript for the frontend and API layer with Rust for high-performance backend services.

## Architectural Patterns

### Layered Architecture

The system follows a layered architecture with clear separation of concerns:

| Layer | Technology | Responsibility |
|-------|------------|----------------|
| Presentation | Next.js 14, React, TypeScript | UI rendering, client-side routing, server components |
| API Gateway | Next.js API Routes | GraphQL endpoint, REST endpoints for auth/users |
| Business Logic | Rust (bw-api, bw-ingestion) | GraphQL resolvers, domain operations, validation |
| Data Access | PostgreSQL (sqlx), Valkey | Database queries, caching |
| Infrastructure | MinIO, NATS, ClickHouse | Object storage, messaging, analytics |

### Key Design Decisions

**1. Polyglot Persistence**
- PostgreSQL: Primary relational store for businesses, users, reviews, categories
- Valkey/Redis: Session storage, caching, token refresh
- MinIO: Object storage for images and verification documents
- ClickHouse: Analytics and reporting (OLAP workloads)
- NATS: Event-driven communication between services

**2. API Strategy**
- GraphQL for business domain operations (queries/mutations for businesses, reviews)
- REST for authentication flows (login, register, token refresh)
- JWT-based authentication with access/refresh token pattern

**3. Service Boundaries**
- `bw-api`: Rust library exposing GraphQL API with async-graphql
- `bw-ingestion`: Rust library for background processing (email, images, caching)
- `bw-types`: Shared type definitions across Rust services
- Next.js application: Frontend SPA + API routes

## Component Layering

```
┌─────────────────────────────────────────────────────────────┐
│                      Presentation Layer                      │
│  Next.js Pages (directory, search, business detail, admin)  │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                      API Gateway Layer                       │
│  /api/graphql  │  /api/auth/*  │  /api/users  │  /api/images│
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                   Business Logic Layer                       │
│  GraphQL Resolvers (Rust)  │  Auth Service  │  MinIO Service│
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                     Data Access Layer                        │
│  Repositories (business, user)  │  Cache Service            │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                    Infrastructure Layer                      │
│  PostgreSQL  │  Valkey  │  MinIO  │  NATS  │  ClickHouse    │
└─────────────────────────────────────────────────────────────┘
```

## Security Architecture

### Authentication Flow
1. User submits credentials to `/api/auth/login`
2. Server validates against PostgreSQL user repository
3. JWT access token (short-lived) + refresh token (long-lived) issued
4. Access token sent in `Authorization: Bearer` header for protected requests
5. Refresh token stored in Valkey for token rotation

### Authorization Model
- Role-based access control (RBAC) with hierarchy:
  - `user` (level 1): Basic platform access
  - `business_owner` (level 2): Can manage own businesses
  - `admin` (level 3): Can manage users, approve businesses
  - `super_admin`: Full system access
  - `moderator`: Content moderation capabilities

### Token Structure
```typescript
interface JwtPayload {
  userId: string;
  email: string;
  role: UserRole;
  iat: number;  // Issued at
  exp: number;  // Expiration
}
```

## Data Flow Patterns

### Business Creation Flow
1. Client calls `createBusiness` GraphQL mutation
2. Auth middleware extracts user ID from JWT
3. Business inserted into PostgreSQL with `owner_id` = authenticated user
4. Business created with `verified: false` status
5. Owner can submit verification documents via MinIO presigned URLs

### Review Submission Flow
1. Client calls `submitReview` mutation with business_id, rating, comment
2. System checks for duplicate review (same user + business)
3. Review inserted into PostgreSQL
4. Rating aggregation recalculated (AVG, COUNT)
5. Returns created review + updated business with rating stats

### Image Upload Flow
1. Client requests presigned URL for image upload
2. Server generates MinIO presigned PUT URL (15-min expiry)
3. Client uploads directly to MinIO
4. Image queued for processing via NATS
5. ImageWorker processes and generates variants

## Infrastructure Topology

```
┌──────────────┐     ┌──────────────┐     ┌──────────────┐
│   Next.js    │────▶│   bw-api     │────▶│  PostgreSQL  │
│   Frontend   │     │  (GraphQL)   │     │   (Primary)  │
└──────────────┘     └──────────────┘     └──────────────┘
       │                    │                    │
       │                    ▼                    │
       │              ┌──────────────┐           │
       └─────────────▶│ bw-ingestion │◀──────────┘
                      │  (Workers)   │
                      └──────────────┘
                           │    │    │
                           ▼    ▼    ▼
                      ┌─────────────────────┐
                      │ MinIO │ NATS │ CH  │
                      └─────────────────────┘
```

## Cross-Cutting Concerns

### Caching Strategy
- Query results cached in Valkey with cache invalidation on mutations
- Cache keys include query parameters for granular invalidation
- Cache invalidator publishes events on data changes

### Rate Limiting
- Request rate limiting at API gateway level
- Configurable limits per endpoint
- Rate limit state stored in Valkey

### Observability
- Structured logging throughout services
- NATS events for audit trail
- ClickHouse for analytics aggregation

## Technology Stack Summary

| Component | Technology | Rationale |
|-----------|------------|-----------|
| Frontend | Next.js 14, React, TypeScript | SSR, app router, type safety |
| API Framework | async-graphql (Rust), Apollo Server | Type-safe schema, performance |
| Database | PostgreSQL (Supabase) | Relational data, ACID compliance |
| Cache | Valkey/Redis | Session storage, query caching |
| Object Storage | MinIO | S3-compatible, self-hosted |
| Messaging | NATS | Lightweight, high-throughput |
| Analytics | ClickHouse | OLAP, fast aggregations |
| Auth | JWT (jsonwebtoken) | Stateless, scalable |
