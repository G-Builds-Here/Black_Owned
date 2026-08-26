/**
 * GraphQL Client for frontend API calls
 */

import { SocialUrls } from '../../services/social-discovery';

function getApiBaseUrl(): string {
  // Same-origin by default: the Next app hosts the resolvers at /api/graphql.
  return process.env.NEXT_PUBLIC_API_URL || '';
}

export interface BusinessLocation {
  id: string;
  label?: string | null;
  address: string;
  lat?: number | null;
  lng?: number | null;
  isPrimary: boolean;
}

export interface GraphQLResponse<T> {
  data?: T;
  errors?: Array<{
    message: string;
  }>;
}

export interface Business {
  id: string;
  name: string;
  categoryId: string;
  category?: string | null;
  description?: string | null;
  location?: string | null;
  phone?: string | null;
  website?: string | null;
  rating?: number | null;
  reviewCount?: number | null;
  imageUrl?: string | null;
  lat?: number | null;
  lng?: number | null;
  tags?: string[] | null;
  source?: string | null;
  verified: boolean;
  socialUrls?: SocialUrls | null;
  createdAt: {
    timestamp: number;
  };
  locations: BusinessLocation[];
}

export interface BusinessQueryResponse {
  business: Business | null;
}

/**
 * Execute a GraphQL query against the backend API
 */
export async function graphqlQuery<T>(
  query: string,
  variables: Record<string, unknown>
): Promise<T> {
  const response = await fetch(`${getApiBaseUrl()}/api/graphql`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      query,
      variables,
    }),
  });

  if (!response.ok) {
    throw new Error(`GraphQL request failed: ${response.status} ${response.statusText}`);
  }

  const result: GraphQLResponse<T> = await response.json();

  if (result.errors && result.errors.length > 0) {
    throw new Error(`GraphQL error: ${result.errors[0].message}`);
  }

  if (!result.data) {
    throw new Error('No data returned from GraphQL query');
  }

  return result.data;
}

/**
 * Fetch a business by ID using the GraphQL API
 */
export async function fetchBusinessById(id: string): Promise<Business | null> {
  const query = `
    query GetBusiness($id: String!) {
      business(id: $id) {
        id
        name
        categoryId
        category
        description
        location
        phone
        website
        rating
        reviewCount
        imageUrl
        lat
        lng
        tags
        source
        locations {
          id
          label
          address
          lat
          lng
          isPrimary
        }
        verified
        socialUrls
        createdAt {
          timestamp
        }
      }
    }
  `;

  const result = await graphqlQuery<BusinessQueryResponse>(query, { id });
  return result.business;
}
