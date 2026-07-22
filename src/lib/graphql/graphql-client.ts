/**
 * GraphQL Client for frontend API calls
 */

function getApiBaseUrl(): string {
  return process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8080';
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
  description: string | null;
  categoryId: string;
  ownerId: string;
  verified: boolean;
  createdAt: {
    timestamp: number;
  };
}

export interface BusinessQueryResponse {
  business: Business | null;
}

export interface UpdateBusinessMutationResponse {
  updateBusiness: {
    success: boolean;
    business: Business | null;
    error: string | null;
  };
}

/**
 * Execute a GraphQL query against the backend API
 */
export async function graphqlQuery<T>(
  query: string,
  variables: Record<string, unknown>
): Promise<T> {
  const response = await fetch(`${getApiBaseUrl()}/graphql`, {
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
        description
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

/**
 * Update a business using the GraphQL API
 */
export async function updateBusiness(
  id: string,
  updates: { name?: string; description?: string; categoryId?: string }
): Promise<UpdateBusinessMutationResponse["updateBusiness"]> {
  const query = `
    mutation UpdateBusiness($input: UpdateBusinessInput!) {
      updateBusiness(input: $input) {
        success
        business {
          id
          name
          description
          categoryId
          ownerId
          verified
          createdAt {
            timestamp
          }
        }
        error
      }
    }
  `;

  const result = await graphqlQuery<UpdateBusinessMutationResponse>(query, {
    input: { id, ...updates },
  });
  return result.updateBusiness;
}
