/**
 * GraphQL Client for frontend API calls
 */

function getApiBaseUrl(): string {
  // Same-origin by default: the Next app hosts the resolvers at /api/graphql.
  return process.env.NEXT_PUBLIC_API_URL || '';
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
  verified: boolean;
  createdAt: {
    timestamp: number;
  };
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
        verified
        createdAt {
          timestamp
        }
      }
    }
  `;

  const result = await graphqlQuery<BusinessQueryResponse>(query, { id });
  return result.business;
}
