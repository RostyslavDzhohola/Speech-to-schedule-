/**
 * Error type classification for voice agent errors
 */
export type ErrorType = "microphone" | "api_key" | "network" | "unknown";

/**
 * Normalizes error messages from various error shapes (string, Error object, nested objects)
 * Always returns a string to prevent TypeError when calling string methods
 */
export function normalizeErrorMessage(err: any): string {
  if (!err) {
    return "Unknown error";
  }

  if (typeof err === "string") {
    return err;
  }

  if (err instanceof Error) {
    return err.message || "Error occurred";
  }

  // Handle nested error objects
  if (typeof err === "object") {
    if (err.message) {
      return typeof err.message === "string"
        ? err.message
        : String(err.message);
    }
    if (err.error) {
      const nestedError = err.error;
      if (typeof nestedError === "string") {
        return nestedError;
      }
      if (nestedError?.message) {
        return typeof nestedError.message === "string"
          ? nestedError.message
          : String(nestedError.message);
      }
    }
    // Try to stringify if it's a plain object
    try {
      const stringified = JSON.stringify(err);
      if (stringified !== "{}") {
        return stringified;
      }
    } catch {
      // If stringification fails, fall through to String(err)
    }
  }

  return String(err);
}

/**
 * Checks microphone access and permissions
 * Returns null if access is available, or an error message string if not
 */
export async function checkMicrophoneAccess(): Promise<{
  error: string;
  type: "microphone";
} | null> {
  // Check if mediaDevices API is available
  if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
    return {
      error:
        "Microphone access is not available in this browser. Please use a modern browser that supports microphone access.",
      type: "microphone",
    };
  }

  try {
    // Attempt to get microphone access
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    // If successful, stop the stream immediately (we just needed to check permissions)
    stream.getTracks().forEach((track) => track.stop());
    return null; // No error, microphone is accessible
  } catch (err: any) {
    const errorName = err?.name || "";
    const errorMessage = normalizeErrorMessage(err);

    // Handle specific permission errors
    if (
      errorName === "NotAllowedError" ||
      errorName === "PermissionDeniedError"
    ) {
      return {
        error:
          "Microphone permission denied. Please grant microphone access in your browser settings and try again.",
        type: "microphone",
      };
    }

    if (errorName === "NotFoundError" || errorName === "DevicesNotFoundError") {
      return {
        error:
          "No microphone found. Please connect a microphone and refresh the page.",
        type: "microphone",
      };
    }

    if (errorName === "NotReadableError" || errorName === "TrackStartError") {
      return {
        error:
          "Microphone is already in use by another application. Please close other applications using the microphone and try again.",
        type: "microphone",
      };
    }

    if (errorName === "OverconstrainedError") {
      return {
        error:
          "Microphone constraints could not be satisfied. Please check your microphone settings.",
        type: "microphone",
      };
    }

    // Generic microphone error
    return {
      error: `Microphone access error: ${errorMessage}. Please check your microphone permissions and settings.`,
      type: "microphone",
    };
  }
}

/**
 * Classifies error type based on error message content
 */
export function classifyErrorType(errorMessage: string, source?: string): ErrorType {
  const lowerMessage = errorMessage.toLowerCase();

  // Check for API key related errors
  if (
    lowerMessage.includes("api key") ||
    lowerMessage.includes("authentication") ||
    lowerMessage.includes("unauthorized") ||
    lowerMessage.includes("invalid api key") ||
    lowerMessage.includes("ephemeral token") ||
    source === "getEphemeralToken"
  ) {
    return "api_key";
  }

  // Check for microphone/audio errors
  if (
    lowerMessage.includes("microphone") ||
    lowerMessage.includes("audio") ||
    lowerMessage.includes("permission denied") ||
    lowerMessage.includes("getusermedia")
  ) {
    return "microphone";
  }

  // Check for network errors
  if (
    lowerMessage.includes("network") ||
    lowerMessage.includes("webrtc") ||
    lowerMessage.includes("connection") ||
    lowerMessage.includes("timeout") ||
    lowerMessage.includes("fetch")
  ) {
    return "network";
  }

  return "unknown";
}

