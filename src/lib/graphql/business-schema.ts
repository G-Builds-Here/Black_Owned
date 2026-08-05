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
    phone: String
    potentialDuplicateId: String
  }

  type CreateBusinessPayload {
    success: Boolean!
    business: Business
    error: String
    isPotentialDuplicate: Boolean!
    existingBusinessId: String
  }

  input CreateBusinessInput {
    name: String!
    description: String
    categoryId: String!
    phone: String
  }

  type Query {
    business(id: String!): Business
  }

  type Mutation {
    createBusiness(input: CreateBusinessInput!): CreateBusinessPayload!
  }
`;
