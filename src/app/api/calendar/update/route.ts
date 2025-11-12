import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { google } from "googleapis";
import { z } from "zod";
import { client } from "@/lib/convex";
import { api } from "convex/_generated/api";

/**
 * Helper function to delete invalid tokens
 */
async function deleteInvalidTokens(userId: string) {
  await client.mutation(api.tokens.deleteUserTokens, {
    clerkUserId: userId,
  });
}

/**
 * Get Google Calendar client with refreshed tokens
 * Handles invalid_grant errors by deleting tokens and throwing a specific error
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

    try {
      const { credentials } = await oauth2Client.refreshAccessToken();

      if (!credentials.access_token) {
        // No access token returned, delete invalid tokens
        await deleteInvalidTokens(userId);
        throw new Error("TOKEN_INVALID");
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
    } catch (error: any) {
      // Check if it's an invalid_grant error
      if (
        error?.message?.includes("invalid_grant") ||
        error?.code === 400 ||
        error?.response?.data?.error === "invalid_grant"
      ) {
        // Token is invalid, delete it
        await deleteInvalidTokens(userId);
        throw new Error("TOKEN_INVALID");
      }
      throw error;
    }
  } else {
    oauth2Client.setCredentials({
      access_token: tokens.accessToken,
      refresh_token: tokens.refreshToken,
    });
  }

  return google.calendar({ version: "v3", auth: oauth2Client });
}

const updateEventSchema = z.object({
  eventId: z.string().min(1),
  title: z.string().optional(),
  start: z.string().optional(),
  end: z.string().optional(),
  location: z.string().optional(),
  attendees: z.array(z.string().email()).optional(),
  recurrence: z
    .object({
      freq: z.enum(["DAILY", "WEEKLY", "MONTHLY"]),
      count: z.number().optional(),
    })
    .optional(),
});

/**
 * POST /api/calendar/update - Update an existing calendar event
 */
export async function POST(request: Request) {
  const { userId } = await auth();

  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = await request.json();
    const validated = updateEventSchema.parse(body);

    const calendar = await getCalendarClient(userId);

    // First, get the existing event
    const existingEvent = await calendar.events.get({
      calendarId: "primary",
      eventId: validated.eventId,
    });

    const event: any = { ...existingEvent.data };

    if (validated.title !== undefined) {
      event.summary = validated.title;
    }

    if (validated.start !== undefined) {
      event.start = {
        dateTime: validated.start,
        timeZone: "UTC",
      };
    }

    if (validated.end !== undefined) {
      event.end = {
        dateTime: validated.end,
        timeZone: "UTC",
      };
    }

    if (validated.location !== undefined) {
      event.location = validated.location;
    }

    if (validated.attendees !== undefined) {
      event.attendees = validated.attendees.map((email) => ({ email }));
    }

    if (validated.recurrence !== undefined) {
      const { freq, count } = validated.recurrence;
      const freqMap = { DAILY: "DAILY", WEEKLY: "WEEKLY", MONTHLY: "MONTHLY" };
      let rule = `RRULE:FREQ=${freqMap[freq]}`;
      if (count) {
        rule += `;COUNT=${count}`;
      }
      event.recurrence = [rule];
    }

    const response = await calendar.events.update({
      calendarId: "primary",
      eventId: validated.eventId,
      requestBody: event,
    });

    // Log the action
    await client.mutation(api.tokens.logAction, {
      clerkUserId: userId,
      action: "update",
      details: {
        changes: {
          title: validated.title,
          start: validated.start,
          end: validated.end,
          location: validated.location,
          attendees: validated.attendees,
          recurrence: validated.recurrence,
        },
      },
    });

    return NextResponse.json({
      id: response.data.id,
      title: response.data.summary,
      start: response.data.start?.dateTime || response.data.start?.date,
      end: response.data.end?.dateTime || response.data.end?.date,
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: "Invalid request", details: error.errors },
        { status: 400 }
      );
    }

    const errorMessage =
      error instanceof Error ? error.message : "Failed to update event";

    // Handle invalid token error
    if (errorMessage === "TOKEN_INVALID") {
      return NextResponse.json(
        {
          error: "Google Calendar connection expired. Please reconnect.",
          needsReconnect: true,
        },
        { status: 401 }
      );
    }

    console.error("Calendar update error:", error);
    return NextResponse.json(
      {
        error: errorMessage,
      },
      { status: 500 }
    );
  }
}
