<!--
surveyed_at: 2026-07-31T08:00:33Z
commit: f43142ed0117498d3b05a2409d4893181c7506d0
relevant_paths:
- src/app/api/**
- bw-api/src/graphql/**
summary: 10 REST endpoints, 13 GraphQL operations documented with examples.
-->

# API Documentation

## Overview

The Black Owned platform exposes two API styles:
- **REST** for authentication and user management operations
- **GraphQL** for business domain operations (businesses, reviews, categories)

## REST Endpoints

### Authentication API

| Method | Endpoint | Description | Auth Required |
|--------|----------|-------------|---------------|
| POST | `/api/auth/register` | Register new user account | No |
| POST | `/api/auth/login` | Authenticate and get tokens | No |
| POST | `/api/auth/refresh` | Refresh access token | Yes (refresh token) |

#### POST /api/auth/register

**Request Body:**
```json
{
  "email": "string (required, valid email format)",
  "password": "string (required, min 8 chars, alphanumeric)",
  "name": "string (required)"
}
```

**Success Response (200):**
```json
{
  "success": true,
  "user": {
    "id": "uuid",
    "email": "string",
    "name": "string",
    "createdAt": "ISO8601"
  },
  "tokens": {
    "accessToken": "JWT",
    "refreshToken": "JWT"
  }
}
```

**Error Response (400):**
```json
{
  "success": false,
  "error": "Invalid email format" | "Password must be at least 8 characters" | "Email already registered"
}
```

---

#### POST /api/auth/login

**Request Body:**
```json
{
  "email": "string (required)",
  "password": "string (required)"
}
```

**Success Response (200):**
```json
{
  "success": true,
  "user": {
    "id": "uuid",
    "email": "string",
    "name": "string",
    "createdAt": "ISO8601"
  },
  "tokens": {
    "accessToken": "JWT",
    "refreshToken": "JWT"
  }
}
```

**Error Response (401):**
```json
{
  "success": false,
  "error": "Invalid credentials"
}
```

---

#### POST /api/auth/refresh

**Headers:**
```
Authorization: Bearer <refresh_token>
```

**Success Response (200):**
```json
{
  "success": true,
  "tokens": {
    "accessToken": "JWT",
    "refreshToken": "JWT"
  }
}
```

**Error Response (401):**
```json
{
  "success": false,
  "error": "Invalid or expired refresh token"
}
```

---

### User Management API

| Method | Endpoint | Description | Auth Required |
|--------|----------|-------------|---------------|
| GET | `/api/users` | List users with pagination | Yes (admin) |
| PATCH | `/api/users/role` | Update user role | Yes (admin) |
| PATCH | `/api/users/status` | Update user status | Yes (admin) |

#### GET /api/users

**Query Parameters:**
- `page` (integer, default: 1): Page number
- `pageSize` (integer, default: 20, max: 100): Items per page
- `search` (string, optional): Email search filter

**Success Response (200):**
```json
{
  "success": true,
  "data": {
    "users": [
      {
        "id": "uuid",
        "email": "string",
        "displayName": "string",
        "role": "user" | "business_owner" | "admin" | "super_admin" | "moderator",
        "status": "active" | "inactive" | "suspended",
        "createdAt": "ISO8601"
      }
    ],
    "pagination": {
      "page": 1,
      "pageSize": 20,
      "total": 100,
      "totalPages": 5
    }
  }
}
```

---

#### PATCH /api/users/role

**Request Body:**
```json
{
  "userId": "uuid (required)",
  "role": "user" | "business_owner" | "admin" | "super_admin" | "moderator" (required)
}
```

**Success Response (200):**
```json
{
  "success": true,
  "data": {
    "id": "uuid",
    "email": "string",
    "role": "string",
    "status": "string"
  },
  "message": "Role updated successfully"
}
```

**Error Response (400):**
```json
{
  "success": false,
  "error": "userId and role are required" | "Invalid role. Must be one of: user, business_owner, admin"
}
```

---

#### PATCH /api/users/status

**Request Body:**
```json
{
  "userId": "uuid (required)",
  "status": "active" | "inactive" | "suspended" (required)
}
```

**Success Response (200):**
```json
{
  "success": true,
  "data": {
    "id": "uuid",
    "email": "string",
    "role": "string",
    "status": "string"
  },
  "message": "Status updated successfully"
}
```

---

## GraphQL API

### Endpoint

`POST /api/graphql`

### Authentication

Include JWT access token in headers:
```
Authorization: Bearer <access_token>
```

### Schema Overview

#### Queries

| Field | Description | Arguments |
|-------|-------------|-----------|
| `health` | Health check endpoint | None |
| `business` | Get single business by ID | `id: String!` |
| `businesses` | List businesses with pagination | `first: Int`, `after: String` |
| `reviews` | Get reviews for a business | `businessId: String!` |
| `categories` | List all categories | None |
| `search` | Search businesses by name | `query: String!` |
| `searchBusinesses` | Search with pagination and facets | `input: SearchBusinessesInput!` |

#### Mutations

| Field | Description | Arguments |
|-------|-------------|-----------|
| `login` | Authenticate user | `input: LoginInput!` |
| `register` | Register new user | `input: RegisterInput!` |
| `createBusiness` | Create new business | `input: CreateBusinessInput!` |
| `updateBusiness` | Update business (owner only) | `input: UpdateBusinessInput!` |
| `submitReview` | Submit business review | `businessId: String!, userId: String!, rating: Int!, comment: String!` |
| `deleteReview` | Delete a review | `id: String!` |
| `submitVerification` | Submit verification documents | `input: SubmitVerificationInput!` |

---

### Type Definitions

#### Business Types

```graphql
type Business {
  id: ID!
  name: String!
  categoryId: String!
  verified: Boolean!
  createdAt: DateTimeUtc!
  description: String
  location: String
  rating: Float
  reviewCount: Int
  imageUrl: String
  tags: [String!]
}

type DateTimeUtc {
  timestamp: Int!
}

type SearchBusinessesResult {
  businesses: [Business!]!
  total: Int!
  page: Int!
  pageSize: Int!
  totalPages: Int!
  facets: [CategoryFacet!]!
}

type CategoryFacet {
  category: String!
  count: Int!
}
```

#### Review Types

```graphql
type Review {
  id: ID!
  businessId: String!
  userId: String!
  rating: Int!
  comment: String!
  createdAt: DateTimeUtc!
}

type SubmitReviewResult {
  review: Review!
  business: Business!
}
```

#### Authentication Types

```graphql
type User {
  id: ID!
  email: String!
  name: String!
  createdAt: String!
}

type TokenPair {
  accessToken: String!
  refreshToken: String!
}

type AuthPayload {
  success: Boolean!
  user: User
  tokens: TokenPair
  error: String
}

input LoginInput {
  email: String!
  password: String!
}

input RegisterInput {
  email: String!
  password: String!
  name: String!
}
```

#### Input Types

```graphql
input CreateBusinessInput {
  name: String!
  description: String
  categoryId: String!
}

input UpdateBusinessInput {
  id: ID!
  name: String!
}

input SearchBusinessesInput {
  query: String!
  page: Int
  pageSize: Int
}

input SubmitVerificationInput {
  businessId: String!
  fileNames: [String!]!
}
```

#### Payload Types

```graphql
type CreateBusinessPayload {
  success: Boolean!
  business: Business
  error: String
}

type UpdateBusinessPayload {
  success: Boolean!
  business: Business
  error: String
}

type PresignedUrl {
  fileName: String!
  url: String!
}

type SubmitVerificationPayload {
  success: Boolean!
  presignedUrls: [PresignedUrl!]
  error: String
}
```

---

### Query Examples

#### Health Check
```graphql
query {
  health
}
```

**Response:**
```json
{
  "data": {
    "health": "ok"
  }
}
```

---

#### Get Single Business
```graphql
query {
  business(id: "12345678-1234-1234-1234-123456789abc") {
    id
    name
    description
    verified
    createdAt {
      timestamp
    }
    rating
    reviewCount
  }
}
```

---

#### Search Businesses
```graphql
query {
  searchBusinesses(input: {
    query: "restaurant"
    page: 1
    pageSize: 10
  }) {
    businesses {
      id
      name
      verified
      rating
    }
    total
    totalPages
    facets {
      category
      count
    }
  }
}
```

---

#### List Categories
```graphql
query {
  categories {
    id
    name
    description
  }
}
```

---

### Mutation Examples

#### Register User
```graphql
mutation {
  register(input: {
    email: "user@example.com"
    password: "securePassword123"
    name: "John Doe"
  }) {
    success
    user {
      id
      email
      name
    }
    tokens {
      accessToken
      refreshToken
    }
    error
  }
}
```

---

#### Login
```graphql
mutation {
  login(input: {
    email: "user@example.com"
    password: "securePassword123"
  }) {
    success
    user {
      id
      email
    }
    tokens {
      accessToken
      refreshToken
    }
    error
  }
}
```

---

#### Create Business
```graphql
mutation {
  createBusiness(input: {
    name: "My Business"
    description: "A great business"
    categoryId: "category-uuid"
  }) {
    success
    business {
      id
      name
      verified
    }
    error
  }
}
```

**Note:** Requires authentication. User ID extracted from JWT token.

---

#### Update Business
```graphql
mutation {
  updateBusiness(input: {
    id: "business-uuid"
    name: "Updated Business Name"
  }) {
    success
    business {
      id
      name
    }
    error
  }
}
```

**Note:** Only the business owner can update. Requires authentication.

---

#### Submit Review
```graphql
mutation {
  submitReview(
    businessId: "business-uuid"
    userId: "user-uuid"
    rating: 5
    comment: "Excellent service!"
  ) {
    review {
      id
      rating
      comment
    }
    business {
      id
      ratingAvg
      reviewCount
    }
  }
}
```

**Note:** Prevents duplicate reviews (one per user per business).

---

#### Submit Verification
```graphql
mutation {
  submitVerification(input: {
    businessId: "business-uuid"
    fileNames: ["license.pdf", "id.jpg"]
  }) {
    success
    presignedUrls {
      fileName
      url
    }
    error
  }
}
```

**Response:** Returns presigned PUT URLs for uploading files directly to MinIO.

---

## Authentication

### JWT Token Structure

Access tokens contain the following claims:

```typescript
interface JwtPayload {
  userId: string;    // User UUID
  email: string;     // User email
  role: UserRole;    // User role
  iat: number;       // Issued at (timestamp)
  exp: number;       // Expiration (timestamp)
}
```

### Role Hierarchy

| Role | Level | Permissions |
|------|-------|-------------|
| `user` | 1 | Basic platform access, create reviews |
| `business_owner` | 2 | Can create and manage own businesses |
| `admin` | 3 | Can manage users, approve businesses |
| `super_admin` | 4 | Full system access |
| `moderator` | 3 | Content moderation capabilities |

### Token Refresh Flow

1. Client receives `accessToken` and `refreshToken` on login/register
2. `accessToken` used for authenticated requests (short-lived)
3. When `accessToken` expires, client calls `/api/auth/refresh` with `refreshToken`
4. Server validates `refreshToken` against Valkey store
5. New token pair returned, old refresh token invalidated

---

## Error Handling

### HTTP Status Codes

| Code | Meaning |
|------|---------|
| 200 | Success |
| 400 | Bad Request (validation error) |
| 401 | Unauthorized (missing/invalid token) |
| 403 | Forbidden (insufficient permissions) |
| 404 | Not Found |
| 500 | Internal Server Error |

### Error Response Format

```json
{
  "success": false,
  "error": "Human-readable error message",
  "code": "ERROR_CODE"  // Optional machine-readable code
}
```

### Common Error Codes

| Code | Meaning |
|------|---------|
| `MISSING_TOKEN` | No authentication token provided |
| `INVALID_TOKEN` | Token is malformed or invalid |
| `EXPIRED_TOKEN` | Token has expired |
| `INSUFFICIENT_ROLE` | User lacks required permissions |
| `INVALID_CREDENTIALS` | Login failed |
| `EMAIL_EXISTS` | Registration failed - email already registered |

---

## Rate Limiting

Rate limiting is applied at the API gateway level:

- Configurable per endpoint
- State stored in Valkey
- Returns 429 Too Many Requests when limit exceeded

---

## CORS Configuration

The API supports CORS for cross-origin requests from the frontend application.
