"use server";

import { auth } from "@clerk/nextjs/server";
import { client } from "@/lib/convex";
import { api } from "convex/_generated/api";
import { randomUUID } from "crypto";

/**
 * Mints an ephemeral client secret for OpenAI Realtime API
 * This allows the client to connect securely via WebRTC
 */
export async function getEphemeralToken() {
  const { userId } = await auth();

  if (!userId) {
    throw new Error("Unauthorized");
  }

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error("OPENAI_API_KEY not configured");
  }

  const response = await fetch(
    "https://api.openai.com/v1/realtime/client_secrets",
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        session: {
          type: "realtime",
          model: "gpt-realtime-mini-2025-10-06",
        },
      }),
    }
  );

  if (!response.ok) {
    let errorMessage = "Failed to mint ephemeral token";
    let errorDetails: any = null;

    try {
      // Try to parse JSON error response from OpenAI
      errorDetails = await response.json();
      if (errorDetails?.error) {
        const openAIError = errorDetails.error;
        errorMessage = openAIError.message || errorMessage;

        // Provide more specific error messages based on error type
        if (openAIError.type === "invalid_request_error") {
          if (
            errorMessage.includes("permission") ||
            errorMessage.includes("Permission")
          ) {
            errorMessage = `Permission denied: ${errorMessage}. Please check your OpenAI API key permissions and ensure you have access to the Realtime API.`;
          } else {
            errorMessage = `Invalid request: ${errorMessage}`;
          }
        } else if (openAIError.type === "authentication_error") {
          errorMessage = `Authentication failed: ${errorMessage}. Please check your OpenAI API key.`;
        } else if (openAIError.type === "rate_limit_error") {
          errorMessage = `Rate limit exceeded: ${errorMessage}. Please try again later.`;
        } else if (openAIError.type === "server_error") {
          errorMessage = `OpenAI server error: ${errorMessage}. Please try again later.`;
        }
      }
    } catch {
      // If JSON parsing fails, try to get text response
      try {
        const errorText = await response.text();
        if (errorText) {
          errorMessage = `Failed to mint ephemeral token: ${errorText}`;
        }
      } catch {
        errorMessage = `Failed to mint ephemeral token: HTTP ${response.status} ${response.statusText}`;
      }
    }

    const error = new Error(errorMessage);
    (error as any).statusCode = response.status;
    (error as any).details = errorDetails;
    throw error;
  }

  const data = await response.json();
  return data.value; // Returns the ephemeral key starting with "ek_"
}

/**
 * Create a new voice session in Convex
 */
export async function createVoiceSession() {
  const { userId } = await auth();

  if (!userId) {
    throw new Error("Unauthorized");
  }

  const sessionId = randomUUID();

  try {
    await client.mutation(api.tokens.createVoiceSession, {
      clerkUserId: userId,
      sessionId,
    });
  } catch (err) {
    const errorMessage =
      err instanceof Error
        ? err.message
        : "Failed to create voice session in database";
    throw new Error(`Database error: ${errorMessage}`);
  }

  return sessionId;
}

/**
 * Update voice session (end session or increment tool calls)
 */
export async function updateVoiceSession(
  sessionId: string,
  updates: {
    endedAt?: number;
    toolCallsCount?: number;
  }
) {
  const { userId } = await auth();

  if (!userId) {
    throw new Error("Unauthorized");
  }

  try {
    await client.mutation(api.tokens.updateVoiceSession, {
      clerkUserId: userId,
      sessionId,
      endedAt: updates.endedAt,
      toolCallsCount: updates.toolCallsCount,
    });
  } catch (err) {
    console.error("Failed to update voice session:", err);
    throw new Error(
      err instanceof Error
        ? `Failed to update voice session: ${err.message}`
        : "Failed to update voice session"
    );
  }
}
