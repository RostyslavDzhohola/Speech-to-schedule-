"use client";

import { SignedIn, SignedOut, SignInButton } from "@clerk/nextjs";
import { useEffect, useRef, useState } from "react";
import { RealtimeAgent, RealtimeSession, tool } from "@openai/agents/realtime";
import { z } from "zod";
import {
  getEphemeralToken,
  createVoiceSession,
  updateVoiceSession,
} from "../server/token.action";
import { ConnectCalendarBadge } from "@/components/ConnectCalendarBadge";
import { EventsList } from "@/components/EventsList";
import { useQuery } from "convex/react";
import { api } from "convex/_generated/api";
import { useAuth } from "@clerk/nextjs";

// Tool schemas for calendar operations
const findEventsTool = tool({
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

const createEventTool = tool({
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

const updateEventTool = tool({
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

const deleteEventTool = tool({
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

export default function VoiceTestPage() {
  const { userId } = useAuth();
  const [status, setStatus] = useState<
    "idle" | "connecting" | "connected" | "error"
  >("idle");
  const [error, setError] = useState<string | null>(null);
  const [history, setHistory] = useState<any[]>([]);
  const [refreshTrigger, setRefreshTrigger] = useState(0);
  const sessionRef = useRef<RealtimeSession | null>(null);
  const sessionIdRef = useRef<string | null>(null);
  const toolCallsCountRef = useRef<number>(0);

  // Check if Google Calendar is connected
  const tokens = useQuery(
    api.tokens.getUserTokens,
    userId ? { clerkUserId: userId } : "skip"
  );
  const isGoogleCalendarConnected = !!tokens;

  const connect = async () => {
    try {
      setStatus("connecting");
      setError(null);

      // Get ephemeral token from server
      const ephemeralToken = await getEphemeralToken();

      // Create voice session in Convex
      const sessionId = await createVoiceSession();
      sessionIdRef.current = sessionId;
      toolCallsCountRef.current = 0;

      // Create agent with tools
      const agent = new RealtimeAgent({
        name: "Calendar Assistant",
        instructions: `You are a helpful assistant for managing Google Calendar. 
        You can help users create, update, and delete calendar events.
        When users ask about events, use find_events to search for them.
        Always confirm before deleting events.`,
        tools: [
          findEventsTool,
          createEventTool,
          updateEventTool,
          deleteEventTool,
        ],
      });

      // Create session
      const session = new RealtimeSession(agent, {
        model: "gpt-realtime-mini-2025-10-06",
      });

      // Listen for connection events
      (session.on as any)("connected", () => {
        setStatus("connected");
      });

      (session.on as any)("error", (err: any) => {
        setError(err?.message || String(err) || "Connection error");
        setStatus("error");
      });

      session.on("history_updated", (updatedHistory) => {
        setHistory(updatedHistory);

        // Check if any tool calls were made and refresh events list
        const toolCalls = updatedHistory.filter(
          (item: any) => item.type === "function_call"
        );
        const newToolCallsCount = toolCalls.length;

        if (newToolCallsCount > toolCallsCountRef.current) {
          toolCallsCountRef.current = newToolCallsCount;
          // Update session with new tool calls count
          if (sessionIdRef.current) {
            updateVoiceSession(sessionIdRef.current, {
              toolCallsCount: newToolCallsCount,
            }).catch((err) => {
              console.error("Failed to update voice session:", err);
            });
          }
          setRefreshTrigger((prev) => prev + 1);
        }
      });

      // Connect to WebRTC
      await session.connect({
        apiKey: ephemeralToken,
      });

      sessionRef.current = session;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to connect");
      setStatus("error");
    }
  };

  const disconnect = () => {
    if (sessionRef.current) {
      // Try to disconnect the session
      try {
        // RealtimeSession may use different method - check transport layer
        const transport = (sessionRef.current as any).transport;
        if (transport && typeof transport.disconnect === "function") {
          transport.disconnect();
        }
      } catch (e) {
        console.warn("Error disconnecting session:", e);
      }

      sessionRef.current = null;

      // End the voice session in Convex
      if (sessionIdRef.current) {
        updateVoiceSession(sessionIdRef.current, {
          endedAt: Date.now(),
          toolCallsCount: toolCallsCountRef.current,
        }).catch((err) => {
          console.error("Failed to end voice session:", err);
        });
        sessionIdRef.current = null;
      }

      setStatus("idle");
      setHistory([]);
      toolCallsCountRef.current = 0;
    }
  };

  useEffect(() => {
    return () => {
      if (sessionRef.current) {
        // Try to disconnect the session
        try {
          const transport = (sessionRef.current as any).transport;
          if (transport && typeof transport.disconnect === "function") {
            transport.disconnect();
          }
        } catch (e) {
          console.warn("Error disconnecting session:", e);
        }

        // End the voice session if component unmounts
        if (sessionIdRef.current) {
          updateVoiceSession(sessionIdRef.current, {
            endedAt: Date.now(),
            toolCallsCount: toolCallsCountRef.current,
          }).catch((err) => {
            console.error("Failed to end voice session:", err);
          });
        }
      }
    };
  }, []);

  return (
    <div className="flex min-h-screen flex-col p-8">
      <div className="max-w-6xl mx-auto w-full">
        <h1 className="text-4xl font-bold text-center mb-8">
          Voice Calendar Agent
        </h1>

        <SignedOut>
          <div className="flex flex-col items-center gap-4">
            <p className="text-center text-gray-600 mb-4">
              Please sign in to use the voice agent
            </p>
            <SignInButton mode="modal">
              <button className="px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700">
                Sign In
              </button>
            </SignInButton>
          </div>
        </SignedOut>

        <SignedIn>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Left Column: Voice Console */}
            <div className="space-y-4">
              <ConnectCalendarBadge />

              <div className="p-4 border rounded-lg">
                <div className="text-lg mb-4">
                  Status: <span className="font-semibold">{status}</span>
                </div>

                {error && (
                  <div className="text-red-600 bg-red-50 p-4 rounded mb-4">
                    Error: {error}
                  </div>
                )}

                {status === "idle" || status === "error" ? (
                  <>
                    {!isGoogleCalendarConnected ? (
                      <div className="space-y-2">
                        <p className="text-sm text-gray-600 mb-2">
                          Please connect your Google Calendar first before
                          starting a voice session.
                        </p>
                      </div>
                    ) : (
                      <button
                        onClick={connect}
                        className="px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
                      >
                        Start Voice Session
                      </button>
                    )}
                  </>
                ) : status === "connecting" ? (
                  <div className="px-6 py-3 bg-gray-400 text-white rounded-lg">
                    Connecting...
                  </div>
                ) : (
                  <button
                    onClick={disconnect}
                    className="px-6 py-3 bg-red-600 text-white rounded-lg hover:bg-red-700"
                  >
                    Disconnect
                  </button>
                )}

                {status === "connected" && (
                  <div className="mt-4 text-gray-600">
                    <p>✅ Connected! Microphone is active.</p>
                    <p className="mt-2">
                      Start speaking to interact with the voice agent.
                    </p>
                  </div>
                )}

                {history.length > 0 && (
                  <div className="mt-4 max-h-64 overflow-y-auto border rounded p-4">
                    <h2 className="font-bold mb-2 text-sm">Conversation</h2>
                    {history.map((item, idx) => (
                      <div key={idx} className="mb-2 text-xs">
                        {item.type === "message" && (
                          <div>
                            <span className="font-semibold">{item.role}:</span>{" "}
                            {item.content?.text || item.transcript || "..."}
                          </div>
                        )}
                        {item.type === "function_call" && (
                          <div className="text-blue-600">🔧 {item.name}</div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* Right Column: Events List */}
            <div>
              <EventsList refreshTrigger={refreshTrigger} />
            </div>
          </div>
        </SignedIn>
      </div>
    </div>
  );
}
