"use client";

import { SignedIn, SignedOut, SignInButton } from "@clerk/nextjs";
import dynamic from "next/dynamic";
import { useState } from "react";
import { useQuery } from "convex/react";
import { api } from "convex/_generated/api";
import { useAuth } from "@clerk/nextjs";

// Defer heavy realtime SDK until needed
const VoiceConsole = dynamic(
  () =>
    import("@/components/VoiceConsole").then((mod) => ({
      default: mod.VoiceConsole,
    })),
  {
    ssr: false,
    loading: () => (
      <div className="p-4 border rounded-lg">
        <div className="text-gray-600">Preparing voice agent…</div>
      </div>
    ),
  }
);

export default function Home() {
  const { userId } = useAuth();
  const [refreshTrigger, setRefreshTrigger] = useState(0);
  const tokens = useQuery(
    api.tokens.getUserTokens,
    userId ? { clerkUserId: userId } : "skip"
  );
  const isGoogleCalendarConnected = !!tokens;

  return (
    <main className="flex min-h-screen flex-col">
      {/* Hero */}
      <section className="px-6 pt-20 pb-12 sm:pt-28 sm:pb-16">
        <div className="max-w-6xl mx-auto">
          <div className="text-center">
            <h1 className="text-5xl sm:text-6xl font-extrabold tracking-tight mb-4 bg-gradient-to-b from-slate-900 to-slate-600 text-transparent bg-clip-text">
              Your Calendar, Powered by Voice
            </h1>
            <p className="mx-auto max-w-2xl text-lg text-slate-600">
              Create, update, and manage Google Calendar using natural speech. A
              focused agent that understands time, attendees, and your intent.
            </p>
          </div>

          <div className="mt-8 flex flex-col items-center gap-4">
            <SignedOut>
              <div className="flex flex-col items-center gap-4">
                <p className="text-slate-600">
                  Sign in to start talking to your calendar.
                </p>
                <SignInButton mode="modal">
                  <button className="px-6 py-3 rounded-lg bg-blue-600 text-white hover:bg-blue-700">
                    Sign In
                  </button>
                </SignInButton>
              </div>
            </SignedOut>

            <SignedIn>
              {/* Calendar connection badge is shown in the VoiceConsole component */}
            </SignedIn>
          </div>
        </div>
      </section>

      {/* Live Voice Console for signed-in users */}
      <SignedIn>
        <section className="px-6 pb-8">
          <div className="max-w-6xl mx-auto grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div className="bg-white/70 backdrop-blur supports-[backdrop-filter]:bg-white/60 border rounded-xl p-6">
              <div className="mb-4">
                <h2 className="text-xl font-semibold">Talk to your calendar</h2>
                <p className="text-sm text-slate-600">
                  Press start and say things like “Schedule standup tomorrow at
                  9am”, “Move lunch with Alex to Friday”, or “What&apos;s on my
                  calendar next Tuesday?”.
                </p>
              </div>
              <VoiceConsole
                isGoogleCalendarConnected={isGoogleCalendarConnected}
                onRefreshTrigger={() => setRefreshTrigger((v) => v + 1)}
              />
            </div>

            <div className="rounded-xl p-6 border bg-white">
              <h3 className="text-lg font-semibold mb-3">What you can say</h3>
              <ul className="space-y-2 text-sm text-slate-700">
                <li>• “Create event ‘Team Sync’ tomorrow 10 to 10:30”</li>
                <li>• “Find meetings with Sarah next week”</li>
                <li>
                  • “Rename ‘1:1 John’ to ‘Mentorship’ and add a Zoom link”
                </li>
                <li>• “Delete my dentist appointment on the 21st”</li>
              </ul>
              <div className="mt-4 text-xs text-slate-500">
                The agent confirms destructive actions and keeps a session log.
              </div>
            </div>
          </div>
        </section>
      </SignedIn>

      {/* Features */}
      <section className="px-6 py-12">
        <div className="max-w-6xl mx-auto">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="rounded-xl border bg-white p-6">
              <div className="text-2xl mb-2">🎤</div>
              <h3 className="font-semibold mb-1">Natural voice control</h3>
              <p className="text-sm text-slate-600">
                Built on a realtime agent that understands context, dates, and
                follow‑ups.
              </p>
            </div>
            <div className="rounded-xl border bg-white p-6">
              <div className="text-2xl mb-2">📅</div>
              <h3 className="font-semibold mb-1">Google Calendar native</h3>
              <p className="text-sm text-slate-600">
                Create, update, and delete events securely using your account.
              </p>
            </div>
            <div className="rounded-xl border bg-white p-6">
              <div className="text-2xl mb-2">⚡</div>
              <h3 className="font-semibold mb-1">Fast, focused, and safe</h3>
              <p className="text-sm text-slate-600">
                Confirmation on destructive actions and transparent history.
              </p>
            </div>
          </div>
        </div>
      </section>
    </main>
  );
}
