import { Response } from "express";
import { sendSuccess, sendError } from "@/utils/apiResponse";
import { togglePostLikeService, togglePostDislikeService } from "@/services/likesService";
import { AuthRequest } from "@/middleware/authMiddleware";
import sequelize from "database";
import { QueryTypes } from "sequelize";

export const togglePostLike = async (
  req: AuthRequest,
  res: Response
): Promise<void> => {
  try {
    if (!req.user) {
      sendError(res, 401, "Authentication required");
      return;
    }

    const postId = req.params.postId;
    if (!postId) {
      sendError(res, 400, "Post ID is required");
      return;
    }

    // Get post owner before toggling like
    const postResult = await sequelize.query(
      `SELECT user_id FROM posts WHERE id = $1 AND deleted_at IS NULL`,
      {
        bind: [postId],
        type: QueryTypes.SELECT,
      }
    );

    const postOwnerId = postResult.length > 0 ? (postResult[0] as any).user_id : null;

    const result = await togglePostLikeService(req.user.userId, postId);

    // Create notification if post was liked (not unliked) and user is not liking their own post
    if (result.isLiked && postOwnerId && postOwnerId !== req.user.userId) {
      try {
        const { createNotificationService } = await import("@/services/notificationsService");
        await createNotificationService({
          userId: postOwnerId,
          actorId: req.user.userId,
          type: "POST_LIKED",
          referenceId: postId,
          referenceType: "POST",
        });

        // Emit socket notification
        try {
          const socketModule = await import("@/index");
          const socketService = socketModule.socketService;
          if (socketService) {
            socketService.emitNotification(postOwnerId, {
              type: "new-notification",
            });
          }
        } catch (socketError) {
          console.error("Error emitting notification socket:", socketError);
        }
      } catch (notifError) {
        console.error("Error creating like notification:", notifError);
      }
    }

    // Emit socket event for real-time update
    try {
      const socketModule = await import("@/index");
      const socketService = socketModule.socketService;
      if (socketService) {
        socketService.broadcastFeedUpdate({
          type: "post-like-updated",
          postId,
          likesCount: result.likesCount,
          dislikesCount: result.dislikesCount,
          isLiked: result.isLiked,
          isDisliked: result.isDisliked,
          userId: req.user.userId // Sending userId to avoid double update on frontend
        });
      }
    } catch (socketError) {
      console.error("Error emitting post like socket:", socketError);
    }

    sendSuccess(res, 200, "Post like toggled successfully", result);
  } catch (error: unknown) {
    const err = error as { statusCode?: number; message?: string };
    if (err.statusCode) {
      sendError(res, err.statusCode, err.message || "Something went wrong");
      return;
    }
    console.error("Toggle post like error:", error);
    sendError(res, 500, "Internal server error");
  }
};

export const togglePostDislike = async (
  req: AuthRequest,
  res: Response
): Promise<void> => {
  try {
    if (!req.user) {
      sendError(res, 401, "Authentication required");
      return;
    }

    const postId = req.params.postId;
    if (!postId) {
      sendError(res, 400, "Post ID is required");
      return;
    }

    const result = await togglePostDislikeService(req.user.userId, postId);

    // Emit socket event for real-time update
    try {
      const socketModule = await import("@/index");
      const socketService = socketModule.socketService;
      if (socketService) {
        socketService.broadcastFeedUpdate({
          type: "post-like-updated",
          postId,
          likesCount: result.likesCount,
          dislikesCount: result.dislikesCount,
          isLiked: result.isLiked,
          isDisliked: result.isDisliked,
          userId: req.user.userId
        });
      }
    } catch (socketError) {
      console.error("Error emitting post dislike socket:", socketError);
    }

    sendSuccess(res, 200, "Post dislike toggled successfully", result);
  } catch (error: unknown) {
    const err = error as { statusCode?: number; message?: string };
    if (err.statusCode) {
      sendError(res, err.statusCode, err.message || "Something went wrong");
      return;
    }
    console.error("Toggle post dislike error:", error);
    sendError(res, 500, "Internal server error");
  }
};

export const getPostLikers = async (
  req: AuthRequest,
  res: Response
): Promise<void> => {
  try {
    if (!req.user) {
      sendError(res, 401, "Authentication required");
      return;
    }

    const postId = req.params.postId;
    if (!postId) {
      sendError(res, 400, "Post ID is required");
      return;
    }

    const likers = await sequelize.query(
      `SELECT DISTINCT
         u.id,
         u.username,
         u.email,
         o.image as image,
         COALESCE(u.is_verified_email, false) as is_verified
       FROM post_likes pl
       INNER JOIN users u ON pl.user_id = u.id
       LEFT JOIN onboarding o ON u.id = o.user_id AND o.deleted_at IS NULL
       WHERE pl.post_id = $1 
         AND pl.reaction_type = 'LIKE' 
         AND pl.deleted_at IS NULL
       ORDER BY pl.created_at DESC`,
      {
        bind: [postId],
        type: QueryTypes.SELECT,
      }
    );

    sendSuccess(res, 200, "Post likers fetched successfully", likers);
  } catch (error: unknown) {
    console.error("Get post likers error:", error);
    sendError(res, 500, "Internal server error");
  }
};

export const getPostDislikers = async (
  req: AuthRequest,
  res: Response
): Promise<void> => {
  try {
    if (!req.user) {
      sendError(res, 401, "Authentication required");
      return;
    }

    const postId = req.params.postId;
    if (!postId) {
      sendError(res, 400, "Post ID is required");
      return;
    }

    const dislikers = await sequelize.query(
      `SELECT DISTINCT
         u.id,
         u.username,
         u.email,
         o.image as image,
         COALESCE(u.is_verified_email, false) as is_verified
       FROM post_likes pl
       INNER JOIN users u ON pl.user_id = u.id
       LEFT JOIN onboarding o ON u.id = o.user_id AND o.deleted_at IS NULL
       WHERE pl.post_id = $1 
         AND pl.reaction_type = 'DISLIKE' 
         AND pl.deleted_at IS NULL
       ORDER BY pl.created_at DESC`,
      {
        bind: [postId],
        type: QueryTypes.SELECT,
      }
    );

    sendSuccess(res, 200, "Post dislikers fetched successfully", dislikers);
  } catch (error: unknown) {
    console.error("Get post dislikers error:", error);
    sendError(res, 500, "Internal server error");
  }
};

export const getPostReactions = async (
  req: AuthRequest,
  res: Response
): Promise<void> => {
  try {
    if (!req.user) {
      sendError(res, 401, "Authentication required");
      return;
    }

    const postId = req.params.postId;
    if (!postId) {
      sendError(res, 400, "Post ID is required");
      return;
    }

    // Get all reactions (both like and dislike) with user info and preference
    const reactions = await sequelize.query(
      `SELECT 
         u.id,
         u.username,
         u.email,
         o.image as image,
         COALESCE(u.is_verified_email, false) as is_verified,
         pl.reaction_type as preference,
         pl.created_at as reacted_at
       FROM post_likes pl
       INNER JOIN users u ON pl.user_id = u.id
       LEFT JOIN onboarding o ON u.id = o.user_id AND o.deleted_at IS NULL
       WHERE pl.post_id = $1 
         AND pl.reaction_type IN ('LIKE', 'DISLIKE')
         AND pl.deleted_at IS NULL
       ORDER BY pl.created_at DESC`,
      {
        bind: [postId],
        type: QueryTypes.SELECT,
      }
    );

    sendSuccess(res, 200, "Post reactions fetched successfully", reactions);
  } catch (error: unknown) {
    console.error("Get post reactions error:", error);
    sendError(res, 500, "Internal server error");
  }
};

