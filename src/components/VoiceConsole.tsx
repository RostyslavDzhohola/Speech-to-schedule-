"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { RealtimeAgent, RealtimeSession } from "@openai/agents/realtime";
import {
  getEphemeralToken,
  createVoiceSession,
  updateVoiceSession,
} from "@/app/server/token.action";
import { ConnectCalendarBadge } from "@/components/ConnectCalendarBadge";
import {
  checkMicrophoneAccess,
  normalizeErrorMessage,
  classifyErrorType,
  type ErrorType,
} from "@/lib/error-utils";
import {
  findEventsTool,
  createEventTool,
  updateEventTool,
  deleteEventTool,
  endVoiceSessionTool,
} from "@/lib/calendar-agent-tools";
import {
  VOICE_SESSION_END_EVENT,
  VOICE_SESSION_ID_KEY,
} from "@/lib/voice-session-bridge";

interface VoiceConsoleProps {
  isGoogleCalendarConnected: boolean;
  onRefreshTrigger: () => void;
}

/**
 * Voice Console component - handles the interactive voice agent interface
 * This component manages WebRTC connection, session state, and user interactions
 */
export function VoiceConsole({
  isGoogleCalendarConnected,
  onRefreshTrigger,
}: VoiceConsoleProps) {
  const [status, setStatus] = useState<
    "idle" | "connecting" | "connected" | "error"
  >("idle");
  const [error, setError] = useState<string | null>(null);
  const [errorType, setErrorType] = useState<ErrorType | null>(null);
  const [history, setHistory] = useState<any[]>([]);
  const sessionRef = useRef<RealtimeSession | null>(null);
  const sessionIdRef = useRef<string | null>(null);
  const toolCallsCountRef = useRef<number>(0);
  const chimePlayedRef = useRef<boolean>(false);
  const isDisconnectingRef = useRef<boolean>(false);

  /**
   * Plays a pleasant chime sound to indicate the agent is ready
   * Uses Web Audio API to generate a simple two-tone chime programmatically
   */
  const playReadyChime = () => {
    try {
      const audioContext = new (window.AudioContext ||
        (window as any).webkitAudioContext)();
      const now = audioContext.currentTime;

      // Create a pleasant two-tone chime (C5 and E5 notes)
      const frequencies = [523.25, 659.25]; // C5 and E5 in Hz
      frequencies.forEach((freq, index) => {
        const oscillator = audioContext.createOscillator();
        const gainNode = audioContext.createGain();

        oscillator.connect(gainNode);
        gainNode.connect(audioContext.destination);

        oscillator.frequency.value = freq;
        oscillator.type = "sine"; // Sine wave for a smooth, pleasant tone

        // Envelope: quick attack, gentle decay
        gainNode.gain.setValueAtTime(0, now + index * 0.1);
        gainNode.gain.linearRampToValueAtTime(0.3, now + index * 0.1 + 0.01);
        gainNode.gain.exponentialRampToValueAtTime(
          0.01,
          now + index * 0.1 + 0.3
        );

        oscillator.start(now + index * 0.1);
        oscillator.stop(now + index * 0.1 + 0.3);
      });
    } catch (err) {
      // Silently fail if audio context cannot be created
      // (e.g., browser doesn't support Web Audio API or autoplay restrictions)
      console.warn("Could not play ready chime:", err);
    }
  };

  const connect = async () => {
    try {
      setStatus("connecting");
      setError(null);
      setErrorType(null);

      // Step 0: Check microphone access before attempting connection
      const micCheck = await checkMicrophoneAccess();
      if (micCheck) {
        setError(micCheck.error);
        setErrorType(micCheck.type);
        setStatus("error");
        return;
      }

      let ephemeralToken: string;
      let sessionId: string;
      let session: RealtimeSession;

      // Step 1: Get ephemeral token from server
      try {
        ephemeralToken = await getEphemeralToken();
      } catch (err) {
        const errorMessage = normalizeErrorMessage(err);
        const errorType = classifyErrorType(errorMessage, "getEphemeralToken");
        setError(
          `Failed to get authentication token: ${errorMessage}. Please check your OpenAI API key configuration.`
        );
        setErrorType(errorType);
        setStatus("error");
        return;
      }

      // Step 2: Create voice session in Convex
      try {
        sessionId = await createVoiceSession();
        sessionIdRef.current = sessionId;
        toolCallsCountRef.current = 0;
        chimePlayedRef.current = false; // Reset chime flag for new session
        isDisconnectingRef.current = false; // Reset disconnecting flag for new session
        // Store session ID in sessionStorage for agent tools to access
        if (typeof window !== "undefined") {
          sessionStorage.setItem(VOICE_SESSION_ID_KEY, sessionId);
        }
      } catch (err) {
        const errorMessage = normalizeErrorMessage(err);
        const errorType = classifyErrorType(errorMessage);
        setError(
          `Failed to create voice session: ${errorMessage}. Please try again.`
        );
        setErrorType(errorType);
        setStatus("error");
        return;
      }

      // Step 3: Capture user's timezone and current time
      let userTimezone: string;
      let currentTime: string;
      try {
        // Get user's IANA timezone (e.g., "America/New_York", "Europe/London")
        const resolvedOptions = Intl.DateTimeFormat().resolvedOptions();
        userTimezone = resolvedOptions.timeZone || "UTC";

        // Get current local time in a readable format
        const now = new Date();
        currentTime = now.toLocaleString("en-US", {
          timeZone: userTimezone,
          weekday: "long",
          year: "numeric",
          month: "long",
          day: "numeric",
          hour: "numeric",
          minute: "2-digit",
          hour12: true,
        });
      } catch (err) {
        // Fallback to UTC if timezone detection fails
        console.warn("Failed to detect timezone, using UTC:", err);
        userTimezone = "UTC";
        currentTime = new Date().toISOString();
      }

      // Log timezone context for verification
      console.log("Timezone context:", {
        timezone: userTimezone,
        currentTime,
      });

      // Step 4: Create agent with tools and timezone context
      try {
        const agent = new RealtimeAgent({
          name: "Calendar Assistant",
          instructions: `You are a helpful assistant for managing Google Calendar. 
        You can help users create, update, and delete calendar events.
        When users ask about events, use find_events to search for them.
        Always confirm before deleting events.
        
        IMPORTANT: Current user time: ${currentTime} (Time Zone: ${userTimezone})
        When creating or updating events, always use the user's local timezone (${userTimezone}) unless they explicitly specify a different timezone.
        
        SESSION MANAGEMENT: If the user indicates they are done (e.g., "I'm done", "that's it for now", "okay, I'm done"), you MUST ask for confirmation: "Do you want me to end the session?" Only call the end_voice_session tool if they confirm with "yes" or similar affirmative response.
        
        RESPONSE STYLE: After completing any task, respond with a very brief confirmation only. Use short phrases like "Done, what's next?" or "Do you need anything else?" and nothing more. Keep responses concise and to the point.`,
          tools: [
            findEventsTool,
            createEventTool,
            updateEventTool,
            deleteEventTool,
            endVoiceSessionTool,
          ],
        });

        // Step 5: Create session
        // 2 models available: gpt-realtime-2025-08-28 and gpt-realtime-mini-2025-10-06
        // gpt-realtime-mini-2025-10-06 cheaper but faster
        // gpt-realtime-2025-08-28 more better performance but slower
        session = new RealtimeSession(agent, {
          model: "gpt-realtime-mini-2025-10-06",
        });
      } catch (err) {
        const errorMessage = normalizeErrorMessage(err);
        const errorType = classifyErrorType(errorMessage);
        setError(
          `Failed to initialize voice agent: ${errorMessage}. Please refresh the page and try again.`
        );
        setErrorType(errorType);
        setStatus("error");
        return;
      }

      // Step 6: Set up event listeners before connecting
      let connectionErrorOccurred = false;

      // Listen for connection events - these are the primary way to detect connection state
      (session.on as any)("connected", () => {
        setStatus((currentStatus) => {
          // Only update to connected if we're still connecting (don't overwrite error state)
          return currentStatus === "connecting" ? "connected" : currentStatus;
        });
        setError(null); // Clear any previous errors on successful connection
        setErrorType(null);

        // Play chime once when connection is established
        if (!chimePlayedRef.current) {
          chimePlayedRef.current = true;
          playReadyChime();
        }
      });

      (session.on as any)("error", (err: any) => {
        connectionErrorOccurred = true;
        let errorMessage = normalizeErrorMessage(err);
        const errorType = classifyErrorType(errorMessage);
        const lowerMessage = errorMessage.toLowerCase();

        // Suppress WebRTC data channel errors when intentionally disconnecting
        // This happens when the session is stopped and the agent tries to send a response
        // through the now-closed connection - this is expected behavior
        if (
          isDisconnectingRef.current &&
          (lowerMessage.includes("data channel is not connected") ||
            lowerMessage.includes("webrtc data channel") ||
            (lowerMessage.includes("webrtc") &&
              lowerMessage.includes("not connected")))
        ) {
          // Silently ignore this error - it's expected when disconnecting
          return;
        }

        // Provide more context for common errors
        if (lowerMessage.includes("permission")) {
          // Determine if it's API key or microphone permission
          if (
            lowerMessage.includes("api") ||
            lowerMessage.includes("token") ||
            lowerMessage.includes("authentication")
          ) {
            errorMessage = `Permission denied: ${errorMessage}. Please check your OpenAI API key permissions and ensure you have access to the Realtime API.`;
          } else {
            errorMessage = `Permission denied: ${errorMessage}. Please grant microphone access in your browser settings.`;
          }
        } else if (
          lowerMessage.includes("network") ||
          lowerMessage.includes("webrtc")
        ) {
          errorMessage = `Network error: ${errorMessage}. Please check your internet connection and try again.`;
        } else if (
          lowerMessage.includes("microphone") ||
          lowerMessage.includes("audio")
        ) {
          errorMessage = `Audio error: ${errorMessage}. Please ensure your microphone is connected and permissions are granted.`;
        }

        setError(errorMessage);
        setErrorType(errorType);
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
          onRefreshTrigger();
        }
      });

      // Step 7: Connect to WebRTC
      try {
        await session.connect({
          apiKey: ephemeralToken,
        });

        // Only update status if no error occurred during connection
        if (!connectionErrorOccurred) {
          // Fallback: if connect() resolved and we're still connecting, assume connected
          // But only update if status hasn't been changed by event listeners (e.g., to error)
          setStatus((currentStatus) => {
            const newStatus =
              currentStatus === "connecting" ? "connected" : currentStatus;
            // Play chime if we transitioned to connected and haven't played it yet
            if (newStatus === "connected" && !chimePlayedRef.current) {
              chimePlayedRef.current = true;
              playReadyChime();
            }
            return newStatus;
          });
        }
        sessionRef.current = session;
      } catch (err) {
        connectionErrorOccurred = true;
        let errorMessage = normalizeErrorMessage(err);
        const errorType = classifyErrorType(errorMessage);

        // Provide more context for common connection errors
        const lowerMessage = errorMessage.toLowerCase();
        if (lowerMessage.includes("permission")) {
          // Determine if it's API key or microphone permission
          if (
            lowerMessage.includes("api") ||
            lowerMessage.includes("token") ||
            lowerMessage.includes("authentication")
          ) {
            errorMessage = `Permission denied: ${errorMessage}. Please check your OpenAI API key permissions and ensure you have access to the Realtime API.`;
          } else {
            errorMessage = `Permission denied: ${errorMessage}. Please grant microphone access in your browser settings.`;
          }
        } else if (
          lowerMessage.includes("network") ||
          lowerMessage.includes("webrtc")
        ) {
          errorMessage = `Network error: ${errorMessage}. Please check your internet connection and try again.`;
        } else if (lowerMessage.includes("timeout")) {
          errorMessage = `Connection timeout: ${errorMessage}. Please try again.`;
        } else if (
          lowerMessage.includes("microphone") ||
          lowerMessage.includes("audio")
        ) {
          errorMessage = `Audio error: ${errorMessage}. Please ensure your microphone is connected and permissions are granted.`;
        }

        setError(errorMessage);
        setErrorType(errorType);
        setStatus("error");

        // Clean up session on connection failure
        try {
          if (sessionIdRef.current) {
            await updateVoiceSession(sessionIdRef.current, {
              endedAt: Date.now(),
              toolCallsCount: toolCallsCountRef.current,
            });
          }
        } catch (cleanupErr) {
          console.error("Failed to cleanup session after error:", cleanupErr);
        }
      }
    } catch (err) {
      // Catch-all for any unexpected errors
      const errorMessage = normalizeErrorMessage(err);
      const errorType = classifyErrorType(errorMessage);
      setError(`Failed to connect: ${errorMessage}. Please try again.`);
      setErrorType(errorType);
      setStatus("error");

      // Clean up on unexpected error
      try {
        if (sessionIdRef.current) {
          await updateVoiceSession(sessionIdRef.current, {
            endedAt: Date.now(),
            toolCallsCount: toolCallsCountRef.current,
          });
        }
      } catch (cleanupErr) {
        console.error(
          "Failed to cleanup session after unexpected error:",
          cleanupErr
        );
      }
    }
  };

  const disconnect = useCallback(async () => {
    if (sessionRef.current) {
      // Mark that we're intentionally disconnecting to suppress expected WebRTC errors
      isDisconnectingRef.current = true;

      // Try to disconnect the session using the proper API
      try {
        // Try direct disconnect method first
        if (typeof (sessionRef.current as any).disconnect === "function") {
          await (sessionRef.current as any).disconnect();
        } else if (typeof (sessionRef.current as any).close === "function") {
          await (sessionRef.current as any).close();
        } else {
          // Fallback to transport layer
          const transport = (sessionRef.current as any).transport;
          if (transport && typeof transport.disconnect === "function") {
            await transport.disconnect();
          }
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

      // Clear session ID from sessionStorage
      if (typeof window !== "undefined") {
        sessionStorage.removeItem(VOICE_SESSION_ID_KEY);
      }

      setStatus("idle");
      setHistory([]);
      setError(null);
      setErrorType(null);
      toolCallsCountRef.current = 0;
      chimePlayedRef.current = false; // Reset chime flag on disconnect

      // Reset disconnecting flag after a short delay to allow any pending errors to be suppressed
      setTimeout(() => {
        isDisconnectingRef.current = false;
      }, 1000);
    }
  }, []);

  // Listen for agent-triggered session end events
  useEffect(() => {
    const handleSessionEnd = () => {
      disconnect();
    };

    window.addEventListener(VOICE_SESSION_END_EVENT, handleSessionEnd);
    return () => {
      window.removeEventListener(VOICE_SESSION_END_EVENT, handleSessionEnd);
    };
  }, [disconnect]);

  useEffect(() => {
    return () => {
      if (sessionRef.current) {
        // Try to disconnect the session using the proper API
        try {
          // Try direct disconnect method first
          if (typeof (sessionRef.current as any).disconnect === "function") {
            (sessionRef.current as any).disconnect().catch(() => {});
          } else if (typeof (sessionRef.current as any).close === "function") {
            (sessionRef.current as any).close().catch(() => {});
          } else {
            // Fallback to transport layer
            const transport = (sessionRef.current as any).transport;
            if (transport && typeof transport.disconnect === "function") {
              transport.disconnect().catch(() => {});
            }
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
    <div className="space-y-4">
      <ConnectCalendarBadge />

      <div className="p-4 border rounded-lg">
        <div className="text-lg mb-4">
          Status: <span className="font-semibold">{status}</span>
        </div>

        {error && (
          <div
            className={`p-4 rounded mb-4 ${
              errorType === "microphone"
                ? "bg-amber-50 border-2 border-amber-300 text-amber-800"
                : errorType === "api_key"
                ? "bg-red-50 border-2 border-red-300 text-red-800"
                : errorType === "network"
                ? "bg-blue-50 border-2 border-blue-300 text-blue-800"
                : "bg-red-50 border-2 border-red-300 text-red-800"
            }`}
          >
            <div className="flex items-start gap-2">
              <span className="text-xl flex-shrink-0">
                {errorType === "microphone" ? (
                  <span title="Microphone Error">🎤</span>
                ) : errorType === "api_key" ? (
                  <span title="API Key Error">🔑</span>
                ) : errorType === "network" ? (
                  <span title="Network Error">🌐</span>
                ) : (
                  <span title="Error">⚠️</span>
                )}
              </span>
              <div className="flex-1">
                <div className="font-semibold mb-1">
                  {errorType === "microphone"
                    ? "Microphone Access Error"
                    : errorType === "api_key"
                    ? "API Key Error"
                    : errorType === "network"
                    ? "Network Error"
                    : "Error"}
                </div>
                <div className="text-sm">{error}</div>
                {errorType === "microphone" && (
                  <div className="mt-2 text-xs">
                    <p className="font-medium">How to fix:</p>
                    <ul className="list-disc list-inside mt-1 space-y-1">
                      <li>Click the lock icon in your browser's address bar</li>
                      <li>Allow microphone access for this site</li>
                      <li>Refresh the page and try again</li>
                    </ul>
                  </div>
                )}
                {errorType === "api_key" && (
                  <div className="mt-2 text-xs">
                    <p className="font-medium">How to fix:</p>
                    <ul className="list-disc list-inside mt-1 space-y-1">
                      <li>
                        Contact your administrator to verify the OpenAI API key
                      </li>
                      <li>Ensure the API key has access to the Realtime API</li>
                      <li>Check if the API key has expired or been revoked</li>
                    </ul>
                  </div>
                )}
                {errorType === "network" && (
                  <div className="mt-2 text-xs">
                    <p className="font-medium">How to fix:</p>
                    <ul className="list-disc list-inside mt-1 space-y-1">
                      <li>Check your internet connection</li>
                      <li>Try refreshing the page</li>
                      <li>Check if you're behind a firewall or VPN</li>
                    </ul>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {status === "idle" || status === "error" ? (
          <>
            {!isGoogleCalendarConnected ? (
              <div className="space-y-2">
                <p className="text-sm text-gray-600 mb-2">
                  Please connect your Google Calendar first before starting a
                  voice session.
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
            className="px-6 py-3 bg-red-600 text-white rounded-lg hover:bg-red-700 font-semibold"
          >
            Stop Voice Session
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
  );
}
