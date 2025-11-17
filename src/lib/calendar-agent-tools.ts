import { tool } from "@openai/agents/realtime";
import { z } from "zod";
import {
  VOICE_SESSION_END_EVENT,
  VOICE_SESSION_ID_KEY,
} from "./voice-session-bridge";

/**
 * Tool definitions for the calendar agent
 * These tools allow the voice agent to interact with Google Calendar
 */

/**
 * Helper function to get the start of a day (00:00:00) for a given ISO date string
 */
function getDayStart(isoString: string): string {
  const date = new Date(isoString);
  date.setHours(0, 0, 0, 0);
  return date.toISOString();
}

/**
 * Helper function to get the end of a day (23:59:59) for a given ISO date string
 */
function getDayEnd(isoString: string): string {
  const date = new Date(isoString);
  date.setHours(23, 59, 59, 999);
  return date.toISOString();
}

/**
 * Helper function to get the start of a week (Sunday 00:00:00) for a given ISO date string
 */
function getWeekStart(isoString: string): string {
  const date = new Date(isoString);
  const day = date.getDay();
  date.setDate(date.getDate() - day);
  date.setHours(0, 0, 0, 0);
  return date.toISOString();
}

/**
 * Helper function to get the end of a week (Saturday 23:59:59) for a given ISO date string
 */
function getWeekEnd(isoString: string): string {
  const date = new Date(isoString);
  const day = date.getDay();
  date.setDate(date.getDate() + (6 - day));
  date.setHours(23, 59, 59, 999);
  return date.toISOString();
}

/**
 * Helper function to check if two ISO date strings are on the same day
 */
function isSameDay(iso1: string, iso2: string): boolean {
  const d1 = new Date(iso1);
  const d2 = new Date(iso2);
  return (
    d1.getFullYear() === d2.getFullYear() &&
    d1.getMonth() === d2.getMonth() &&
    d1.getDate() === d2.getDate()
  );
}

export const findEventsTool = tool({
  name: "find_events",
  description:
    "Find calendar events by query, date range, or list upcoming events. " +
    "If a query doesn't match any events in the specified range, the tool will automatically " +
    "expand the search to the full day, then the full week, returning all events so the agent " +
    "can use context to identify which event the user is referring to.",
  parameters: z.object({
    query: z.string().optional(),
    start: z.string().optional(),
    end: z.string().optional(),
    max: z.number().optional(),
  }),
  execute: async ({ query, start, end, max }) => {
    // Initial search with provided parameters
    const params = new URLSearchParams();
    if (start) params.set("start", start);
    if (end) params.set("end", end);
    if (max) params.set("max", max.toString());

    const response = await fetch(`/api/calendar/list?${params.toString()}`);
    const data = await response.json();

    if (!response.ok) {
      return { error: data.error || "Failed to find events" };
    }

    // Filter by query if provided
    let events = data.events || [];
    let searchRange: "original" | "day" | "week" = "original";

    if (query) {
      const lowerQuery = query.toLowerCase();
      const filteredEvents = events.filter(
        (e: any) =>
          e.title.toLowerCase().includes(lowerQuery) ||
          e.description?.toLowerCase().includes(lowerQuery)
      );

      // If no matches found and we have date boundaries, try fallback searches
      if (filteredEvents.length === 0 && start && end) {
        // Check if start and end are on the same day
        if (isSameDay(start, end)) {
          // Fallback 1: Search the entire day
          const dayStart = getDayStart(start);
          const dayEnd = getDayEnd(start);

          const dayParams = new URLSearchParams();
          dayParams.set("start", dayStart);
          dayParams.set("end", dayEnd);
          if (max) dayParams.set("max", max.toString());

          const dayResponse = await fetch(
            `/api/calendar/list?${dayParams.toString()}`
          );
          const dayData = await dayResponse.json();

          if (dayResponse.ok && dayData.events && dayData.events.length > 0) {
            events = dayData.events;
            searchRange = "day";
          } else {
            // Fallback 2: Search the entire week
            const weekStart = getWeekStart(start);
            const weekEnd = getWeekEnd(start);

            const weekParams = new URLSearchParams();
            weekParams.set("start", weekStart);
            weekParams.set("end", weekEnd);
            if (max) weekParams.set("max", max.toString());

            const weekResponse = await fetch(
              `/api/calendar/list?${weekParams.toString()}`
            );
            const weekData = await weekResponse.json();

            if (
              weekResponse.ok &&
              weekData.events &&
              weekData.events.length > 0
            ) {
              events = weekData.events;
              searchRange = "week";
            }
          }
        } else {
          // If the range spans multiple days, try expanding to full week
          const weekStart = getWeekStart(start);
          const weekEnd = getWeekEnd(end);

          const weekParams = new URLSearchParams();
          weekParams.set("start", weekStart);
          weekParams.set("end", weekEnd);
          if (max) weekParams.set("max", max.toString());

          const weekResponse = await fetch(
            `/api/calendar/list?${weekParams.toString()}`
          );
          const weekData = await weekResponse.json();

          if (
            weekResponse.ok &&
            weekData.events &&
            weekData.events.length > 0
          ) {
            events = weekData.events;
            searchRange = "week";
          }
        }
      } else {
        // We found matches with the original query
        events = filteredEvents;
      }
    }

    return {
      events,
      searchRange,
      message:
        searchRange !== "original"
          ? `No exact matches found. Expanded search to ${searchRange} range. Use your understanding of the user's query to identify the relevant event from the results.`
          : undefined,
    };
  },
});

export const createEventTool = tool({
  name: "create_event",
  description: "Create a new calendar event",
  parameters: z.object({
    title: z.string(),
    start: z.string(),
    end: z.string(),
    location: z.string().optional(),
    attendees: z.array(z.string()).optional(),
    recurrence: z
      .object({
        freq: z.enum(["DAILY", "WEEKLY", "MONTHLY"]),
        count: z.number().optional(),
      })
      .optional(),
  }),
  execute: async (params) => {
    const response = await fetch("/api/calendar/create", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(params),
    });

    const data = await response.json();

    if (!response.ok) {
      return { error: data.error || "Failed to create event" };
    }

    return { success: true, event: data };
  },
});

export const updateEventTool = tool({
  name: "update_event",
  description: "Update an existing calendar event",
  parameters: z.object({
    eventId: z.string(),
    title: z.string().optional(),
    start: z.string().optional(),
    end: z.string().optional(),
    location: z.string().optional(),
    attendees: z.array(z.string()).optional(),
    recurrence: z
      .object({
        freq: z.enum(["DAILY", "WEEKLY", "MONTHLY"]),
        count: z.number().optional(),
      })
      .optional(),
  }),
  execute: async (params) => {
    const response = await fetch("/api/calendar/update", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(params),
    });

    const data = await response.json();

    if (!response.ok) {
      return { error: data.error || "Failed to update event" };
    }

    return { success: true, event: data };
  },
});

export const deleteEventTool = tool({
  name: "delete_event",
  description: "Delete a calendar event by ID",
  parameters: z.object({
    eventId: z.string(),
  }),
  execute: async ({ eventId }) => {
    const response = await fetch("/api/calendar/delete", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ eventId }),
    });

    const data = await response.json();

    if (!response.ok) {
      return { error: data.error || "Failed to delete event" };
    }

    return { success: true };
  },
});

export const endVoiceSessionTool = tool({
  name: "end_voice_session",
  description:
    "End the current voice session. Use this when the user confirms they want to end the session after you ask for confirmation.",
  parameters: z.object({}),
  execute: async () => {
    // Get session ID from sessionStorage
    if (typeof window === "undefined") {
      return { error: "Not available in server context" };
    }

    const sessionId = sessionStorage.getItem(VOICE_SESSION_ID_KEY);
    if (!sessionId) {
      return { error: "No active voice session found" };
    }

    // Call API to mark session as ended
    const response = await fetch("/api/voice/session/stop", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sessionId }),
    });

    const data = await response.json();

    if (!response.ok) {
      return { error: data.error || "Failed to end voice session" };
    }

    // Delay event dispatch to allow the tool result to be sent back to the agent
    // before disconnecting the WebRTC connection. This prevents "WebRTC data channel
    // is not connected" errors that occur when the connection is closed while the
    // SDK is still trying to send the function call output.
    setTimeout(() => {
      window.dispatchEvent(new CustomEvent(VOICE_SESSION_END_EVENT));
    }, 400);

    return { success: true, message: "Voice session ended" };
  },
});
