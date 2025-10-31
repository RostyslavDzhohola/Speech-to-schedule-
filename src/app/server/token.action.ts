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
    const error = await response.text();
    throw new Error(`Failed to mint ephemeral token: ${error}`);
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

  await client.mutation(api.tokens.createVoiceSession, {
    clerkUserId: userId,
    sessionId,
  });

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

  await client.mutation(api.tokens.updateVoiceSession, {
    clerkUserId: userId,
    sessionId,
    endedAt: updates.endedAt,
    toolCallsCount: updates.toolCallsCount,
  });
}
