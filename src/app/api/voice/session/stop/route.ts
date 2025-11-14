import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { z } from "zod";
import { client } from "@/lib/convex";
import { api } from "convex/_generated/api";

const stopSessionSchema = z.object({
  sessionId: z.string().min(1),
});

/**
 * POST /api/voice/session/stop - End a voice session
 * Marks the session as ended in Convex database
 */
export async function POST(request: Request) {
  const { userId } = await auth();

  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = await request.json();
    const validated = stopSessionSchema.parse(body);

    // Update the voice session to mark it as ended
    await client.mutation(api.tokens.updateVoiceSession, {
      clerkUserId: userId,
      sessionId: validated.sessionId,
      endedAt: Date.now(),
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: "Invalid request", details: error.errors },
        { status: 400 }
      );
    }

    const errorMessage =
      error instanceof Error ? error.message : "Failed to end voice session";

    console.error("Voice session stop error:", error);
    return NextResponse.json(
      {
        error: errorMessage,
      },
      { status: 500 }
    );
  }
}
