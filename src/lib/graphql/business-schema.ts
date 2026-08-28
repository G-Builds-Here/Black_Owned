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

  type BusinessLocation {
    id: ID!
    label: String
    address: String!
    lat: Float
    lng: Float
    isPrimary: Boolean!
  }

  type Business {
    id: ID!
    name: String!
    categoryId: String!
    category: String
    description: String
    location: String
    phone: String
    website: String
    menuUrl: String
    rating: Float
    reviewCount: Int
    ratingSource: String
    imageUrl: String
    siteReviewCount: Int!
    siteRating: Float
    siteReviews: [Review!]!
    lat: Float
    lng: Float
    tags: [String!]
    source: String
    locations: [BusinessLocation!]!
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

  type Review {
    id: ID!
    rating: Int!
    comment: String!
    reviewerName: String!
    locationLabel: String
    createdAt: DateTimeUtc!
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
