import { Response } from "express";
import { z } from "zod";
import { sendSuccess, sendError } from "@/utils/apiResponse";
import { AuthRequest } from "@/middleware/authMiddleware";
import {
  followUserService,
  unfollowUserService,
  getFollowingsCountService,
  getFollowersCountService,
  getFollowedUsersPaginatedService,
  getFollowersPaginatedService,
  checkFollowStatusService,
  isFriendService,
  type FollowedUser,
} from "@/services/followsService";

const followUserSchema = z.object({
  followingId: z.string().uuid("Invalid user ID"),
});

export const followUser = async (
  req: AuthRequest,
  res: Response
): Promise<void> => {
  try {
    if (!req.user) {
      sendError(res, 401, "Authentication required");
      return;
    }

    const parsed = followUserSchema.safeParse(req.body);
    if (!parsed.success) {
      const fieldErrors: Record<string, string[]> = {};
      parsed.error.errors.forEach((err) => {
        const field = err.path.join(".");
        if (!fieldErrors[field]) fieldErrors[field] = [];
        fieldErrors[field].push(err.message);
      });
      sendError(res, 422, "Validation failed", fieldErrors);
      return;
    }

    // Prevent self-follow
    if (req.user.userId === parsed.data.followingId) {
      sendError(res, 400, "Cannot follow yourself");
      return;
    }

    // Directly follow user (one-way relationship, not friend request)
    // ⚠️ CRITICAL: This should ONLY create entry in follows table, NOT in friend_requests table
    // This endpoint is for one-way follow relationships only
    // Friend requests should be handled by /api/friend-requests endpoint
    console.log(`[followUser controller] ==========================================`);
    console.log(`[followUser controller] FOLLOW REQUEST: ${req.user.userId} -> ${parsed.data.followingId}`);
    console.log(`[followUser controller] ⚠️ CRITICAL: This should NOT create any friend_requests entry`);
    console.log(`[followUser controller] ==========================================`);
    
    const result = await followUserService(req.user.userId, parsed.data.followingId);
    
    console.log(`[followUser controller] ==========================================`);
    console.log(`[followUser controller] Follow service completed. Follow ID: ${result.followId}`);
    
    // FINAL VERIFICATION: Check if friend request was created (should NOT happen)
    try {
      const sequelize = (await import("database")).default;
      const { QueryTypes } = await import("sequelize");
      const [verifyFriendRequest] = await sequelize.query(
        `SELECT id, requester_id, receiver_id, status, created_at 
         FROM friend_requests 
         WHERE ((requester_id = $1 AND receiver_id = $2) OR (requester_id = $2 AND receiver_id = $1))
         AND deleted_at IS NULL 
         AND created_at > NOW() - INTERVAL '10 seconds'
         ORDER BY created_at DESC
         LIMIT 1`,
        { bind: [req.user.userId, parsed.data.followingId], type: QueryTypes.SELECT }
      ) as any[];
      
      if (verifyFriendRequest && verifyFriendRequest.length > 0) {
        console.error(`[followUser controller] ❌❌❌ CRITICAL ERROR DETECTED! ❌❌❌`);
        console.error(`[followUser controller] Friend request was created when it should NOT have been!`);
        console.error(`[followUser controller] Friend request details:`, JSON.stringify(verifyFriendRequest, null, 2));
        console.error(`[followUser controller] This indicates a DATABASE TRIGGER or other automatic mechanism!`);
        console.error(`[followUser controller] Please check database triggers using check-and-remove-triggers.sql`);
      } else {
        console.log(`[followUser controller] ✅ Final verification: No friend request created (correct)`);
      }
    } catch (verifyError) {
      console.error(`[followUser controller] Error during verification:`, verifyError);
    }
    console.log(`[followUser controller] ==========================================`);

    // Create notification for receiver
    try {
      const { createNotificationService } = await import("@/services/notificationsService");
      await createNotificationService({
        userId: parsed.data.followingId,
        actorId: req.user.userId,
        type: "USER_FOLLOWED",
        referenceId: result.followId,
        referenceType: "USER",
      });

      // Emit socket notification
      try {
        const socketModule = await import("@/index");
        const socketService = socketModule.socketService;
        if (socketService) {
          // Emit notification event (for notification dropdown)
          socketService.emitNotification(parsed.data.followingId, {
            type: "new-notification",
          });
        }
      } catch (socketError) {
        console.error("Error emitting notification socket:", socketError);
      }
    } catch (notifError) {
      console.error("Error creating follow notification:", notifError);
    }

    sendSuccess(res, 200, "User followed successfully", result);
  } catch (error: unknown) {
    const err = error as { statusCode?: number; message?: string };
    if (err.statusCode) {
      sendError(res, err.statusCode, err.message || "Something went wrong");
      return;
    }
    console.error("Follow user error:", error);
    sendError(res, 500, "Internal server error");
  }
};

export const removeFollower = async (
  req: AuthRequest,
  res: Response
): Promise<void> => {
  try {
    if (!req.user) {
      sendError(res, 401, "Authentication required");
      return;
    }

    const followerId = req.params.followerId;
    if (!followerId) {
      sendError(res, 400, "Follower ID is required");
      return;
    }

    // Remove the follow: they follow me → delete that follow row
    await unfollowUserService(followerId, req.user.userId);

    try {
      const socketModule = await import("@/index");
      const socketService = socketModule.socketService;
      if (socketService) {
        socketService.emitFollowersFollowingUpdate([req.user.userId, followerId]);
      }
    } catch (socketError) {
      console.error("Error emitting followers-following update:", socketError);
    }

    sendSuccess(res, 200, "Follower removed successfully");
  } catch (error: unknown) {
    const err = error as { statusCode?: number; message?: string };
    if (err.statusCode) {
      sendError(res, err.statusCode, err.message || "Something went wrong");
      return;
    }
    console.error("Remove follower error:", error);
    sendError(res, 500, "Internal server error");
  }
};

export const unfollowUser = async (
  req: AuthRequest,
  res: Response
): Promise<void> => {
  try {
    if (!req.user) {
      sendError(res, 401, "Authentication required");
      return;
    }

    const followingId = req.params.followingId;
    if (!followingId) {
      sendError(res, 400, "Following ID is required");
      return;
    }

    await unfollowUserService(req.user.userId, followingId);

    try {
      const socketModule = await import("@/index");
      const socketService = socketModule.socketService;
      if (socketService) {
        socketService.emitFollowersFollowingUpdate([req.user.userId, followingId]);
      }
    } catch (socketError) {
      console.error("Error emitting followers-following update:", socketError);
    }

    sendSuccess(res, 200, "User unfollowed successfully");
  } catch (error: unknown) {
    const err = error as { statusCode?: number; message?: string };
    if (err.statusCode) {
      sendError(res, err.statusCode, err.message || "Something went wrong");
      return;
    }
    console.error("Unfollow user error:", error);
    sendError(res, 500, "Internal server error");
  }
};

export const getFollowingsCount = async (
  req: AuthRequest,
  res: Response
): Promise<void> => {
  try {
    if (!req.user) {
      sendError(res, 401, "Authentication required");
      return;
    }

    const [followingCount, followersCount] = await Promise.all([
      getFollowingsCountService(req.user.userId),
      getFollowersCountService(req.user.userId),
    ]);

    sendSuccess(res, 200, "Follow counts fetched successfully", {
      count: followingCount,
      followingCount,
      followersCount,
    });
  } catch (error: unknown) {
    const err = error as { statusCode?: number; message?: string };
    if (err.statusCode) {
      sendError(res, err.statusCode, err.message || "Something went wrong");
      return;
    }
    console.error("Get followings count error:", error);
    sendError(res, 500, "Internal server error");
  }
};

export const getFollowedUsers = async (
  req: AuthRequest,
  res: Response
): Promise<void> => {
  try {
    if (!req.user) {
      sendError(res, 401, "Authentication required");
      return;
    }

    const limit = Math.min(parseInt(String(req.query.limit || "10"), 10) || 10, 50);
    const cursor = typeof req.query.cursor === "string" ? req.query.cursor : undefined;
    const search = typeof req.query.search === "string" ? req.query.search : typeof req.query.q === "string" ? req.query.q : undefined;
    const result = await getFollowedUsersPaginatedService(req.user.userId, limit, cursor, search);
    const users = (result.users || []).map((u: FollowedUser) => ({
      id: u.id,
      username: u.username,
      image: u.image ?? "",
      is_verified: u.is_verified,
      followed_at: u.followed_at ?? null,
    }));
    const data = {
      users,
      nextCursor: result.nextCursor ?? null,
      hasMore: result.hasMore === true,
    };
    sendSuccess(res, 200, "Followed users fetched successfully", data);
  } catch (error: unknown) {
    const err = error as { statusCode?: number; message?: string };
    if (err.statusCode) {
      sendError(res, err.statusCode, err.message || "Something went wrong");
      return;
    }
    console.error("Get followed users error:", error);
    sendError(res, 500, "Internal server error");
  }
};

/** GET my followers (who follows me). Cursor-based pagination for infinite scroll. */
export const getFollowers = async (
  req: AuthRequest,
  res: Response
): Promise<void> => {
  try {
    if (!req.user) {
      sendError(res, 401, "Authentication required");
      return;
    }

    const limit = Math.min(parseInt(String(req.query.limit || "10"), 10) || 10, 50);
    const cursor = typeof req.query.cursor === "string" ? req.query.cursor : undefined;
    const search = typeof req.query.search === "string" ? req.query.search : typeof req.query.q === "string" ? req.query.q : undefined;
    const result = await getFollowersPaginatedService(req.user.userId, limit, cursor, search);
    const users = (result.users || []).map((u: FollowedUser) => ({
      id: u.id,
      username: u.username,
      image: u.image ?? "",
      is_verified: u.is_verified,
      followed_at: u.followed_at ?? null,
    }));
    const data = {
      users,
      nextCursor: result.nextCursor ?? null,
      hasMore: result.hasMore === true,
    };
    sendSuccess(res, 200, "Followers fetched successfully", data);
  } catch (error: unknown) {
    const err = error as { statusCode?: number; message?: string };
    if (err.statusCode) {
      sendError(res, err.statusCode, err.message || "Something went wrong");
      return;
    }
    console.error("Get followers error:", error);
    sendError(res, 500, "Internal server error");
  }
};

export const checkFollowStatus = async (
  req: AuthRequest,
  res: Response
): Promise<void> => {
  try {
    if (!req.user) {
      sendError(res, 401, "Authentication required");
      return;
    }

    const userIdsParam = req.query.userIds;
    if (!userIdsParam || typeof userIdsParam !== "string") {
      sendError(res, 400, "User IDs are required");
      return;
    }

    const userIds = userIdsParam.split(",").filter((id) => id.trim() !== "");

    if (userIds.length === 0) {
      sendSuccess(res, 200, "Follow status checked", { userIds: [] });
      return;
    }

    const followedUserIds = await checkFollowStatusService(
      req.user.userId,
      userIds
    );

    sendSuccess(res, 200, "Follow status checked", {
      userIds: followedUserIds,
    });
  } catch (error: unknown) {
    const err = error as { statusCode?: number; message?: string };
    if (err.statusCode) {
      sendError(res, err.statusCode, err.message || "Something went wrong");
      return;
    }
    console.error("Check follow status error:", error);
    sendError(res, 500, "Internal server error");
  }
};

export const checkIsFriend = async (
  req: AuthRequest,
  res: Response
): Promise<void> => {
  try {
    if (!req.user) {
      sendError(res, 401, "Authentication required");
      return;
    }

    const targetUserId = req.params.userId;
    if (!targetUserId) {
      sendError(res, 400, "User ID is required");
      return;
    }

    const isFriend = await isFriendService(req.user.userId, targetUserId);

    sendSuccess(res, 200, "Friend status checked", { isFriend });
  } catch (error: unknown) {
    const err = error as { statusCode?: number; message?: string };
    if (err.statusCode) {
      sendError(res, err.statusCode, err.message || "Something went wrong");
      return;
    }
    console.error("Check is friend error:", error);
    sendError(res, 500, "Internal server error");
  }
};

