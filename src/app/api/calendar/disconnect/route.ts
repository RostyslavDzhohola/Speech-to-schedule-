import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { client } from "@/lib/convex";
import { api } from "convex/_generated/api";

/**
 * POST /api/calendar/disconnect - Disconnect Google Calendar by deleting tokens
 */
export async function POST() {
  const { userId } = await auth();

  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    // Delete tokens from Convex
    await client.mutation(api.tokens.deleteUserTokens, {
      clerkUserId: userId,
    });

    return NextResponse.json({ success: true, disconnected: true });
  } catch (error: any) {
    console.error("Disconnect error:", error);
    return NextResponse.json(
      {
        error: error?.message || "Failed to disconnect Google Calendar",
      },
      { status: 500 }
    );
  }
}
