import { Response } from "express";
import { sendSuccess, sendError } from "@/utils/apiResponse";
import { AuthRequest } from "@/middleware/authMiddleware";
import sequelize from "database";
import { QueryTypes } from "sequelize";
import { ensureMember, ensureCommunityPostInCommunity } from "@/services/communityPostsService";
import {
  toggleCommunityPostLikeService,
  toggleCommunityPostDislikeService,
} from "@/services/communityPostLikesService";
import {
  getCommunityPostCommentsService,
  createCommunityPostCommentService,
  createCommunityPostCommentReplyService,
  toggleCommunityCommentLikeService,
  toggleCommunityCommentDislikeService,
  toggleCommunityReplyLikeService,
  toggleCommunityReplyDislikeService,
} from "@/services/communityPostCommentsService";

export const toggleCommunityPostLike = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    if (!req.user) {
      sendError(res, 401, "Authentication required");
      return;
    }
    const { communityId, postId } = req.params;
    if (!communityId || !postId) {
      sendError(res, 400, "Community ID and post ID are required");
      return;
    }
    await ensureMember(req.user.userId, communityId);
    await ensureCommunityPostInCommunity(postId, communityId);
    const [postRow] = await sequelize.query(
      `SELECT user_id FROM community_posts WHERE id = $1 AND deleted_at IS NULL LIMIT 1`,
      { bind: [postId], type: QueryTypes.SELECT }
    );
    const postOwnerId = Array.isArray(postRow) && postRow.length > 0 ? (postRow[0] as any).user_id : null;
    const result = await toggleCommunityPostLikeService(req.user.userId, postId);
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
        const socketModule = await import("@/index");
        const socketService = socketModule.socketService;
        if (socketService) socketService.emitNotification(postOwnerId, { type: "new-notification" });
      } catch (e) {
        console.error("Community post like notification error:", e);
      }
    }
    try {
      const socketModule = await import("@/index");
      const socketService = socketModule.socketService;
      if (socketService && typeof socketService.emitCommunityPostReactionUpdated === "function") {
        socketService.emitCommunityPostReactionUpdated(communityId, {
          postId,
          likesCount: result.likesCount,
          dislikesCount: result.dislikesCount,
        });
      }
    } catch (e) {
      console.error("Community post reaction socket error:", e);
    }
    sendSuccess(res, 200, "Like toggled", result);
  } catch (error: unknown) {
    const err = error as { statusCode?: number; message?: string };
    if (err.statusCode) {
      sendError(res, err.statusCode, err.message || "Something went wrong");
      return;
    }
    console.error("Toggle community post like error:", error);
    sendError(res, 500, "Internal server error");
  }
};

export const toggleCommunityPostDislike = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    if (!req.user) {
      sendError(res, 401, "Authentication required");
      return;
    }
    const { communityId, postId } = req.params;
    if (!communityId || !postId) {
      sendError(res, 400, "Community ID and post ID are required");
      return;
    }
    await ensureMember(req.user.userId, communityId);
    await ensureCommunityPostInCommunity(postId, communityId);
    const result = await toggleCommunityPostDislikeService(req.user.userId, postId);
    try {
      const socketModule = await import("@/index");
      const socketService = socketModule.socketService;
      if (socketService && typeof socketService.emitCommunityPostReactionUpdated === "function") {
        socketService.emitCommunityPostReactionUpdated(communityId, {
          postId,
          likesCount: result.likesCount,
          dislikesCount: result.dislikesCount,
        });
      }
    } catch (e) {
      console.error("Community post reaction socket error:", e);
    }
    sendSuccess(res, 200, "Dislike toggled", result);
  } catch (error: unknown) {
    const err = error as { statusCode?: number; message?: string };
    if (err.statusCode) {
      sendError(res, err.statusCode, err.message || "Something went wrong");
      return;
    }
    console.error("Toggle community post dislike error:", error);
    sendError(res, 500, "Internal server error");
  }
};

export const getCommunityPostComments = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { communityId, postId } = req.params;
    if (!communityId || !postId) {
      sendError(res, 400, "Community ID and post ID are required");
      return;
    }
    const userId = req.user?.userId ?? null;
    if (userId) await ensureMember(userId, communityId);
    await ensureCommunityPostInCommunity(postId, communityId);
    const comments = await getCommunityPostCommentsService(postId, userId);
    sendSuccess(res, 200, "Comments fetched", comments);
  } catch (error: unknown) {
    const err = error as { statusCode?: number; message?: string };
    if (err.statusCode) {
      sendError(res, err.statusCode, err.message || "Something went wrong");
      return;
    }
    console.error("Get community post comments error:", error);
    sendError(res, 500, "Internal server error");
  }
};

export const createCommunityPostComment = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    if (!req.user) {
      sendError(res, 401, "Authentication required");
      return;
    }
    const { communityId, postId } = req.params;
    const message = typeof req.body?.message === "string" ? req.body.message.trim() : "";
    if (!communityId || !postId) {
      sendError(res, 400, "Community ID and post ID are required");
      return;
    }
    if (!message) {
      sendError(res, 400, "Message is required");
      return;
    }
    await ensureMember(req.user.userId, communityId);
    await ensureCommunityPostInCommunity(postId, communityId);
    const comment = await createCommunityPostCommentService(req.user.userId, postId, message);
    const [postRow] = await sequelize.query(
      `SELECT user_id FROM community_posts WHERE id = $1 AND deleted_at IS NULL LIMIT 1`,
      { bind: [postId], type: QueryTypes.SELECT }
    );
    const postOwnerId = Array.isArray(postRow) && postRow.length > 0 ? (postRow[0] as any).user_id : null;
    if (postOwnerId && postOwnerId !== req.user.userId) {
      try {
        const { createNotificationService } = await import("@/services/notificationsService");
        await createNotificationService({
          userId: postOwnerId,
          actorId: req.user.userId,
          type: "COMMENT_ADDED",
          referenceId: postId,
          referenceType: "POST",
        });
        const socketModule = await import("@/index");
        const socketService = socketModule.socketService;
        if (socketService) socketService.emitNotification(postOwnerId, { type: "new-notification" });
      } catch (e) {
        console.error("Community post comment notification error:", e);
      }
    }
    try {
      const socketModule = await import("@/index");
      const socketService = socketModule.socketService;
      if (socketService && typeof socketService.emitCommunityPostCommentAdded === "function") {
        socketService.emitCommunityPostCommentAdded(communityId, { postId });
      }
    } catch (e) {
      console.error("Community post comment socket error:", e);
    }
    sendSuccess(res, 201, "Comment created", comment);
  } catch (error: unknown) {
    const err = error as { statusCode?: number; message?: string };
    if (err.statusCode) {
      sendError(res, err.statusCode, err.message || "Something went wrong");
      return;
    }
    console.error("Create community post comment error:", error);
    sendError(res, 500, "Internal server error");
  }
};

export const createCommunityPostCommentReply = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    if (!req.user) {
      sendError(res, 401, "Authentication required");
      return;
    }
    const communityId = typeof req.params.communityId === "string" ? req.params.communityId.trim() : "";
    const commentId = typeof req.params.commentId === "string" ? req.params.commentId.trim() : "";
    const message = typeof req.body?.message === "string" ? req.body.message.trim() : "";
    const parentReplyId = typeof req.body?.parentReplyId === "string" ? req.body.parentReplyId : undefined;
    if (!communityId || !commentId) {
      sendError(res, 400, "Community ID and comment ID are required");
      return;
    }
    if (!message) {
      sendError(res, 400, "Message is required");
      return;
    }
    await ensureMember(req.user.userId, communityId);
    const commentRows = await sequelize.query(
      `SELECT c.id as comment_id, c.user_id, c.community_post_id, cp.community_id
       FROM community_post_comments c
       INNER JOIN community_posts cp ON cp.id = c.community_post_id AND cp.deleted_at IS NULL
       WHERE c.id = $1::uuid AND c.deleted_at IS NULL AND cp.community_id = $2::uuid LIMIT 1`,
      { bind: [commentId, communityId], type: QueryTypes.SELECT }
    );
    let meta = Array.isArray(commentRows) && commentRows.length > 0 ? (commentRows[0] as any) : null;
    let topLevelCommentId = commentId;
    let replyOwnerId: string | null = null;
    if (!meta) {
      const replyRows = await sequelize.query(
        `SELECT r.community_post_comment_id, r.user_id as reply_user_id
         FROM community_post_comment_replies r
         INNER JOIN community_post_comments c ON c.id = r.community_post_comment_id AND c.deleted_at IS NULL
         INNER JOIN community_posts cp ON cp.id = c.community_post_id AND cp.deleted_at IS NULL
         WHERE r.id = $1 AND r.deleted_at IS NULL AND cp.community_id = $2 LIMIT 1`,
        { bind: [commentId, communityId], type: QueryTypes.SELECT }
      );
      const replyMeta = Array.isArray(replyRows) && replyRows.length > 0 ? (replyRows[0] as any) : null;
      if (!replyMeta) {
        sendError(res, 404, "Comment not found in this community");
        return;
      }
      topLevelCommentId = replyMeta.community_post_comment_id;
      replyOwnerId = replyMeta.reply_user_id ?? null;
      const commentRows2 = await sequelize.query(
        `SELECT c.id as comment_id, c.user_id, c.community_post_id, cp.community_id
         FROM community_post_comments c
         INNER JOIN community_posts cp ON cp.id = c.community_post_id AND cp.deleted_at IS NULL
         WHERE c.id = $1::uuid AND c.deleted_at IS NULL LIMIT 1`,
        { bind: [topLevelCommentId], type: QueryTypes.SELECT }
      );
      meta = Array.isArray(commentRows2) && commentRows2.length > 0 ? (commentRows2[0] as any) : null;
    }
    if (!meta) {
      sendError(res, 404, "Comment not found in this community");
      return;
    }
    const reply = await createCommunityPostCommentReplyService(
      req.user.userId,
      topLevelCommentId,
      message,
      parentReplyId ?? null
    );
    const commentOwnerId = meta.user_id ?? null;
    const postIdForSocket = meta.community_post_id ?? null;
    const notifyUserId = replyOwnerId ?? commentOwnerId;
    if (notifyUserId && notifyUserId !== req.user.userId) {
      try {
        const { createNotificationService } = await import("@/services/notificationsService");
        await createNotificationService({
          userId: notifyUserId,
          actorId: req.user.userId,
          type: "REPLY_ADDED",
          referenceId: commentId,
          referenceType: "COMMENT",
        });
        const socketModule = await import("@/index");
        const socketService = socketModule.socketService;
        if (socketService) socketService.emitNotification(notifyUserId, { type: "new-notification" });
      } catch (e) {
        console.error("Community post reply notification error:", e);
      }
    }
    if (postIdForSocket && communityId) {
      try {
        const socketModule = await import("@/index");
        const socketService = socketModule.socketService;
        if (socketService && typeof socketService.emitCommunityPostCommentAdded === "function") {
          socketService.emitCommunityPostCommentAdded(communityId, { postId: postIdForSocket });
        }
      } catch (e) {
        console.error("Community post comment socket error:", e);
      }
    }
    sendSuccess(res, 201, "Reply created", reply);
  } catch (error: unknown) {
    const err = error as { statusCode?: number; message?: string };
    if (err.statusCode) {
      sendError(res, err.statusCode, err.message || "Something went wrong");
      return;
    }
    console.error("Create community post comment reply error:", error);
    sendError(res, 500, "Internal server error");
  }
};

export const toggleCommunityCommentLike = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    if (!req.user) {
      sendError(res, 401, "Authentication required");
      return;
    }
    const { communityId, commentId } = req.params;
    if (!communityId || !commentId) {
      sendError(res, 400, "Community ID and comment ID are required");
      return;
    }
    await ensureMember(req.user.userId, communityId);
    const result = await toggleCommunityCommentLikeService(req.user.userId, commentId);
    try {
      const [row] = await sequelize.query(
        `SELECT community_post_id FROM community_post_comments WHERE id = $1 AND deleted_at IS NULL LIMIT 1`,
        { bind: [commentId], type: QueryTypes.SELECT }
      );
      const postId = row && (row as any).community_post_id;
      if (postId && communityId) {
        const socketModule = await import("@/index");
        const socketService = socketModule.socketService;
        if (socketService && typeof (socketService as any).emitCommunityPostCommentReactionUpdated === "function") {
          (socketService as any).emitCommunityPostCommentReactionUpdated(communityId, { postId });
        }
      }
    } catch (e) {
      console.error("Community comment like socket error:", e);
    }
    sendSuccess(res, 200, "Comment like toggled", result);
  } catch (error: unknown) {
    const err = error as { statusCode?: number; message?: string };
    if (err.statusCode) {
      sendError(res, err.statusCode, err.message || "Something went wrong");
      return;
    }
    console.error("Toggle community comment like error:", error);
    sendError(res, 500, "Internal server error");
  }
};

export const toggleCommunityCommentDislike = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    if (!req.user) {
      sendError(res, 401, "Authentication required");
      return;
    }
    const { communityId, commentId } = req.params;
    if (!communityId || !commentId) {
      sendError(res, 400, "Community ID and comment ID are required");
      return;
    }
    await ensureMember(req.user.userId, communityId);
    const result = await toggleCommunityCommentDislikeService(req.user.userId, commentId);
    try {
      const [row] = await sequelize.query(
        `SELECT community_post_id FROM community_post_comments WHERE id = $1 AND deleted_at IS NULL LIMIT 1`,
        { bind: [commentId], type: QueryTypes.SELECT }
      );
      const postId = row && (row as any).community_post_id;
      if (postId && communityId) {
        const socketModule = await import("@/index");
        const socketService = socketModule.socketService;
        if (socketService && typeof (socketService as any).emitCommunityPostCommentReactionUpdated === "function") {
          (socketService as any).emitCommunityPostCommentReactionUpdated(communityId, { postId });
        }
      }
    } catch (e) {
      console.error("Community comment dislike socket error:", e);
    }
    sendSuccess(res, 200, "Comment dislike toggled", result);
  } catch (error: unknown) {
    const err = error as { statusCode?: number; message?: string };
    if (err.statusCode) {
      sendError(res, err.statusCode, err.message || "Something went wrong");
      return;
    }
    console.error("Toggle community comment dislike error:", error);
    sendError(res, 500, "Internal server error");
  }
};

export const toggleCommunityReplyLike = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    if (!req.user) {
      sendError(res, 401, "Authentication required");
      return;
    }
    const { communityId, replyId } = req.params;
    if (!communityId || !replyId) {
      sendError(res, 400, "Community ID and reply ID are required");
      return;
    }
    await ensureMember(req.user.userId, communityId);
    const result = await toggleCommunityReplyLikeService(req.user.userId, replyId);
    try {
      const [row] = await sequelize.query(
        `SELECT c.community_post_id FROM community_post_comment_replies r
         INNER JOIN community_post_comments c ON c.id = r.community_post_comment_id AND c.deleted_at IS NULL
         WHERE r.id = $1 AND r.deleted_at IS NULL LIMIT 1`,
        { bind: [replyId], type: QueryTypes.SELECT }
      );
      const postId = row && (row as any).community_post_id;
      if (postId && communityId) {
        const socketModule = await import("@/index");
        const socketService = socketModule.socketService;
        if (socketService && typeof (socketService as any).emitCommunityPostCommentReactionUpdated === "function") {
          (socketService as any).emitCommunityPostCommentReactionUpdated(communityId, { postId });
        }
      }
    } catch (e) {
      console.error("Community reply like socket error:", e);
    }
    sendSuccess(res, 200, "Reply like toggled", result);
  } catch (error: unknown) {
    const err = error as { statusCode?: number; message?: string };
    if (err.statusCode) {
      sendError(res, err.statusCode, err.message || "Something went wrong");
      return;
    }
    console.error("Toggle community reply like error:", error);
    sendError(res, 500, "Internal server error");
  }
};

export const toggleCommunityReplyDislike = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    if (!req.user) {
      sendError(res, 401, "Authentication required");
      return;
    }
    const { communityId, replyId } = req.params;
    if (!communityId || !replyId) {
      sendError(res, 400, "Community ID and reply ID are required");
      return;
    }
    await ensureMember(req.user.userId, communityId);
    const result = await toggleCommunityReplyDislikeService(req.user.userId, replyId);
    try {
      const [row] = await sequelize.query(
        `SELECT c.community_post_id FROM community_post_comment_replies r
         INNER JOIN community_post_comments c ON c.id = r.community_post_comment_id AND c.deleted_at IS NULL
         WHERE r.id = $1 AND r.deleted_at IS NULL LIMIT 1`,
        { bind: [replyId], type: QueryTypes.SELECT }
      );
      const postId = row && (row as any).community_post_id;
      if (postId && communityId) {
        const socketModule = await import("@/index");
        const socketService = socketModule.socketService;
        if (socketService && typeof (socketService as any).emitCommunityPostCommentReactionUpdated === "function") {
          (socketService as any).emitCommunityPostCommentReactionUpdated(communityId, { postId });
        }
      }
    } catch (e) {
      console.error("Community reply dislike socket error:", e);
    }
    sendSuccess(res, 200, "Reply dislike toggled", result);
  } catch (error: unknown) {
    const err = error as { statusCode?: number; message?: string };
    if (err.statusCode) {
      sendError(res, err.statusCode, err.message || "Something went wrong");
      return;
    }
    console.error("Toggle community reply dislike error:", error);
    sendError(res, 500, "Internal server error");
  }
};

