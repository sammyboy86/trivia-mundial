import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { createSessionToken } from "@/lib/session";
import { SESSION_COOKIE_NAME } from "@/lib/constants";

// TODO(security): Consider implementing rate limiting on this endpoint
// TODO(security): Consider adding MFA for admin access
// TODO(security): Consider using OAuth provider instead of password-based auth

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { username, password } = body;

    // Input validation
    if (!username || !password || typeof username !== "string" || typeof password !== "string") {
      return NextResponse.json(
        { error: "Invalid credentials" },
        { status: 401 }
      );
    }

    // Validate against server-side credentials
    const expectedUsername = process.env.ADMIN_USERNAME;
    const expectedPasswordHash = process.env.ADMIN_PASSWORD_HASH;

    if (!expectedUsername || !expectedPasswordHash) {
      console.error("Admin credentials not configured in environment");
      return NextResponse.json(
        { error: "Server configuration error" },
        { status: 500 }
      );
    }

    // Check username (constant-time comparison would be ideal, but bcrypt compare handles timing for password)
    if (username !== expectedUsername) {
      // Still run bcrypt.compare to prevent timing attacks revealing valid usernames
      await bcrypt.compare(password, "$2a$12$invalidsaltinvalidsalteeeeeeeeeeeeeeeeeeeeeee");
      return NextResponse.json(
        { error: "Invalid credentials" },
        { status: 401 }
      );
    }

    // Verify password
    const passwordValid = await bcrypt.compare(password, expectedPasswordHash);
    if (!passwordValid) {
      return NextResponse.json(
        { error: "Invalid credentials" },
        { status: 401 }
      );
    }

    // Create session token
    const token = createSessionToken(username);

    // Set HttpOnly, Secure, SameSite cookie
    const response = NextResponse.json({ success: true });
    response.cookies.set(SESSION_COOKIE_NAME, token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "strict",
      path: "/",
      maxAge: 24 * 60 * 60, // 24 hours
    });

    return response;
  } catch {
    return NextResponse.json(
      { error: "Server error" },
      { status: 500 }
    );
  }
}

export async function DELETE() {
  // Logout — clear the session cookie
  const response = NextResponse.json({ success: true });
  response.cookies.set(SESSION_COOKIE_NAME, "", {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict",
    path: "/",
    maxAge: 0,
  });
  return response;
}
