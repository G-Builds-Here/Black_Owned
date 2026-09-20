import { NextRequest, NextResponse } from 'next/server';
import { resolvers } from '@/lib/graphql/resolvers';
import { businessTypeDefs } from '@/lib/graphql/business-schema';
import {
  verifySessionCookie,
  SESSION_COOKIE_NAME,
  type SessionUser,
} from '@/lib/auth/session-cookie';

/**
 * Per-request resolver context (LOC-0093). Identity comes from the caller's
 * real `bw-session` cookie, verified with the shared session semantics in
 * lib/auth/session-cookie -- never a fabricated header. The shape follows the
 * resolver convention in lib/graphql/resolvers: private resolvers read
 * `context.user.id`, so the route hands them the real claims (survey HIGH
 * finding 1: every resolver used to run unauthenticated).
 */
export interface GraphQLRequestContext {
  user: SessionUser | null;
  headers: { authorization?: string };
}

/**
 * Build the resolver context from request headers. Fails closed: a missing,
 * garbage, or foreignly-signed cookie yields `user: null` (verifySessionCookie
 * never throws). The raw Authorization header is carried through for
 * resolvers that expect the header convention (updateBusiness).
 */
export async function buildGraphQLContext(
  request: NextRequest
): Promise<GraphQLRequestContext> {
  const cookie = request.cookies.get(SESSION_COOKIE_NAME)?.value;
  const user = cookie ? await verifySessionCookie(cookie) : null;
  const authorization = request.headers.get('authorization');
  return {
    user,
    headers: { authorization: authorization ?? undefined },
  };
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { query, variables = {} } = body;

    if (!query) {
      return NextResponse.json(
        { errors: [{ message: 'Query is required' }] },
        { status: 400 }
      );
    }

    // Per-request identity: context is built from this request's headers.
    const context = await buildGraphQLContext(request);

    // Simple GraphQL execution
    const result = await executeGraphQL(query, variables, context);

    return NextResponse.json(result);
  } catch (error) {
    console.error('GraphQL error:', error);
    return NextResponse.json(
      { errors: [{ message: 'Internal server error' }] },
      { status: 500 }
    );
  }
}

export async function GET(request: NextRequest) {
  return NextResponse.json(
    { errors: [{ message: 'POST method required' }] },
    { status: 405 }
  );
}

async function executeGraphQL(
  query: string,
  variables: Record<string, unknown>,
  context: GraphQLRequestContext
) {
  // Simple parser for basic GraphQL queries
  // This is a minimal implementation - for production, use graphql-js

  try {
    // Handle health query
    if (query.includes('health')) {
      return { data: { health: resolvers.Query.health() } };
    }

    // Handle searchBusinesses query
    if (query.includes('searchBusinesses')) {
      const queryArg = query.match(/query:\s*"([^"]+)"/);
      const pageMatch = query.match(/page:\s*(\d+)/);
      const pageSizeMatch = query.match(/pageSize:\s*(\d+)/);

      const result = await resolvers.Query.searchBusinesses(
        undefined,
        {
          query: queryArg ? queryArg[1] : '',
          page: pageMatch ? parseInt(pageMatch[1]) : 1,
          pageSize: pageSizeMatch ? parseInt(pageSizeMatch[1]) : 10,
        }
      );
      return { data: { searchBusinesses: result } };
    }

    // Handle businesses query (all businesses)
    if (query.includes('businesses(') || query.includes('businesses {')) {
      const result = await resolvers.Query.searchBusinesses(undefined, {
        query: '',
        page: 1,
        pageSize: 100,
      });
      // Transform to edges/node format
      return {
        data: {
          businesses: {
            edges: result.businesses.map((b: unknown) => ({
              cursor: 'cursor',
              node: b,
            })),
            pageInfo: {
              hasNextPage: false,
              endCursor: null,
            },
          },
        },
      };
    }

    // Handle business(id:) query
    // The client sends variables {id}; also accept an inline literal ID.
    if (query.includes('business(')) {
      const inlineId = query.match(/business\s*\(\s*id:\s*"([^"]+)"/);
      const id = (typeof variables.id === 'string' && variables.id) || (inlineId ? inlineId[1] : null);

      if (!id) {
        return { data: null, errors: [{ message: 'business query requires an id' }] };
      }

      const result = await resolvers.Query.business(undefined, { id });
      return { data: { business: result } };
    }

    // Handle register mutation
    const registerMatch = query.match(/register\s*\(\s*email:\s*"([^"]+)"\s*,\s*password:\s*"([^"]+)"\s*,\s*name:\s*"([^"]+)"\s*\)/);
    if (registerMatch) {
      const result = await resolvers.Mutation.register(undefined, {
        email: registerMatch[1],
        password: registerMatch[2],
        name: registerMatch[3],
      });
      return result;
    }

    // Handle createBusiness mutation (private: requires the caller's identity)
    const createMatch = query.match(/createBusiness\s*\(\s*input:\s*\{\s*name:\s*"([^"]+)"\s*,\s*description:\s*"([^"]*)"\s*,\s*categoryId:\s*"([^"]+)"\s*\}\s*\)/);
    if (createMatch) {
      if (!context.user) {
        // Fail closed at the route: the resolver is never consulted without
        // a verified caller. GraphQL error envelope -- the private field's
        // data stays null, nothing leaks.
        return {
          data: { createBusiness: null },
          errors: [
            {
              message: 'Authentication required',
              extensions: { code: 'UNAUTHENTICATED' },
            },
          ],
        };
      }
      const result = await resolvers.Mutation.createBusiness(
        undefined,
        {
          input: {
            name: createMatch[1],
            description: createMatch[2],
            categoryId: createMatch[3],
          },
        },
        context
      );
      return { data: { createBusiness: result } };
    }

    return { data: null, errors: [{ message: 'Query not implemented' }] };
  } catch (error) {
    console.error('GraphQL execution error:', error);
    throw error;
  }
}