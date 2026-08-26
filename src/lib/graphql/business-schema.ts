/**
 * GraphQL schema for Business queries and mutations
 */

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
    rating: Float
    reviewCount: Int
    imageUrl: String
    lat: Float
    lng: Float
    tags: [String!]
    source: String
    locations: [BusinessLocation!]!
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
  }

  type Query {
    business(id: String!): Business
  }

  type Mutation {
    createBusiness(input: CreateBusinessInput!): CreateBusinessPayload!
  }
`;
