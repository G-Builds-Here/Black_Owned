/**
 * GraphQL schema for Business queries and mutations
 */

export const healthTypeDefs = `#graphql
  type Query {
    health: String!
  }
`;

export const userTypeDefs = `#graphql
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

  type Mutation {
    login(input: LoginInput!): AuthPayload!
    register(input: RegisterInput!): AuthPayload!
  }
`;

export const businessTypeDefs = `#graphql
  type DateTimeUtc {
    timestamp: Int!
  }

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

  type Query {
    business(id: String!): Business
    searchBusinesses(input: SearchBusinessesInput!): SearchBusinessesResult!
  }

  type Mutation {
    createBusiness(input: CreateBusinessInput!): CreateBusinessPayload!
    updateBusiness(input: UpdateBusinessInput!): UpdateBusinessPayload!
    submitVerification(input: SubmitVerificationInput!): SubmitVerificationPayload!
  }
`;
