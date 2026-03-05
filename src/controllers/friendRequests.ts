import { Response } from "express";
import { z } from "zod";
import { sendSuccess, sendError } from "@/utils/apiResponse";
import { AuthRequest } from "@/middleware/authMiddleware";
import {
  sendFriendRequestService,
  acceptFriendRequestService,
  declineFriendRequestService,
  getFriendRequestsService,
  getSentFriendRequestsCountService,
  getSentFriendRequestsService,
  getFriendsService,
} from "@/services/friendRequestsService";

const sendFriendRequestSchema = z.object({
  receiverId: z.string().uuid("Invalid user ID"),
});

export const sendFriendRequest = async (
  req: AuthRequest,
  res: Response
): Promise<void> => {
  try {
    if (!req.user) {
      sendError(res, 401, "Authentication required");
      return;
    }

    const parsed = sendFriendRequestSchema.safeParse(req.body);
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

    // Prevent self-request
    if (req.user.userId === parsed.data.receiverId) {
      sendError(res, 400, "Cannot send friend request to yourself");
      return;
    }

    const result = await sendFriendRequestService(
      req.user.userId,
      parsed.data.receiverId
    );

    // If auto-accepted (mutual request), handle differently
    if (result.autoAccepted) {
      // Emit socket events for both users that they're now friends
      try {
        const socketModule = await import("@/index");
        const socketService = socketModule.socketService;
        if (socketService) {
          // Notify both users that they're now friends
          socketService.emitNotification(req.user.userId, {
            type: "friends-updated",
          });
          socketService.emitNotification(parsed.data.receiverId, {
            type: "friends-updated",
          });
          socketService.emitNotification(parsed.data.receiverId, {
            type: "new-notification",
          });
        }
      } catch (socketError) {
        console.error("Error emitting socket notification:", socketError);
      }

      // Create notifications for both users
      try {
        const { createNotificationService } = await import("@/services/notificationsService");
        await Promise.all([
          createNotificationService({
            userId: parsed.data.receiverId,
            actorId: req.user.userId,
            type: "FRIEND_REQUEST_ACCEPTED",
            referenceId: result.requestId,
            referenceType: "USER",
          }),
          createNotificationService({
            userId: req.user.userId,
            actorId: parsed.data.receiverId,
            type: "FRIEND_REQUEST_ACCEPTED",
            referenceId: result.requestId,
            referenceType: "USER",
          }),
        ]);
      } catch (notifError) {
        console.error("Error creating notifications:", notifError);
      }

      sendSuccess(res, 200, result.message, result);
      return;
    }

    // Emit socket notification FIRST (even if notification creation fails)
    // This ensures real-time updates work regardless of notification status
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

        // Emit friend request event with complete data (MOST IMPORTANT)
        if (requesterInfo) {
          socketService.emitFriendRequest(parsed.data.receiverId, {
            type: "friend-request-received",
            request: {
              id: result.requestId,
              requester_id: req.user.userId,
              receiver_id: parsed.data.receiverId,
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
          console.log(`📤 Emitted friend request to user ${parsed.data.receiverId} via socket`);
        } else {
          console.warn("⚠️ Requester info not found for socket emission");
        }

        // Also emit notification event (for notification dropdown)
        socketService.emitNotification(parsed.data.receiverId, {
          type: "new-notification",
        });
      } else {
        console.warn("⚠️ Socket service not available");
      }
    } catch (socketError) {
      console.error("Error emitting socket notification:", socketError);
    }

    // Create notification for receiver
    try {
      const { createNotificationService } = await import("@/services/notificationsService");
      const notification = await createNotificationService({
        userId: parsed.data.receiverId,
        actorId: req.user.userId,
        type: "FRIEND_REQUEST_SENT",
        referenceId: result.requestId,
        referenceType: "USER",
      });
      console.log("✅ Notification created successfully:", {
        notificationId: notification.id,
        type: notification.type,
        message: notification.message,
      });
      
      // Emit socket notification after successful creation
      try {
        const socketModule = await import("@/index");
        const socketService = socketModule.socketService;
        if (socketService) {
          socketService.emitNotification(parsed.data.receiverId, {
            type: "new-notification",
            notification: notification,
          });
          console.log("📤 Emitted notification socket event after creation");
        }
      } catch (socketNotifError) {
        console.error("Error emitting notification socket after creation:", socketNotifError);
      }
    } catch (notifError: any) {
      console.error("❌ Error creating friend request notification:", {
        error: notifError?.message || notifError,
        code: notifError?.code,
        parent: notifError?.parent?.message,
      });
      // Don't fail the request - socket already emitted for friend request card
    }

    sendSuccess(res, 200, "Friend request sent successfully", result);
  } catch (error: unknown) {
    const err = error as { statusCode?: number; message?: string };
    if (err.statusCode) {
      sendError(res, err.statusCode, err.message || "Something went wrong");
      return;
    }
    console.error("Send friend request error:", error);
    sendError(res, 500, "Internal server error");
  }
};

export const acceptFriendRequest = async (
  req: AuthRequest,
  res: Response
): Promise<void> => {
  try {
    if (!req.user) {
      sendError(res, 401, "Authentication required");
      return;
    }

    const requestId = req.params.requestId;
    if (!requestId) {
      sendError(res, 400, "Request ID is required");
      return;
    }

    const result = await acceptFriendRequestService(requestId, req.user.userId);

    // Create notification for requester
    try {
      const { createNotificationService } = await import("@/services/notificationsService");
      await createNotificationService({
        userId: result.requesterId,
        actorId: req.user.userId,
        type: "FRIEND_REQUEST_ACCEPTED",
        referenceId: requestId,
        referenceType: "USER",
      });

      // Emit socket notification and refresh followers/following for both users
      try {
        const socketModule = await import("@/index");
        const socketService = socketModule.socketService;
        if (socketService) {
          socketService.emitNotification(result.requesterId, {
            type: "new-notification",
          });
          socketService.emitFollowersFollowingUpdate([
            result.requesterId,
            req.user.userId,
          ]);
        }
      } catch (socketError) {
        console.error("Error emitting notification socket:", socketError);
      }
    } catch (notifError) {
      console.error("Error creating accept notification:", notifError);
    }

    sendSuccess(res, 200, "Friend request accepted successfully", result);
  } catch (error: unknown) {
    const err = error as { statusCode?: number; message?: string };
    if (err.statusCode) {
      sendError(res, err.statusCode, err.message || "Something went wrong");
      return;
    }
    console.error("Accept friend request error:", error);
    sendError(res, 500, "Internal server error");
  }
};

export const declineFriendRequest = async (
  req: AuthRequest,
  res: Response
): Promise<void> => {
  try {
    if (!req.user) {
      sendError(res, 401, "Authentication required");
      return;
    }

    const requestId = req.params.requestId;
    if (!requestId) {
      sendError(res, 400, "Request ID is required");
      return;
    }

    const result = await declineFriendRequestService(requestId, req.user.userId);

    sendSuccess(res, 200, "Friend request declined successfully", result);
  } catch (error: unknown) {
    const err = error as { statusCode?: number; message?: string };
    if (err.statusCode) {
      sendError(res, err.statusCode, err.message || "Something went wrong");
      return;
    }
    console.error("Decline friend request error:", error);
    sendError(res, 500, "Internal server error");
  }
};

export const getFriendRequests = async (
  req: AuthRequest,
  res: Response
): Promise<void> => {
  try {
    if (!req.user) {
      sendError(res, 401, "Authentication required");
      return;
    }

    const limit = parseInt(req.query.limit as string) || 10;
    const cursor = req.query.cursor as string | undefined;

    const result = await getFriendRequestsService(
      req.user.userId,
      limit,
      cursor
    );

    sendSuccess(res, 200, "Friend requests fetched successfully", result);
  } catch (error: unknown) {
    const err = error as { statusCode?: number; message?: string };
    if (err.statusCode) {
      sendError(res, err.statusCode, err.message || "Something went wrong");
      return;
    }
    console.error("Get friend requests error:", error);
    sendError(res, 500, "Internal server error");
  }
};

export const getSentFriendRequestsCount = async (
  req: AuthRequest,
  res: Response
): Promise<void> => {
  try {
    if (!req.user) {
      sendError(res, 401, "Authentication required");
      return;
    }

    const count = await getSentFriendRequestsCountService(req.user.userId);

    sendSuccess(res, 200, "Sent friend requests count fetched successfully", {
      count,
    });
  } catch (error: unknown) {
    const err = error as { statusCode?: number; message?: string };
    if (err.statusCode) {
      sendError(res, err.statusCode, err.message || "Something went wrong");
      return;
    }
    console.error("Get sent friend requests count error:", error);
    sendError(res, 500, "Internal server error");
  }
};

export const getSentFriendRequests = async (
  req: AuthRequest,
  res: Response
): Promise<void> => {
  try {
    if (!req.user) {
      sendError(res, 401, "Authentication required");
      return;
    }

    const limit = parseInt(req.query.limit as string) || 100;
    const cursor = req.query.cursor as string | undefined;

    const result = await getSentFriendRequestsService(
      req.user.userId,
      limit,
      cursor
    );

    sendSuccess(res, 200, "Sent friend requests fetched successfully", result);
  } catch (error: unknown) {
    const err = error as { statusCode?: number; message?: string };
    if (err.statusCode) {
      sendError(res, err.statusCode, err.message || "Something went wrong");
      return;
    }
    console.error("Get sent friend requests error:", error);
    sendError(res, 500, "Internal server error");
  }
};

export const getFriends = async (
  req: AuthRequest,
  res: Response
): Promise<void> => {
  try {
    if (!req.user) {
      sendError(res, 401, "Authentication required");
      return;
    }

    const limit = parseInt(req.query.limit as string) || 10;
    const cursor = req.query.cursor as string | undefined;
    const search = req.query.search as string | undefined;

    // Get online users from socket service
    let onlineUserIds: string[] = [];
    try {
      const socketModule = await import("@/index");
      const socketService = socketModule.socketService;
      if (socketService) {
        onlineUserIds = socketService.getOnlineUsers();
      }
    } catch (socketError) {
      console.warn("Could not get online users from socket service:", socketError);
    }

    const result = await getFriendsService(
      req.user.userId,
      limit,
      cursor,
      search,
      onlineUserIds
    );

    sendSuccess(res, 200, "Friends fetched successfully", result);
  } catch (error: unknown) {
    const err = error as { statusCode?: number; message?: string };
    if (err.statusCode) {
      sendError(res, err.statusCode, err.message || "Something went wrong");
      return;
    }
    console.error("Get friends error:", error);
    sendError(res, 500, "Internal server error");
  }
};

