"use client";

import { SignedIn, SignedOut, SignInButton } from "@clerk/nextjs";
import { useState } from "react";
import dynamic from "next/dynamic";
import { EventsList } from "@/components/EventsList";
import { useQuery } from "convex/react";
import { api } from "convex/_generated/api";
import { useAuth } from "@clerk/nextjs";

// Dynamically import VoiceConsole to defer loading heavy WebRTC/Realtime SDK code
const VoiceConsole = dynamic(
  () =>
    import("@/components/VoiceConsole").then((mod) => ({
      default: mod.VoiceConsole,
    })),
  {
    ssr: false, // Don't render on server since it requires browser APIs
    loading: () => (
      <div className="p-4 border rounded-lg">
        <div className="text-gray-600">Loading voice interface...</div>
      </div>
    ),
  }
);

export default function VoiceTestPage() {
  const { userId } = useAuth();
  const [refreshTrigger, setRefreshTrigger] = useState(0);

  // Check if Google Calendar is connected
  const tokens = useQuery(
    api.tokens.getUserTokens,
    userId ? { clerkUserId: userId } : "skip"
  );
  const isGoogleCalendarConnected = !!tokens;

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
            <div>
              <VoiceConsole
                isGoogleCalendarConnected={isGoogleCalendarConnected}
                onRefreshTrigger={() => setRefreshTrigger((prev) => prev + 1)}
              />
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
