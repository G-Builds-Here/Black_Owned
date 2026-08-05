import { NextRequest, NextResponse } from 'next/server';
import { resolvers } from '@/lib/graphql/resolvers';
import { businessTypeDefs } from '@/lib/graphql/business-schema';

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

    // Simple GraphQL execution
    const result = await executeGraphQL(query, variables);

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

async function executeGraphQL(query: string, variables: Record<string, unknown>) {
  // Simple parser for basic GraphQL queries
  // This is a minimal implementation - for production, use graphql-js

  try {
    // Handle health query
    if (query.includes('health')) {
      return { data: { health: resolvers.Query.health() } };
    }

    // Handle business query
    const businessMatch = query.match(/business\s*\(\s*id:\s*"([^"]+)"\s*\)/);
    if (businessMatch) {
      const id = businessMatch[1];
      const result = await resolvers.Query.business(undefined, { id });
      return { data: { business: result } };
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

    // Handle login mutation
    const loginMatch = query.match(/login\s*\(\s*email:\s*"([^"]+)"\s*,\s*password:\s*"([^"]+)"\s*\)/);
    if (loginMatch) {
      const result = await resolvers.Mutation.login(undefined, {
        email: loginMatch[1],
        password: loginMatch[2],
      });
      return result;
    }

    // Handle createBusiness mutation
    const createMatch = query.match(/createBusiness\s*\(\s*input:\s*\{\s*name:\s*"([^"]+)"\s*,\s*description:\s*"([^"]*)"\s*,\s*categoryId:\s*"([^"]+)"(?:\s*,\s*phone:\s*"([^"]*)")?\s*\}\s*\)/);
    if (createMatch) {
      const result = await resolvers.Mutation.createBusiness(
        undefined,
        {
          input: {
            name: createMatch[1],
            description: createMatch[2],
            categoryId: createMatch[3],
            phone: createMatch[4] || undefined,
          },
        },
        { user: { id: 'test-user' } }
      );
      return result;
    }

    return { data: null, errors: [{ message: 'Query not implemented' }] };
  } catch (error) {
    console.error('GraphQL execution error:', error);
    throw error;
  }
}