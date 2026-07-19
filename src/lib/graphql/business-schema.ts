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

  type UpdateBusinessResponse {
    success: Boolean!
    business: Business
    error: String
  }

  type Query {
    business(id: String!): Business
  }

  type Mutation {
    updateBusiness(id: String!, name: String!): UpdateBusinessResponse!
  }
`;
