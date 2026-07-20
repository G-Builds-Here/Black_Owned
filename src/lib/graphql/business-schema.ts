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
    verified: Boolean!
    createdAt: DateTimeUtc!
  }

<<<<<<< HEAD
  type CreateBusinessPayload {
    success: Boolean!
    business: Business
    error: String
  }

  type UpdateBusinessResponse {
    success: Boolean!
    business: Business
    error: String
  }

  input CreateBusinessInput {
    name: String!
    description: String
    categoryId: String!
  }

  type Query {
    business(id: String!): Business
  }

  type Mutation {
    createBusiness(input: CreateBusinessInput!): CreateBusinessPayload!
    updateBusiness(id: String!, name: String!): UpdateBusinessResponse!
  }
`;
