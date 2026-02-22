import { Response } from "express";
import { z } from "zod";
import { sendSuccess, sendError } from "@/utils/apiResponse";
import {
  createCommentService,
  getCommentsByPostIdService,
  createCommentReplyService,
  toggleCommentLikeService,
  toggleCommentReplyLikeService,
  toggleCommentDislikeService,
  toggleCommentReplyDislikeService,
} from "@/services/commentsService";
import { AuthRequest } from "@/middleware/authMiddleware";
import sequelize from "database";
import { QueryTypes } from "sequelize";

// Validation schemas
const createCommentSchema = z.object({
  message: z.string().min(1, "Message is required"),
});

const createCommentReplySchema = z.object({
  message: z.string().min(1, "Message is required"),
  parentReplyId: z.string().uuid().optional().nullable(),
});

export const createComment = async (
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

    const parsed = createCommentSchema.safeParse(req.body);
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

    const comment = await createCommentService({
      userId: req.user.userId,
      postId,
      message: parsed.data.message,
    });

    // Create notification for post owner
    try {
      const postResult = await sequelize.query(
        `SELECT user_id FROM posts WHERE id = $1 AND deleted_at IS NULL`,
        {
          bind: [postId],
          type: QueryTypes.SELECT,
        }
      );

      const postOwnerId = postResult.length > 0 ? (postResult[0] as any).user_id : null;

      if (postOwnerId && postOwnerId !== req.user.userId) {
        const { createNotificationService } = await import("@/services/notificationsService");
        await createNotificationService({
          userId: postOwnerId,
          actorId: req.user.userId,
          type: "COMMENT_ADDED",
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
      }
    } catch (notifError) {
      console.error("Error creating comment notification:", notifError);
    }

    // Emit socket event for real-time comment
    try {
      const socketModule = await import("@/index");
      const socketService = socketModule.socketService;
      if (socketService) {
        // Broadcast to all users watching this post
        socketService.broadcastFeedUpdate({
          type: "comment-added",
          postId,
          comment,
        });
      }
    } catch (socketError) {
      console.error("Error emitting comment socket:", socketError);
    }

    sendSuccess(res, 201, "Comment created successfully", comment);
  } catch (error: unknown) {
    const err = error as { statusCode?: number; message?: string };
    if (err.statusCode) {
      sendError(res, err.statusCode, err.message || "Something went wrong");
      return;
    }
    console.error("Create comment error:", error);
    sendError(res, 500, "Internal server error");
  }
};

export const getComments = async (
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

    const comments = await getCommentsByPostIdService(postId, req.user.userId);

    sendSuccess(res, 200, "Comments fetched successfully", comments);
  } catch (error: unknown) {
    const err = error as { statusCode?: number; message?: string };
    if (err.statusCode) {
      sendError(res, err.statusCode, err.message || "Something went wrong");
      return;
    }
    console.error("Get comments error:", error);
    sendError(res, 500, "Internal server error");
  }
};

export const createCommentReply = async (
  req: AuthRequest,
  res: Response
): Promise<void> => {
  try {
    if (!req.user) {
      sendError(res, 401, "Authentication required");
      return;
    }

    const commentId = req.params.commentId;
    if (!commentId) {
      sendError(res, 400, "Comment ID is required");
      return;
    }

    const parsed = createCommentReplySchema.safeParse(req.body);
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

    const reply = await createCommentReplyService({
      userId: req.user.userId,
      commentId,
      message: parsed.data.message,
      parentReplyId: parsed.data.parentReplyId || undefined,
    });

    // Create notification for comment owner
    try {
      const commentResult = await sequelize.query(
        `SELECT user_id, post_id FROM comments WHERE id = $1 AND deleted_at IS NULL`,
        {
          bind: [commentId],
          type: QueryTypes.SELECT,
        }
      );

      const commentData = commentResult.length > 0 ? (commentResult[0] as any) : null;
      const commentOwnerId = commentData?.user_id;

      if (commentOwnerId && commentOwnerId !== req.user.userId) {
        const { createNotificationService } = await import("@/services/notificationsService");
        await createNotificationService({
          userId: commentOwnerId,
          actorId: req.user.userId,
          type: "REPLY_ADDED",
          referenceId: commentId,
          referenceType: "COMMENT",
        });

        // Emit socket notification
        try {
          const socketModule = await import("@/index");
          const socketService = socketModule.socketService;
          if (socketService) {
            socketService.emitNotification(commentOwnerId, {
              type: "new-notification",
            });
          }
        } catch (socketError) {
          console.error("Error emitting notification socket:", socketError);
        }
      }

      // Emit socket event for real-time reply
      try {
        const socketModule = await import("@/index");
        const socketService = socketModule.socketService;
        if (socketService) {
          // We need postId to update the correct feed item in frontend
          const postId = commentData?.post_id;
          if (postId) {
            socketService.broadcastFeedUpdate({
              type: "reply-added",
              postId,
              commentId,
              reply,
            });
          }
        }
      } catch (socketError) {
        console.error("Error emitting reply socket:", socketError);
      }

    } catch (notifError) {
      console.error("Error creating reply notification:", notifError);
    }

    sendSuccess(res, 201, "Reply created successfully", reply);
  } catch (error: unknown) {
    const err = error as { statusCode?: number; message?: string };
    if (err.statusCode) {
      sendError(res, err.statusCode, err.message || "Something went wrong");
      return;
    }
    console.error("Create comment reply error:", error);
    sendError(res, 500, "Internal server error");
  }
};

export const toggleCommentLike = async (
  req: AuthRequest,
  res: Response
): Promise<void> => {
  try {
    if (!req.user) {
      sendError(res, 401, "Authentication required");
      return;
    }

    const commentId = req.params.commentId;
    if (!commentId) {
      sendError(res, 400, "Comment ID is required");
      return;
    }

    const result = await toggleCommentLikeService(req.user.userId, commentId);
    
    // Update socket event to include dislikes

    // Create notification if comment was liked
    if (result.isLiked) {
      try {
        const commentResult = await sequelize.query(
          `SELECT user_id, post_id FROM comments WHERE id = $1 AND deleted_at IS NULL`,
          {
            bind: [commentId],
            type: QueryTypes.SELECT,
          }
        );

        const commentData = commentResult.length > 0 ? (commentResult[0] as any) : null;
        const commentOwnerId = commentData?.user_id;

        if (commentOwnerId && commentOwnerId !== req.user.userId) {
          const { createNotificationService } = await import("@/services/notificationsService");
          await createNotificationService({
            userId: commentOwnerId,
            actorId: req.user.userId,
            type: "COMMENT_LIKED",
            referenceId: commentId,
            referenceType: "COMMENT",
          });

          // Emit socket notification
          try {
            const socketModule = await import("@/index");
            const socketService = socketModule.socketService;
            if (socketService) {
              socketService.emitNotification(commentOwnerId, {
                type: "new-notification",
              });
            }
          } catch (socketError) {
            console.error("Error emitting notification socket:", socketError);
          }
        }

        // Emit socket event for real-time like update
        try {
          const socketModule = await import("@/index");
          const socketService = socketModule.socketService;
          if (socketService) {
            const postId = commentData?.post_id;
            if (postId) {
              socketService.broadcastFeedUpdate({
                type: "comment-like-updated",
                postId,
                commentId,
                likesCount: result.likesCount,
                userId: req.user.userId // Sending userId to avoid double update on frontend
              });
            }
          }
        } catch (socketError) {
          console.error("Error emitting comment like socket:", socketError);
        }

      } catch (notifError) {
        console.error("Error creating comment like notification:", notifError);
      }
    } else {
      // Even if unliked, we want to update the count in real-time
      try {
        const commentResult = await sequelize.query(
          `SELECT post_id FROM comments WHERE id = $1`,
          { bind: [commentId], type: QueryTypes.SELECT }
        );
        const commentData = commentResult.length > 0 ? (commentResult[0] as any) : null;
        const postId = commentData?.post_id;

        if (postId) {
          const socketModule = await import("@/index");
          const socketService = socketModule.socketService;
          if (socketService) {
            socketService.broadcastFeedUpdate({
              type: "comment-like-updated",
              postId,
              commentId,
              likesCount: result.likesCount,
              userId: req.user.userId
            });
          }
        }
      } catch (e) {
        console.error("Error emitting comment unlike socket:", e);
      }
    }

    sendSuccess(res, 200, "Comment like toggled successfully", result);
  } catch (error: unknown) {
    const err = error as { statusCode?: number; message?: string };
    if (err.statusCode) {
      sendError(res, err.statusCode, err.message || "Something went wrong");
      return;
    }
    console.error("Toggle comment like error:", error);
    sendError(res, 500, "Internal server error");
  }
};

export const toggleCommentReplyLike = async (
  req: AuthRequest,
  res: Response
): Promise<void> => {
  try {
    if (!req.user) {
      sendError(res, 401, "Authentication required");
      return;
    }

    const replyId = req.params.replyId;
    if (!replyId) {
      sendError(res, 400, "Reply ID is required");
      return;
    }

    const result = await toggleCommentReplyLikeService(req.user.userId, replyId);

    // Create notification if reply was liked
    if (result.isLiked) {
      try {
        // Need to join to get comment_id and then post_id
        const replyResult = await sequelize.query(
          `SELECT cr.user_id, cr.comment_id, c.post_id 
           FROM comments_replies cr
           JOIN comments c ON cr.comment_id = c.id
           WHERE cr.id = $1 AND cr.deleted_at IS NULL`,
          {
            bind: [replyId],
            type: QueryTypes.SELECT,
          }
        );

        const replyData = replyResult.length > 0 ? (replyResult[0] as any) : null;
        const replyOwnerId = replyData?.user_id;

        if (replyOwnerId && replyOwnerId !== req.user.userId) {
          const { createNotificationService } = await import("@/services/notificationsService");
          await createNotificationService({
            userId: replyOwnerId,
            actorId: req.user.userId,
            type: "REPLY_LIKED",
            referenceId: replyId,
            referenceType: "REPLY",
          });

          // Emit socket notification
          try {
            const socketModule = await import("@/index");
            const socketService = socketModule.socketService;
            if (socketService) {
              socketService.emitNotification(replyOwnerId, {
                type: "new-notification",
              });
            }
          } catch (socketError) {
            console.error("Error emitting notification socket:", socketError);
          }
        }

        // Emit socket event for real-time like update
        try {
          const socketModule = await import("@/index");
          const socketService = socketModule.socketService;
          if (socketService) {
            const postId = replyData?.post_id;
            const commentId = replyData?.comment_id;
            if (postId && commentId) {
              socketService.broadcastFeedUpdate({
                type: "reply-like-updated",
                postId,
                commentId,
                replyId,
                likesCount: result.likesCount,
                userId: req.user.userId
              });
            }
          }
        } catch (socketError) {
          console.error("Error emitting reply like socket:", socketError);
        }

      } catch (notifError) {
        console.error("Error creating reply like notification:", notifError);
      }
    } else {
      // Even if unliked, we want to update the count in real-time
      try {
        const replyResult = await sequelize.query(
          `SELECT cr.comment_id, c.post_id 
                 FROM comments_replies cr
                 JOIN comments c ON cr.comment_id = c.id
                 WHERE cr.id = $1`,
          { bind: [replyId], type: QueryTypes.SELECT }
        );
        const replyData = replyResult.length > 0 ? (replyResult[0] as any) : null;
        const postId = replyData?.post_id;
        const commentId = replyData?.comment_id;

        if (postId && commentId) {
          const socketModule = await import("@/index");
          const socketService = socketModule.socketService;
          if (socketService) {
            socketService.broadcastFeedUpdate({
              type: "reply-like-updated",
              postId,
              commentId,
              replyId,
              likesCount: result.likesCount,
              userId: req.user.userId
            });
          }
        }
      } catch (e) {
        console.error("Error emitting reply unlike socket:", e);
      }
    }

    sendSuccess(res, 200, "Reply like toggled successfully", result);
  } catch (error: unknown) {
    const err = error as { statusCode?: number; message?: string };
    if (err.statusCode) {
      sendError(res, err.statusCode, err.message || "Something went wrong");
      return;
    }
    console.error("Toggle reply like error:", error);
    sendError(res, 500, "Internal server error");
  }
};

export const toggleCommentDislike = async (
  req: AuthRequest,
  res: Response
): Promise<void> => {
  try {
    if (!req.user) {
      sendError(res, 401, "Authentication required");
      return;
    }

    const commentId = req.params.commentId;
    if (!commentId) {
      sendError(res, 400, "Comment ID is required");
      return;
    }

    const result = await toggleCommentDislikeService(req.user.userId, commentId);

    // Emit socket event for real-time update
    try {
      const commentResult = await sequelize.query(
        `SELECT post_id FROM comments WHERE id = $1`,
        { bind: [commentId], type: QueryTypes.SELECT }
      );
      const commentData = commentResult.length > 0 ? (commentResult[0] as any) : null;
      const postId = commentData?.post_id;

      if (postId) {
        const socketModule = await import("@/index");
        const socketService = socketModule.socketService;
        if (socketService) {
          socketService.broadcastFeedUpdate({
            type: "comment-like-updated",
            postId,
            commentId,
            likesCount: result.likesCount,
            dislikesCount: result.dislikesCount,
            userId: req.user.userId
          });
        }
      }
    } catch (e) {
      console.error("Error emitting comment dislike socket:", e);
    }

    sendSuccess(res, 200, "Comment dislike toggled successfully", result);
  } catch (error: unknown) {
    const err = error as { statusCode?: number; message?: string };
    if (err.statusCode) {
      sendError(res, err.statusCode, err.message || "Something went wrong");
      return;
    }
    console.error("Toggle comment dislike error:", error);
    sendError(res, 500, "Internal server error");
  }
};

export const toggleCommentReplyDislike = async (
  req: AuthRequest,
  res: Response
): Promise<void> => {
  try {
    if (!req.user) {
      sendError(res, 401, "Authentication required");
      return;
    }

    const replyId = req.params.replyId;
    if (!replyId) {
      sendError(res, 400, "Reply ID is required");
      return;
    }

    const result = await toggleCommentReplyDislikeService(req.user.userId, replyId);

    // Emit socket event for real-time update
    try {
      const replyResult = await sequelize.query(
        `SELECT cr.comment_id, c.post_id 
         FROM comments_replies cr
         JOIN comments c ON cr.comment_id = c.id
         WHERE cr.id = $1`,
        { bind: [replyId], type: QueryTypes.SELECT }
      );
      const replyData = replyResult.length > 0 ? (replyResult[0] as any) : null;
      const postId = replyData?.post_id;
      const commentId = replyData?.comment_id;

      if (postId && commentId) {
        const socketModule = await import("@/index");
        const socketService = socketModule.socketService;
        if (socketService) {
          socketService.broadcastFeedUpdate({
            type: "reply-like-updated",
            postId,
            commentId,
            replyId,
            likesCount: result.likesCount,
            dislikesCount: result.dislikesCount,
            userId: req.user.userId
          });
        }
      }
    } catch (e) {
      console.error("Error emitting reply dislike socket:", e);
    }

    sendSuccess(res, 200, "Reply dislike toggled successfully", result);
  } catch (error: unknown) {
    const err = error as { statusCode?: number; message?: string };
    if (err.statusCode) {
      sendError(res, err.statusCode, err.message || "Something went wrong");
      return;
    }
    console.error("Toggle reply dislike error:", error);
    sendError(res, 500, "Internal server error");
  }
};

export const getCommentLikers = async (
  req: AuthRequest,
  res: Response
): Promise<void> => {
  try {
    if (!req.user) {
      sendError(res, 401, "Authentication required");
      return;
    }

    const commentId = req.params.commentId;
    if (!commentId) {
      sendError(res, 400, "Comment ID is required");
      return;
    }

    const likers = await sequelize.query(
      `SELECT DISTINCT
         u.id,
         u.username,
         u.email,
         COALESCE(o.image, u.image) as image,
         COALESCE(u.is_verified_email, false) as is_verified
       FROM comment_reaction cr
       INNER JOIN users u ON cr.user_id = u.id
       LEFT JOIN onboarding o ON u.id = o.user_id AND o.deleted_at IS NULL
       WHERE cr.comment_id = $1 
         AND cr.reaction_type = 'LIKE' 
         AND cr.deleted_at IS NULL
       ORDER BY cr.created_at DESC`,
      {
        bind: [commentId],
        type: QueryTypes.SELECT,
      }
    );

    sendSuccess(res, 200, "Likers fetched successfully", likers);
  } catch (error: unknown) {
    console.error("Get comment likers error:", error);
    sendError(res, 500, "Internal server error");
  }
};

export const getCommentDislikers = async (
  req: AuthRequest,
  res: Response
): Promise<void> => {
  try {
    if (!req.user) {
      sendError(res, 401, "Authentication required");
      return;
    }

    const commentId = req.params.commentId;
    if (!commentId) {
      sendError(res, 400, "Comment ID is required");
      return;
    }

    const dislikers = await sequelize.query(
      `SELECT DISTINCT
         u.id,
         u.username,
         u.email,
         COALESCE(o.image, u.image) as image,
         COALESCE(u.is_verified_email, false) as is_verified
       FROM comment_reaction cr
       INNER JOIN users u ON cr.user_id = u.id
       LEFT JOIN onboarding o ON u.id = o.user_id AND o.deleted_at IS NULL
       WHERE cr.comment_id = $1 
         AND cr.reaction_type = 'DISLIKE' 
         AND cr.deleted_at IS NULL
       ORDER BY cr.created_at DESC`,
      {
        bind: [commentId],
        type: QueryTypes.SELECT,
      }
    );

    sendSuccess(res, 200, "Dislikers fetched successfully", dislikers);
  } catch (error: unknown) {
    console.error("Get comment dislikers error:", error);
    sendError(res, 500, "Internal server error");
  }
};

export const getReplyLikers = async (
  req: AuthRequest,
  res: Response
): Promise<void> => {
  try {
    if (!req.user) {
      sendError(res, 401, "Authentication required");
      return;
    }

    const replyId = req.params.replyId;
    if (!replyId) {
      sendError(res, 400, "Reply ID is required");
      return;
    }

    const likers = await sequelize.query(
      `SELECT DISTINCT
         u.id,
         u.username,
         u.email,
         COALESCE(o.image, u.image) as image,
         COALESCE(u.is_verified_email, false) as is_verified
       FROM comment_replies_reaction crr
       INNER JOIN users u ON crr.user_id = u.id
       LEFT JOIN onboarding o ON u.id = o.user_id AND o.deleted_at IS NULL
       WHERE crr.comment_reply_id = $1 
         AND crr.reaction_type = 'LIKE' 
         AND crr.deleted_at IS NULL
       ORDER BY crr.created_at DESC`,
      {
        bind: [replyId],
        type: QueryTypes.SELECT,
      }
    );

    sendSuccess(res, 200, "Reply likers fetched successfully", likers);
  } catch (error: unknown) {
    console.error("Get reply likers error:", error);
    sendError(res, 500, "Internal server error");
  }
};

export const getReplyDislikers = async (
  req: AuthRequest,
  res: Response
): Promise<void> => {
  try {
    if (!req.user) {
      sendError(res, 401, "Authentication required");
      return;
    }

    const replyId = req.params.replyId;
    if (!replyId) {
      sendError(res, 400, "Reply ID is required");
      return;
    }

    const dislikers = await sequelize.query(
      `SELECT DISTINCT
         u.id,
         u.username,
         u.email,
         COALESCE(o.image, u.image) as image,
         COALESCE(u.is_verified_email, false) as is_verified
       FROM comment_replies_reaction crr
       INNER JOIN users u ON crr.user_id = u.id
       LEFT JOIN onboarding o ON u.id = o.user_id AND o.deleted_at IS NULL
       WHERE crr.comment_reply_id = $1 
         AND crr.reaction_type = 'DISLIKE' 
         AND crr.deleted_at IS NULL
       ORDER BY crr.created_at DESC`,
      {
        bind: [replyId],
        type: QueryTypes.SELECT,
      }
    );

    sendSuccess(res, 200, "Reply dislikers fetched successfully", dislikers);
  } catch (error: unknown) {
    console.error("Get reply dislikers error:", error);
    sendError(res, 500, "Internal server error");
  }
};

