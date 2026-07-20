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

  type CategoryFacet {
    category: String!
    count: Int!
  }

  type SearchResults {
    businesses: [Business!]!
    total: Int!
    page: Int!
    pageSize: Int!
    totalPages: Int!
    facets: [CategoryFacet!]!
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

  type PresignedUrl {
    url: String!
    expiresInSeconds: Int!
    objectName: String!
    bucket: String!
  }

  type SubmitVerificationResponse {
    success: Boolean!
    presignedUrls: [PresignedUrl!]
    error: String
  }

  type UpdateBusinessResponse {
    success: Boolean!
    business: Business
    error: String
  }

  type Mutation {
    register(email: String!, password: String!, name: String!): AuthResponse!
    submitVerification(businessId: String!, fileNames: [String!]!): SubmitVerificationResponse!
    updateBusiness(id: String!, name: String!): UpdateBusinessResponse!
  }
`;
