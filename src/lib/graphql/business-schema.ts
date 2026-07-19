/**
 * GraphQL schema for Business queries
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

  type Query {
    business(id: String!): Business
  }
`;
