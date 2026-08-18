/**
 * Login API Route
 *
 * GraphQL mutation endpoint for user login.
 */

import { NextRequest, NextResponse } from "next/server";
import { login } from "@/lib/graphql/login-resolvers";

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

    if (!result.success) {
      return NextResponse.json(result, { status: 401 });
    }

    return NextResponse.json(result, { status: 200 });
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
