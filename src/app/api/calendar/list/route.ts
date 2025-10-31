import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { google } from "googleapis";
import { z } from "zod";
import { client } from "@/lib/convex";
import { api } from "convex/_generated/api";

/**
 * Get Google Calendar client with refreshed tokens
 */
async function getCalendarClient(userId: string) {
  // Get tokens from Convex
  const tokens = await client.query(api.tokens.getUserTokens, {
    clerkUserId: userId,
  });

  if (!tokens) {
    throw new Error("Google Calendar not connected");
  }

  const oauth2Client = new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    process.env.GOOGLE_OAUTH_REDIRECT
  );

  // Check if token needs refresh
  const now = Date.now();
  if (tokens.expiryTimestamp - now < 5 * 60 * 1000) {
    // Refresh token
    oauth2Client.setCredentials({
      refresh_token: tokens.refreshToken,
    });

    const { credentials } = await oauth2Client.refreshAccessToken();

    if (!credentials.access_token || !credentials.refresh_token) {
      throw new Error("Failed to refresh token");
    }

    // Update tokens in Convex
    await client.mutation(api.tokens.upsertUserTokens, {
      clerkUserId: userId,
      accessToken: credentials.access_token,
      refreshToken: credentials.refresh_token || tokens.refreshToken,
      expiryTimestamp: credentials.expiry_date || Date.now() + 3600 * 1000,
    });

    oauth2Client.setCredentials({
      access_token: credentials.access_token,
      refresh_token: credentials.refresh_token || tokens.refreshToken,
    });
  } else {
    oauth2Client.setCredentials({
      access_token: tokens.accessToken,
      refresh_token: tokens.refreshToken,
    });
  }

  return google.calendar({ version: "v3", auth: oauth2Client });
}

/**
 * GET /api/calendar/list - List upcoming calendar events
 */
export async function GET(request: Request) {
  const { userId } = await auth();

  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { searchParams } = new URL(request.url);
    const startTime = searchParams.get("start") || new Date().toISOString();
    const endTime =
      searchParams.get("end") ||
      new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
    const maxResults = parseInt(searchParams.get("max") || "10");

    const calendar = await getCalendarClient(userId);

    const response = await calendar.events.list({
      calendarId: "primary",
      timeMin: startTime,
      timeMax: endTime,
      maxResults,
      singleEvents: true,
      orderBy: "startTime",
    });

    const events = (response.data.items || []).map((event) => ({
      id: event.id,
      title: event.summary || "Untitled Event",
      start: event.start?.dateTime || event.start?.date,
      end: event.end?.dateTime || event.end?.date,
      location: event.location,
      attendees: event.attendees?.map((a) => a.email || "") || [],
      description: event.description,
    }));

    // Log the action (non-blocking)
    client
      .mutation(api.tokens.logAction, {
        clerkUserId: userId,
        action: "list",
        details: {
          eventCount: events.length,
          startTime,
          endTime,
          maxResults,
        },
      })
      .catch((err) => {
        console.error("Failed to log list action:", err);
      });

    return NextResponse.json({ events });
  } catch (error) {
    console.error("Calendar list error:", error);

    // Check if it's a Google API not enabled error
    const errorMessage =
      error instanceof Error ? error.message : "Failed to list events";
    if (
      errorMessage.includes("API has not been used") ||
      errorMessage.includes("disabled")
    ) {
      return NextResponse.json(
        {
          error:
            "Google Calendar API is not enabled. Please enable it in Google Cloud Console.",
          details: errorMessage,
          helpUrl:
            "https://console.cloud.google.com/apis/api/calendar-json.googleapis.com/overview",
        },
        { status: 503 }
      );
    }

    return NextResponse.json(
      {
        error: errorMessage,
      },
      { status: 500 }
    );
  }
}
