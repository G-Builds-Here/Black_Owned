/**
 * GraphQL schema for Business queries and mutations
 */

export const businessTypeDefs = `#graphql
  type DateTimeUtc {
    timestamp: Int!
  }

  type Business {
    id: ID!
    name: String!
    categoryId: String!
    rating: Float
    reviewCount: Int!
    verified: Boolean!
    createdAt: DateTimeUtc!
  }

  type CreateBusinessPayload {
    success: Boolean!
    business: Business
    error: String
  }

  input CreateBusinessInput {
    name: String!
    description: String
    categoryId: String!
    rating: Float
    reviewCount: Int
  }

  type Query {
    business(id: String!): Business
  }

  type Mutation {
    createBusiness(input: CreateBusinessInput!): CreateBusinessPayload!
  }
`;
