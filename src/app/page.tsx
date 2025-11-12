import { SignedIn, SignedOut, SignInButton } from "@clerk/nextjs";
import Link from "next/link";
import { ConnectCalendarBadge } from "@/components/ConnectCalendarBadge";

export default function Home() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center p-24">
      <div className="z-10 max-w-5xl w-full items-center justify-between font-mono text-sm">
        <h1 className="text-4xl font-bold text-center mb-8">
          Voice Calendar MVP
        </h1>

        <SignedOut>
          <div className="flex flex-col items-center gap-4">
            <p className="text-center text-gray-600 mb-4">
              Sign in to manage your Google Calendar with voice commands
            </p>
            <SignInButton mode="modal">
              <button className="px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700">
                Sign In
              </button>
            </SignInButton>
          </div>
        </SignedOut>

        <SignedIn>
          <div className="flex flex-col items-center gap-4">
            <ConnectCalendarBadge />
            <Link
              href="/voice-test"
              className="px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 text-center"
            >
              Start Voice Session
            </Link>
          </div>
        </SignedIn>
      </div>
    </main>
  );
}
