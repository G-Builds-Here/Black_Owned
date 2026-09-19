/**
 * Login API Route
 *
 * GraphQL mutation endpoint for user login.
 */

import { NextRequest, NextResponse } from "next/server";
import { login } from "@/lib/graphql/login-resolvers";
import { setSessionCookie } from "@/lib/auth/session-cookie";

export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const body = await request.json();
    const { email, password } = body;

    // Validate required fields
    if (!email || !password) {
      return NextResponse.json(
        {
          success: false,
          error: "Missing required fields: email, password",
        },
        { status: 400 }
      );
    }

    // Call resolver
    const result = await login(null, { email, password });

    // `|| !result.user` is a type narrowing only: the resolver's success
    // shape always carries a user. Behavior for every real 401 is unchanged.
    if (!result.success || !result.user) {
      return NextResponse.json(result, { status: 401 });
    }

    // Session cookie rides alongside the token-pair body (LOC-0092);
    // response body stays byte-identical -- the cookie is the server-side
    // half of the session, the guard in src/middleware.ts reads it.
    const response = NextResponse.json(result, { status: 200 });
    await setSessionCookie(response, {
      id: result.user.id,
      role: result.user.role,
    });
    return response;
  } catch (error) {
    console.error("Login error:", error);
    return NextResponse.json(
      {
        success: false,
        error: "Internal server error",
      },
      { status: 500 }
    );
  }
}
