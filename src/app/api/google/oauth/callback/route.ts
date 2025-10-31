import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { google } from "googleapis";
import { client } from "@/lib/convex";
import { api } from "convex/_generated/api";

/**
 * Handles Google OAuth callback and stores tokens in Convex
 */
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const code = searchParams.get("code");
  const state = searchParams.get("state"); // Should be userId

  if (!code || !state) {
    return NextResponse.json(
      { error: "Missing code or state parameter" },
      { status: 400 }
    );
  }

  // Verify user is authenticated and matches state
  const { userId } = await auth();
  if (!userId || userId !== state) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  const redirectUri =
    process.env.GOOGLE_OAUTH_REDIRECT ||
    "http://localhost:3000/api/google/oauth/callback";

  if (!clientId || !clientSecret) {
    return NextResponse.json(
      { error: "Google OAuth not configured" },
      { status: 500 }
    );
  }

  try {
    const oauth2Client = new google.auth.OAuth2(
      clientId,
      clientSecret,
      redirectUri
    );

    // Exchange code for tokens
    const { tokens } = await oauth2Client.getToken(code);

    if (!tokens.access_token || !tokens.refresh_token) {
      return NextResponse.json(
        { error: "Failed to obtain tokens" },
        { status: 500 }
      );
    }

    // Calculate expiry timestamp
    const expiryTimestamp = tokens.expiry_date
      ? tokens.expiry_date
      : Date.now() + 3600 * 1000; // Default to 1 hour if not provided

    // Store tokens in Convex
    await client.mutation(api.tokens.upsertUserTokens, {
      clerkUserId: userId,
      accessToken: tokens.access_token,
      refreshToken: tokens.refresh_token,
      expiryTimestamp,
    });

    // Redirect to main app
    return NextResponse.redirect(new URL("/", request.url));
  } catch (error) {
    console.error("OAuth callback error:", error);
    return NextResponse.json(
      { error: "Failed to authenticate with Google" },
      { status: 500 }
    );
  }
}
