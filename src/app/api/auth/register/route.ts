/**
 * Register API Route
 *
 * GraphQL mutation endpoint for user registration.
 */

import { NextRequest, NextResponse } from "next/server";
import { register } from "@/lib/graphql/resolvers";

export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const body = await request.json();
    const { email, password, name } = body;

    // Validate required fields
    if (!email || !password || !name) {
      return NextResponse.json(
        {
          success: false,
          error: "Missing required fields: email, password, name",
        },
        { status: 400 }
      );
    }

    // Call resolver
    const result = await register(null, { email, password, name });

    if (!result.success) {
      const status = result.error === "Email already registered" ? 409 : 400;
      return NextResponse.json(result, { status });
    }

    return NextResponse.json(result, { status: 201 });
  } catch (error) {
    console.error("Register error:", error);
    return NextResponse.json(
      {
        success: false,
        error: "Internal server error",
      },
      { status: 500 }
    );
  }
}
