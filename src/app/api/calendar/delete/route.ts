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

  const now = Date.now();
  if (tokens.expiryTimestamp - now < 5 * 60 * 1000) {
    oauth2Client.setCredentials({
      refresh_token: tokens.refreshToken,
    });

    const { credentials } = await oauth2Client.refreshAccessToken();

    if (!credentials.access_token || !credentials.refresh_token) {
      throw new Error("Failed to refresh token");
    }

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

const deleteEventSchema = z.object({
  eventId: z.string().min(1),
});

/**
 * POST /api/calendar/delete - Delete a calendar event
 */
export async function POST(request: Request) {
  const { userId } = await auth();

  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = await request.json();
    const validated = deleteEventSchema.parse(body);

    const calendar = await getCalendarClient(userId);

    await calendar.events.delete({
      calendarId: "primary",
      eventId: validated.eventId,
    });

    // Log the action
    await client.mutation(api.tokens.logAction, {
      clerkUserId: userId,
      action: "delete",
      eventId: validated.eventId,
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: "Invalid request", details: error.errors },
        { status: 400 }
      );
    }
    console.error("Calendar delete error:", error);
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "Failed to delete event",
      },
      { status: 500 }
    );
  }
}
