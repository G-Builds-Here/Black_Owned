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

  type Query {
    health: String!
  }

  type Mutation {
    register(email: String!, password: String!, name: String!): AuthResponse!
  }
`;
