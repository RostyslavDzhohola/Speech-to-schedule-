"use client";

import { useQuery } from "convex/react";
import { api } from "convex/_generated/api";
import { useAuth } from "@clerk/nextjs";
import { useState, useEffect } from "react";

export function ConnectCalendarBadge() {
  const { userId } = useAuth();
  const tokens = useQuery(
    api.tokens.getUserTokens,
    userId ? { clerkUserId: userId } : "skip"
  );
  const [isConnecting, setIsConnecting] = useState(false);
  const [isDisconnecting, setIsDisconnecting] = useState(false);
  const [isValidating, setIsValidating] = useState(false);
  const [connectionStatus, setConnectionStatus] = useState<{
    connected: boolean;
    valid: boolean;
  } | null>(null);

  // Validate connection when tokens exist
  useEffect(() => {
    if (!userId || !tokens) {
      setConnectionStatus({ connected: false, valid: false });
      return;
    }

    const validateConnection = async () => {
      setIsValidating(true);
      try {
        const response = await fetch("/api/calendar/validate");
        const data = await response.json();

        if (response.ok && data.connected && data.valid) {
          setConnectionStatus({ connected: true, valid: true });
        } else {
          // Token exists but is invalid - it will be deleted by the validation endpoint
          setConnectionStatus({ connected: false, valid: false });
        }
      } catch (error) {
        console.error("Failed to validate connection:", error);
        setConnectionStatus({ connected: false, valid: false });
      } finally {
        setIsValidating(false);
      }
    };

    validateConnection();
  }, [userId, tokens]);

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

  const handleDisconnect = async () => {
    if (!userId) return;

    setIsDisconnecting(true);
    try {
      const response = await fetch("/api/calendar/disconnect", {
        method: "POST",
      });
      const data = await response.json();

      if (response.ok && data.disconnected) {
        // Update connection status
        setConnectionStatus({ connected: false, valid: false });
      } else {
        console.error("Failed to disconnect:", data.error);
      }
    } catch (error) {
      console.error("Failed to disconnect:", error);
    } finally {
      setIsDisconnecting(false);
    }
  };

  // Determine connection status
  const isConnected =
    connectionStatus?.connected && connectionStatus?.valid && !isValidating;
  const showConnecting = isConnecting || isValidating;

  return (
    <div className="flex items-center gap-4 p-4 border rounded-lg">
      <div className="flex items-center gap-2">
        <div
          className={`w-3 h-3 rounded-full ${
            isConnected ? "bg-green-500" : "bg-gray-400"
          }`}
        />
        <span className="font-medium">
          {showConnecting
            ? "Validating connection..."
            : isConnected
            ? "Google Calendar Connected"
            : "Google Calendar Not Connected"}
        </span>
      </div>

      {isConnected && !showConnecting && (
        <button
          onClick={handleDisconnect}
          disabled={isDisconnecting}
          className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:opacity-50"
        >
          {isDisconnecting ? "Disconnecting..." : "Disconnect"}
        </button>
      )}

      {!isConnected && !showConnecting && (
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
