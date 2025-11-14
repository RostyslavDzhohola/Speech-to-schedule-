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

export const findEventsTool = tool({
  name: "find_events",
  description:
    "Find calendar events by query, date range, or list upcoming events",
  parameters: z.object({
    query: z.string().optional(),
    start: z.string().optional(),
    end: z.string().optional(),
    max: z.number().optional(),
  }),
  execute: async ({ query, start, end, max }) => {
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
    if (query) {
      const lowerQuery = query.toLowerCase();
      events = events.filter(
        (e: any) =>
          e.title.toLowerCase().includes(lowerQuery) ||
          e.description?.toLowerCase().includes(lowerQuery)
      );
    }

    return { events };
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
