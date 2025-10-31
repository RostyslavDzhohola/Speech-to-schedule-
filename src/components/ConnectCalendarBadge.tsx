"use client";

import { useQuery } from "convex/react";
import { api } from "convex/_generated/api";
import { useAuth } from "@clerk/nextjs";
import { useState } from "react";

export function ConnectCalendarBadge() {
  const { userId } = useAuth();
  const tokens = useQuery(
    api.tokens.getUserTokens,
    userId ? { clerkUserId: userId } : "skip"
  );
  const [isConnecting, setIsConnecting] = useState(false);

  const handleConnect = async () => {
    if (!userId) return;

    setIsConnecting(true);
    try {
      const response = await fetch("/api/google/oauth/url");
      const data = await response.json();

      if (data.authUrl) {
        window.location.href = data.authUrl;
      } else {
        console.error("Failed to get auth URL");
        setIsConnecting(false);
      }
    } catch (error) {
      console.error("Failed to connect:", error);
      setIsConnecting(false);
    }
  };

  const isConnected = !!tokens;

  return (
    <div className="flex items-center gap-4 p-4 border rounded-lg">
      <div className="flex items-center gap-2">
        <div
          className={`w-3 h-3 rounded-full ${
            isConnected ? "bg-green-500" : "bg-gray-400"
          }`}
        />
        <span className="font-medium">
          {isConnected
            ? "Google Calendar Connected"
            : "Google Calendar Not Connected"}
        </span>
      </div>

      {!isConnected && (
        <button
          onClick={handleConnect}
          disabled={isConnecting}
          className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
        >
          {isConnecting ? "Connecting..." : "Connect Google Calendar"}
        </button>
      )}
    </div>
  );
}
