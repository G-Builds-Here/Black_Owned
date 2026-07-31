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
    description: String
    categoryId: String!
    verified: Boolean!
    createdAt: DateTimeUtc!
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

  input CreateBusinessInput {
    name: String!
    description: String
    categoryId: String!
  }

  input UpdateBusinessInput {
    id: ID!
    name: String
    description: String
    categoryId: String
  }

  type Query {
    business(id: String!): Business
  }

  type Mutation {
    createBusiness(input: CreateBusinessInput!): CreateBusinessPayload!
    updateBusiness(input: UpdateBusinessInput!): UpdateBusinessPayload!
  }
`;
