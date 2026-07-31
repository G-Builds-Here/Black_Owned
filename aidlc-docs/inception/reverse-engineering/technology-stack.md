<!--
surveyed_at: 2026-07-31T08:00:33Z
commit: f43142ed0117498d3b05a2409d4893181c7506d0
relevant_paths:
- package.json
- bw-api/Cargo.toml
- docker-compose.yml
summary: Dual-stack architecture with polyglot persistence documented.
-->

# Technology Stack

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────┐
│                     Frontend (Next.js)                      │
│  React 19 • TypeScript • Tailwind CSS • Apollo Client      │
└─────────────────────────────────────────────────────────────┘
                              │
                              │ GraphQL over HTTP
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                    API Layer (Dual Stack)                   │
│  ┌─────────────────────┐  ┌─────────────────────────────┐  │
│  │  Node.js / Next.js  │  │  Rust (bw-api)             │  │
│  │  - GraphQL Resolvers│  │  - GraphQL Server          │  │
│  │  - Auth Middleware  │  │  - Tower Middleware        │  │
│  └─────────────────────┘  └─────────────────────────────┘  │
└─────────────────────────────────────────────────────────────┘
                    │              │              │
        ┌───────────┴──────┬───────┴──────┬───────┴───────────┐
        ▼                  ▼              ▼                   ▼
   ┌─────────┐       ┌──────────┐   ┌──────────┐    ┌─────────────┐
   │PostgreSQL│       │  Valkey  │   │  NATS    │    │   MinIO     │
   │  15     │       │   7.2    │   │  2.10    │    │  latest     │
   └─────────┘       └──────────┘   └──────────┘    └─────────────┘
   (Primary DB)      (Cache)      (Messaging)     (Object Store)
```

## Frontend Stack

| Technology | Version | Why This Choice |
|------------|---------|-----------------|
| **Next.js** | 15.x | Server-side rendering, API routes, built-in routing, optimal for SEO-focused directory |
| **React** | 19.x | Latest features, component model, hooks ecosystem |
| **TypeScript** | Latest | Type safety, better DX, catches errors at compile time |
| **Tailwind CSS** | Latest | Utility-first styling, rapid development, consistent design system |
| **Apollo Server** | 7.x | GraphQL server implementation, schema-first development |
| **graphql-request** | Latest | Lightweight GraphQL client for server-to-server calls |

## Backend Stack (Rust)

| Technology | Version | Why This Choice |
|------------|---------|-----------------|
| **Axum** | 0.8 | Modern, ergonomic, built on hyper, excellent TypeScript-like ergonomics |
| **Async GraphQL** | 7.x | Type-safe GraphQL implementation for Rust, integrates with serde |
| **SQLx** | 0.7 | Async SQL toolkit with compile-time query validation, PostgreSQL support |
| **Tokio** | 1.x | Industry-standard async runtime for Rust |
| **Tower** | 0.5 | Middleware library, reusable components, HTTP service abstraction |
| **jsonwebtoken** | 9.3 | JWT handling for authentication |

## Database Layer

| Technology | Version | Why This Choice |
|------------|---------|-----------------|
| **PostgreSQL** | 15 | Relational data, ACID compliance, JSONB support, UUID native types |
| **Valkey** | 7.2 | Redis fork (after Redis became SSPL), caching, session storage, token rotation |
| **ClickHouse** | 23.8 | Analytics, aggregations, business metrics dashboards |

## Infrastructure

| Technology | Version | Why This Choice |
|------------|---------|-----------------|
| **MinIO** | latest | S3-compatible object storage, self-hosted, business images storage |
| **NATS** | 2.10 | Lightweight messaging, pub/sub for async workflows, cache invalidation |
| **Docker** | - | Containerized development, consistent environments |

## Testing Stack

| Technology | Version | Why This Choice |
|------------|---------|-----------------|
| **Playwright** | Latest | E2E testing, cross-browser, reliable |
| **Jest** | Latest | Unit testing, React component testing |
| **Vitest** | Latest | Fast unit testing, Vite-native, TypeScript-first |
| **Testcontainers** | Latest | Integration tests with real dependencies (PostgreSQL, NATS) |

## Why This Stack?

### 1. **Dual Backend Strategy**
The project uses both Node.js (Next.js API routes) and Rust (bw-api). This allows:
- Gradual migration from Node to Rust for performance-critical paths
- Rust for memory safety and concurrency guarantees
- Node.js for rapid iteration on business logic

### 2. **GraphQL-First API**
GraphQL provides:
- Strongly typed API contracts
- Reduced over-fetching of data
- Single endpoint for all data needs
- Frontend-driven data requirements

### 3. **Polyglot Persistence**
- **PostgreSQL**: Transactional data (users, businesses, verifications)
- **Valkey**: High-speed caching, session management
- **ClickHouse**: Analytics and reporting
- **MinIO**: Binary assets (business images)

### 4. **Event-Driven Architecture**
NATS enables:
- Decoupled services
- Cache invalidation events
- Async processing of verification workflows
- Future microservices expansion

### 5. **Modern Frontend**
Next.js + React 19 + TypeScript provides:
- SEO-friendly SSR for directory pages
- Type safety across full stack
- Component reusability
- Fast development iteration
