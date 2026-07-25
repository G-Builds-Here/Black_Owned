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

// Verification Queue Types
export interface VerificationRecord {
  id: string;
  businessId: string;
  businessName: string;
  documentUrls: string[];
  status: 'pending' | 'approved' | 'rejected';
  submittedAt: string;
}

export interface VerificationQueueResult {
  pendingCount: number;
  items: VerificationRecord[];
}

// Moderation Queue Types
export interface ModerationQueueItem {
  id: string;
  businessId: string;
  businessName: string;
  userId: string;
  userName: string;
  rating: number;
  comment: string;
  status: 'pending' | 'approved' | 'hidden';
  createdAt: string;
}

export interface ModerationQueueResult {
  pendingCount: number;
  items: ModerationQueueItem[];
}

// GraphQL Client with moderation and verification mutations
export const graphqlClient = {
  /**
   * Get pending verifications for the admin queue
   */
  async getPendingVerifications(): Promise<VerificationQueueResult> {
    const query = `
      mutation GetPendingVerifications {
        getPendingVerifications {
          pendingCount
          items {
            id
            businessId
            businessName
            documentUrls
            status
            submittedAt
          }
        }
      }
    `;
    const result = await graphqlQuery<{ getPendingVerifications: VerificationQueueResult }>(query, {});
    return result.getPendingVerifications;
  },

  /**
   * Approve a verification submission
   */
  async approveVerification(args: { verificationId: string; reviewedBy: string }): Promise<{ success: boolean; error?: string }> {
    const { verificationId, reviewedBy } = args;
    const query = `
      mutation ApproveVerification($verificationId: ID!, $reviewedBy: String!) {
        approveVerification(verificationId: $verificationId, reviewedBy: $reviewedBy) {
          success
          error
        }
      }
    `;
    const result = await graphqlQuery<{ approveVerification: { success: boolean; error?: string } }>(query, {
      verificationId,
      reviewedBy,
    });
    return result.approveVerification;
  },

  /**
   * Reject a verification submission
   */
  async rejectVerification(args: { verificationId: string; reviewedBy: string; reason: string }): Promise<{ success: boolean; error?: string }> {
    const { verificationId, reviewedBy, reason } = args;
    const query = `
      mutation RejectVerification($verificationId: ID!, $reviewedBy: String!, $reason: String!) {
        rejectVerification(verificationId: $verificationId, reviewedBy: $reviewedBy, reason: $reason) {
          success
          error
        }
      }
    `;
    const result = await graphqlQuery<{ rejectVerification: { success: boolean; error?: string } }>(query, {
      verificationId,
      reviewedBy,
      reason,
    });
    return result.rejectVerification;
  },

  /**
   * Get pending reviews for the moderation queue
   */
  async getPendingReviews(): Promise<ModerationQueueResult> {
    const query = `
      mutation GetPendingReviews {
        getPendingReviews {
          pendingCount
          items {
            id
            businessId
            businessName
            userId
            userName
            rating
            comment
            status
            createdAt
          }
        }
      }
    `;
    const result = await graphqlQuery<{ getPendingReviews: ModerationQueueResult }>(query, {});
    return result.getPendingReviews;
  },

  /**
   * Approve a review submission
   */
  async approveReview(args: { reviewId: string; reviewedBy: string }): Promise<{ success: boolean; error?: string }> {
    const { reviewId, reviewedBy } = args;
    const query = `
      mutation ApproveReview($reviewId: ID!, $reviewedBy: String!) {
        approveReview(reviewId: $reviewId, reviewedBy: $reviewedBy) {
          success
          error
        }
      }
    `;
    const result = await graphqlQuery<{ approveReview: { success: boolean; error?: string } }>(query, {
      reviewId,
      reviewedBy,
    });
    return result.approveReview;
  },

  /**
   * Hide a review with reason
   */
  async hideReview(args: { reviewId: string; reviewedBy: string; reason: string }): Promise<{ success: boolean; error?: string }> {
    const { reviewId, reviewedBy, reason } = args;
    const query = `
      mutation HideReview($reviewId: ID!, $reviewedBy: String!, $reason: String!) {
        hideReview(reviewId: $reviewId, reviewedBy: $reviewedBy, reason: $reason) {
          success
          error
        }
      }
    `;
    const result = await graphqlQuery<{ hideReview: { success: boolean; error?: string } }>(query, {
      reviewId,
      reviewedBy,
      reason,
    });
    return result.hideReview;
  },
};
