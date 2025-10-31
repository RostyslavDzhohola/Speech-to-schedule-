import { v } from "convex/values";
import { query, mutation } from "./_generated/server";

/**
 * Get Google OAuth tokens for a user
 */
export const getUserTokens = query({
  args: { clerkUserId: v.string() },
  handler: async (ctx, args) => {
    const tokens = await ctx.db
      .query("googleOAuthTokens")
      .withIndex("by_clerk_user_id", (q) =>
        q.eq("clerkUserId", args.clerkUserId)
      )
      .first();

    return tokens;
  },
});

/**
 * Store or update Google OAuth tokens for a user
 */
export const upsertUserTokens = mutation({
  args: {
    clerkUserId: v.string(),
    accessToken: v.string(),
    refreshToken: v.string(),
    expiryTimestamp: v.number(),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("googleOAuthTokens")
      .withIndex("by_clerk_user_id", (q) =>
        q.eq("clerkUserId", args.clerkUserId)
      )
      .first();

    const now = Date.now();

    if (existing) {
      await ctx.db.patch(existing._id, {
        accessToken: args.accessToken,
        refreshToken: args.refreshToken,
        expiryTimestamp: args.expiryTimestamp,
        updatedAt: now,
      });
      return existing._id;
    } else {
      return await ctx.db.insert("googleOAuthTokens", {
        clerkUserId: args.clerkUserId,
        accessToken: args.accessToken,
        refreshToken: args.refreshToken,
        expiryTimestamp: args.expiryTimestamp,
        createdAt: now,
        updatedAt: now,
      });
    }
  },
});

/**
 * Check if tokens are expired and need refresh
 */
export const refreshIfNeeded = query({
  args: { clerkUserId: v.string() },
  handler: async (ctx, args) => {
    const tokens = await ctx.db
      .query("googleOAuthTokens")
      .withIndex("by_clerk_user_id", (q) =>
        q.eq("clerkUserId", args.clerkUserId)
      )
      .first();

    if (!tokens) {
      return { needsRefresh: false, tokens: null };
    }

    // Check if token expires within 5 minutes (refresh proactively)
    const now = Date.now();
    const expiresIn = tokens.expiryTimestamp - now;
    const needsRefresh = expiresIn < 5 * 60 * 1000; // 5 minutes

    return {
      needsRefresh,
      tokens: needsRefresh ? tokens : null,
    };
  },
});

/**
 * Log a calendar action (create, update, delete, list)
 */
export const logAction = mutation({
  args: {
    clerkUserId: v.string(),
    action: v.string(), // 'create', 'update', 'delete', 'list'
    eventId: v.optional(v.string()),
    details: v.optional(v.any()),
  },
  handler: async (ctx, args) => {
    return await ctx.db.insert("actionLogs", {
      clerkUserId: args.clerkUserId,
      action: args.action,
      eventId: args.eventId,
      details: args.details,
      timestamp: Date.now(),
    });
  },
});

/**
 * Create a new voice session
 */
export const createVoiceSession = mutation({
  args: {
    clerkUserId: v.string(),
    sessionId: v.string(),
  },
  handler: async (ctx, args) => {
    return await ctx.db.insert("voiceSessions", {
      clerkUserId: args.clerkUserId,
      sessionId: args.sessionId,
      startedAt: Date.now(),
      toolCallsCount: 0,
    });
  },
});

/**
 * Update voice session (end session or increment tool calls)
 */
export const updateVoiceSession = mutation({
  args: {
    clerkUserId: v.string(),
    sessionId: v.string(),
    endedAt: v.optional(v.number()),
    toolCallsCount: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    // Find the session by clerkUserId and sessionId
    const session = await ctx.db
      .query("voiceSessions")
      .withIndex("by_clerk_user_id", (q) =>
        q.eq("clerkUserId", args.clerkUserId)
      )
      .filter((q) => q.eq(q.field("sessionId"), args.sessionId))
      .first();

    if (!session) {
      throw new Error("Voice session not found");
    }

    const updates: any = {};
    if (args.endedAt !== undefined) {
      updates.endedAt = args.endedAt;
    }
    if (args.toolCallsCount !== undefined) {
      updates.toolCallsCount = args.toolCallsCount;
    }

    await ctx.db.patch(session._id, updates);
    return session._id;
  },
});
