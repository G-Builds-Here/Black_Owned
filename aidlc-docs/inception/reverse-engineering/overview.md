<!--
surveyed_at: 2026-07-31T08:00:33Z
commit: f43142ed0117498d3b05a2409d4893181c7506d0
relevant_paths:
- src/app/**
- src/components/**
- src/lib/**
- bw-api/src/**
summary: Business capabilities and user types documented.
-->

# Overview

## System Purpose

**Black Owned** is a directory platform designed to discover and support Black-owned businesses. The platform connects users with Black entrepreneurs and businesses while celebrating Black American and African cultural heritage through its design aesthetic.

## Primary Users

| User Type | Needs |
|-----------|-------|
| **Consumers** | Search and discover Black-owned businesses by category, location, or name |
| **Business Owners** | List their business, manage their profile, claim ownership, and achieve verified status |
| **Administrators** | Review verification submissions, manage users, and moderate content |

## Core Business Capabilities

### 1. Business Directory
- Browse businesses by category (food-dining, professional-services, retail-fashion, health-wellness, automotive, home-services, entertainment, education, financial-services, other)
- Search businesses with pagination and relevance ranking
- View business details including ratings, reviews, location, and description
- Filter by verification status

### 2. Business Listing & Management
- Submit new business listings
- Update business information (name, description, location, tags)
- Upload business images via MinIO object storage
- Claim ownership of existing business listings

### 3. Verification System
- Submit verification requests with supporting documentation
- Track verification status (unverified, pending, verified)
- Admin review workflow with 48-hour SLA
- Verified badge for approved businesses

### 4. User Authentication
- User registration and login with JWT tokens
- Refresh token rotation stored in Valkey
- Role-based access control (user, admin)
- Token-based API authentication

### 5. Admin Console
- User management (view, search, manage roles)
- Verification request review and approval
- Business listing moderation

## Data Model

```
User ──< Business (owned)
  │
  └── Verification Submissions

Business:
  - id, ownerId, name, description
  - categoryId, verificationStatus
  - location, rating, reviewCount
  - imageUrl, tags, createdAt, updatedAt
```

## Key Features

- **Cultural Design**: Kente cloth patterns and Bogolanfini mud cloth aesthetics
- **Free Basic Listings**: No cost to list a business
- **Optional Premium**: Verified badges and featured placements available
- **Community Focus**: Built to support Black entrepreneurship and community building
