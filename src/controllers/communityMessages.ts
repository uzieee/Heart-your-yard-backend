import { Response } from "express";
import { z } from "zod";
import { sendError, sendSuccess } from "@/utils/apiResponse";
import { AuthRequest } from "@/middleware/authMiddleware";
import {
  getCommunityMessagesService,
  listCommunityChatsService,
  markCommunityMessagesAsReadService,
  sendCommunityMessageService,
} from "@/services/communityMessagesService";

const sendCommunityMessageSchema = z.object({
  content: z.string().trim().min(1, "Message is required").max(5000, "Message is too long"),
});

export const listCommunityChats = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    if (!req.user) {
      sendError(res, 401, "Authentication required");
      return;
    }
    const search = typeof req.query.search === "string" ? req.query.search : undefined;
    const chats = await listCommunityChatsService(req.user.userId, search);
    sendSuccess(res, 200, "Community chats fetched successfully", { chats });
  } catch (error: unknown) {
    const err = error as { statusCode?: number; message?: string };
    if (err.statusCode) {
      sendError(res, err.statusCode, err.message || "Something went wrong");
      return;
    }
    console.error("List community chats error:", error);
    sendError(res, 500, "Internal server error");
  }
};

export const getCommunityMessages = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    if (!req.user) {
      sendError(res, 401, "Authentication required");
      return;
    }

    const communityId = req.params.communityId;
    if (!communityId) {
      sendError(res, 400, "Community ID is required");
      return;
    }

    const cursor = typeof req.query.cursor === "string" ? req.query.cursor : undefined;
    const limit = Math.min(parseInt(String(req.query.limit || "20"), 10) || 20, 50);
    const result = await getCommunityMessagesService(req.user.userId, communityId, limit, cursor);
    sendSuccess(res, 200, "Community messages fetched successfully", result);
  } catch (error: unknown) {
    const err = error as { statusCode?: number; message?: string };
    if (err.statusCode) {
      sendError(res, err.statusCode, err.message || "Something went wrong");
      return;
    }
    console.error("Get community messages error:", error);
    sendError(res, 500, "Internal server error");
  }
};

export const sendCommunityMessage = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    if (!req.user) {
      sendError(res, 401, "Authentication required");
      return;
    }

    const communityId = req.params.communityId;
    if (!communityId) {
      sendError(res, 400, "Community ID is required");
      return;
    }

    const parsed = sendCommunityMessageSchema.safeParse(req.body);
    if (!parsed.success) {
      const fieldErrors: Record<string, string[]> = {};
      parsed.error.errors.forEach((err) => {
        const key = err.path.join(".");
        if (!fieldErrors[key]) fieldErrors[key] = [];
        fieldErrors[key].push(err.message);
      });
      sendError(res, 422, "Validation failed", fieldErrors);
      return;
    }

    const message = await sendCommunityMessageService(
      req.user.userId,
      communityId,
      parsed.data.content
    );

    try {
      const socketModule = await import("@/index");
      socketModule.socketService.emitCommunityMessage(communityId, message);
    } catch (socketErr) {
      console.error("Community message socket emit error:", socketErr);
    }

    sendSuccess(res, 201, "Community message sent successfully", message);
  } catch (error: unknown) {
    const err = error as { statusCode?: number; message?: string };
    if (err.statusCode) {
      sendError(res, err.statusCode, err.message || "Something went wrong");
      return;
    }
    console.error("Send community message error:", error);
    sendError(res, 500, "Internal server error");
  }
};

export const markCommunityMessagesAsRead = async (
  req: AuthRequest,
  res: Response
): Promise<void> => {
  try {
    if (!req.user) {
      sendError(res, 401, "Authentication required");
      return;
    }

    const communityId = req.params.communityId;
    if (!communityId) {
      sendError(res, 400, "Community ID is required");
      return;
    }

    const result = await markCommunityMessagesAsReadService(req.user.userId, communityId);
    sendSuccess(res, 200, "Community messages marked as read", result);
  } catch (error: unknown) {
    const err = error as { statusCode?: number; message?: string };
    if (err.statusCode) {
      sendError(res, err.statusCode, err.message || "Something went wrong");
      return;
    }
    console.error("Mark community messages as read error:", error);
    sendError(res, 500, "Internal server error");
  }
};


