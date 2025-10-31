import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export default defineSchema({
  googleOAuthTokens: defineTable({
    clerkUserId: v.string(),
    accessToken: v.string(),
    refreshToken: v.string(),
    expiryTimestamp: v.number(), // Unix timestamp when token expires
    createdAt: v.number(),
    updatedAt: v.number(),
  }).index("by_clerk_user_id", ["clerkUserId"]),

  actionLogs: defineTable({
    clerkUserId: v.string(),
    action: v.string(), // 'create', 'update', 'delete', 'list'
    eventId: v.optional(v.string()),
    details: v.optional(v.any()),
    timestamp: v.number(),
  }).index("by_clerk_user_id", ["clerkUserId"]),

  voiceSessions: defineTable({
    clerkUserId: v.string(),
    sessionId: v.string(),
    startedAt: v.number(),
    endedAt: v.optional(v.number()),
    toolCallsCount: v.number(),
  }).index("by_clerk_user_id", ["clerkUserId"]),
});
