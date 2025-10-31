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
    throw new Error('Google Calendar not connected');
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
      throw new Error('Failed to refresh token');
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

  return google.calendar({ version: 'v3', auth: oauth2Client });
}

const createEventSchema = z.object({
  title: z.string().min(1),
  start: z.string(), // ISO 8601
  end: z.string(), // ISO 8601
  location: z.string().optional(),
  attendees: z.array(z.string().email()).optional(),
  recurrence: z.object({
    freq: z.enum(['DAILY', 'WEEKLY', 'MONTHLY']),
    count: z.number().optional(),
  }).optional(),
});

/**
 * POST /api/calendar/create - Create a new calendar event
 */
export async function POST(request: Request) {
  const { userId } = await auth();
  
  if (!userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const body = await request.json();
    const validated = createEventSchema.parse(body);

    const calendar = await getCalendarClient(userId);

    const event: any = {
      summary: validated.title,
      start: {
        dateTime: validated.start,
        timeZone: 'UTC',
      },
      end: {
        dateTime: validated.end,
        timeZone: 'UTC',
      },
    };

    if (validated.location) {
      event.location = validated.location;
    }

    if (validated.attendees && validated.attendees.length > 0) {
      event.attendees = validated.attendees.map(email => ({ email }));
    }

    if (validated.recurrence) {
      const { freq, count } = validated.recurrence;
      const freqMap = { DAILY: 'DAILY', WEEKLY: 'WEEKLY', MONTHLY: 'MONTHLY' };
      let rule = `RRULE:FREQ=${freqMap[freq]}`;
      if (count) {
        rule += `;COUNT=${count}`;
      }
      event.recurrence = [rule];
    }

    const response = await calendar.events.insert({
      calendarId: "primary",
      requestBody: event,
    });

    // Log the action
    await client.mutation(api.tokens.logAction, {
      clerkUserId: userId,
      action: "create",
      eventId: response.data.id,
      details: {
        title: validated.title,
        start: validated.start,
        end: validated.end,
        location: validated.location,
        attendees: validated.attendees,
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
    console.error("Calendar create error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to create event" },
      { status: 500 }
    );
  }
}

