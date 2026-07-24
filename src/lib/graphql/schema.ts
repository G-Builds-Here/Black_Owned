/**
 * GraphQL Schema Definition
 */

export const typeDefs = `#graphql
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

  type AuthResponse {
    success: Boolean!
    user: User
    tokens: TokenPair
    error: String
  }

  type Business {
    id: ID!
    name: String!
    category: String!
    rating: Float!
    reviewCount: Int!
    location: String!
    isVerified: Boolean!
    imageUrl: String
    description: String
    tags: [String!]
  }

  type SearchResults {
    businesses: [Business!]!
    total: Int!
    page: Int!
    pageSize: Int!
    totalPages: Int!
  }

  type DateTimeUtc {
    timestamp: Int!
  }

  type GQLBusiness {
    id: ID!
    name: String!
    categoryId: String!
    verified: Boolean!
    createdAt: DateTimeUtc!
  }

  type Query {
    health: String!
    searchBusinesses(query: String!, page: Int, pageSize: Int): SearchResults!
    business(id: String!): GQLBusiness
  }

  type PresignedUrlResult {
    url: String!
    expiresInSeconds: Int!
    objectName: String!
    bucket: String!
  }

  type FileValidationError {
    fileName: String!
    error: String!
    code: String!
  }

  type SubmitVerificationResponse {
    success: Boolean!
    presignedUrls: [PresignedUrlResult!]
    error: String
    fileErrors: [FileValidationError!]
  }

  # Verification Queue Types for Admin Review
  type VerificationRecord {
    id: ID!
    businessId: ID!
    businessName: String!
    documentUrls: [String!]!
    status: VerificationStatus!
    submittedAt: String!
    reviewedAt: String
    reviewedBy: String
    rejectionReason: String
  }

  enum VerificationStatus {
    pending
    approved
    rejected
  }

  type ApproveVerificationResponse {
    success: Boolean!
    business: Business
    error: String
  }

  type RejectVerificationResponse {
    success: Boolean!
    error: String
  }

  type VerificationQueueResult {
    pendingCount: Int!
    items: [VerificationRecord!]!
  }

  type Mutation {
    register(email: String!, password: String!, name: String!): AuthResponse!
    submitVerification(businessId: String!, fileNames: [String!]!): SubmitVerificationResponse!

    # Admin verification review mutations
    approveVerification(verificationId: ID!, reviewedBy: String!): ApproveVerificationResponse!
    rejectVerification(verificationId: ID!, reviewedBy: String!, reason: String!): RejectVerificationResponse!
    getPendingVerifications: VerificationQueueResult!
  }
`;
