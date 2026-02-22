import { Response } from "express";
import { z } from "zod";
import { sendSuccess, sendError } from "@/utils/apiResponse";
import { AuthRequest } from "@/middleware/authMiddleware";
import {
  followUserService,
  unfollowUserService,
  getFollowingsCountService,
  getFollowedUsersService,
  getFollowersService,
  checkFollowStatusService,
} from "@/services/followsService";
import { sendFriendRequestService } from "@/services/friendRequestsService";

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

    // Send friend request instead of directly following
    const result = await sendFriendRequestService(
      req.user.userId,
      parsed.data.followingId
    );

    // Create notification for receiver
    try {
      const { createNotificationService } = await import("@/services/notificationsService");
      await createNotificationService({
        userId: parsed.data.followingId,
        actorId: req.user.userId,
        type: "USER_FOLLOWED",
        referenceId: result.requestId,
        referenceType: "USER",
      });

      // Emit socket notification
      try {
        const socketModule = await import("@/index");
        const socketService = socketModule.socketService;
        if (socketService) {
          // Get requester info for the socket event
          const { QueryTypes } = await import("sequelize");
          const sequelize = (await import("database")).default;
          const [requesterInfo] = await sequelize.query(
            `SELECT 
              u.id,
              u.username,
              COALESCE(o.image, u.image) as image,
              COALESCE(u.is_verified_email, false) as is_verified
            FROM users u
            LEFT JOIN onboarding o ON u.id = o.user_id AND o.deleted_at IS NULL
            WHERE u.id = $1 AND u.deleted_at IS NULL
            LIMIT 1`,
            { bind: [req.user.userId], type: QueryTypes.SELECT }
          ) as any[];

          socketService.emitNotification(parsed.data.followingId, {
            type: "new-notification",
          });

          // Emit friend request event with complete data
          if (requesterInfo) {
            socketService.emitFriendRequest(parsed.data.followingId, {
              type: "friend-request-received",
              request: {
                id: result.requestId,
                requester_id: req.user.userId,
                receiver_id: parsed.data.followingId,
                status: "PENDING",
                created_at: new Date().toISOString(),
                updated_at: new Date().toISOString(),
                requester: {
                  id: requesterInfo.id,
                  username: requesterInfo.username,
                  image: requesterInfo.image,
                  is_verified: requesterInfo.is_verified,
                },
              },
            });
            console.log(`📤 Emitted friend request to user ${parsed.data.followingId} via socket`);
          }
        }
      } catch (socketError) {
        console.error("Error emitting notification socket:", socketError);
      }
    } catch (notifError) {
      console.error("Error creating friend request notification:", notifError);
    }

    sendSuccess(res, 200, "Friend request sent successfully", result);
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

    const count = await getFollowingsCountService(req.user.userId);

    sendSuccess(res, 200, "Followings count fetched successfully", {
      count,
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

    const users = await getFollowedUsersService(req.user.userId);

    sendSuccess(res, 200, "Followed users fetched successfully", {
      users,
    });
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

/** GET my followers (who follows me). Use this for the "follower screen" - initially shows only users who already follow you. */
export const getFollowers = async (
  req: AuthRequest,
  res: Response
): Promise<void> => {
  try {
    if (!req.user) {
      sendError(res, 401, "Authentication required");
      return;
    }

    const limit = Math.min(parseInt(String(req.query.limit || "10"), 10) || 10, 100);
    const users = await getFollowersService(req.user.userId, limit);

    sendSuccess(res, 200, "Followers fetched successfully", {
      users,
    });
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

