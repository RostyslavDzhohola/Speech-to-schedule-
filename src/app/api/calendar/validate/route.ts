import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { google } from "googleapis";
import { client } from "@/lib/convex";
import { api } from "convex/_generated/api";

/**
 * Helper function to delete invalid tokens and throw a reconnection error
 */
async function handleInvalidToken(userId: string) {
  // Delete invalid tokens from Convex
  await client.mutation(api.tokens.deleteUserTokens, {
    clerkUserId: userId,
  });
  throw new Error("TOKEN_INVALID");
}

/**
 * GET /api/calendar/validate - Validate Google Calendar connection by testing token
 * This actually makes a request to Google to verify the token works
 */
export async function GET() {
  const { userId } = await auth();

  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    // Get tokens from Convex
    const tokens = await client.query(api.tokens.getUserTokens, {
      clerkUserId: userId,
    });

    if (!tokens) {
      return NextResponse.json({ connected: false, valid: false });
    }

    const oauth2Client = new google.auth.OAuth2(
      process.env.GOOGLE_CLIENT_ID,
      process.env.GOOGLE_CLIENT_SECRET,
      process.env.GOOGLE_OAUTH_REDIRECT
    );

    // Set credentials
    oauth2Client.setCredentials({
      access_token: tokens.accessToken,
      refresh_token: tokens.refreshToken,
    });

    // Check if token needs refresh
    const now = Date.now();
    const needsRefresh = tokens.expiryTimestamp - now < 5 * 60 * 1000;

    if (needsRefresh) {
      try {
        // Try to refresh the token
        const { credentials } = await oauth2Client.refreshAccessToken();

        if (!credentials.access_token) {
          // Refresh failed, delete tokens
          await handleInvalidToken(userId);
        }

        // Update tokens in Convex with refreshed credentials
        await client.mutation(api.tokens.upsertUserTokens, {
          clerkUserId: userId,
          accessToken: credentials.access_token,
          refreshToken: credentials.refresh_token || tokens.refreshToken,
          expiryTimestamp: credentials.expiry_date || Date.now() + 3600 * 1000,
        });

        // Update OAuth client with new credentials
        oauth2Client.setCredentials({
          access_token: credentials.access_token,
          refresh_token: credentials.refresh_token || tokens.refreshToken,
        });
      } catch (error: any) {
        // Check if it's an invalid_grant error
        if (
          error?.message?.includes("invalid_grant") ||
          error?.code === 400 ||
          error?.response?.data?.error === "invalid_grant"
        ) {
          // Token is invalid, delete it
          await handleInvalidToken(userId);
        }
        throw error;
      }
    }

    // Actually test the token by making a real API call to Google Calendar
    const calendar = google.calendar({ version: "v3", auth: oauth2Client });

    try {
      // Make a lightweight API call to verify the token works
      // Use events.list instead of calendarList.list since we only have calendar.events scope
      await calendar.events.list({
        calendarId: "primary",
        maxResults: 1,
      });

      return NextResponse.json({ connected: true, valid: true });
    } catch (error: any) {
      // If the API call fails with auth error, token is invalid
      if (
        error?.code === 401 ||
        error?.code === 403 ||
        error?.message?.includes("Invalid Credentials") ||
        error?.message?.includes("invalid_grant") ||
        error?.message?.includes("insufficient authentication scopes")
      ) {
        await handleInvalidToken(userId);
      }
      throw error;
    }
  } catch (error: any) {
    // Handle token invalid error specifically
    if (error?.message === "TOKEN_INVALID") {
      return NextResponse.json(
        { connected: false, valid: false, needsReconnect: true },
        { status: 401 }
      );
    }

    console.error("Calendar validation error:", error);
    return NextResponse.json(
      {
        connected: false,
        valid: false,
        error: error?.message || "Failed to validate connection",
      },
      { status: 500 }
    );
  }
}
