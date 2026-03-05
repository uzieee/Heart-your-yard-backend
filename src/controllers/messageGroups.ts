import { Response } from "express";
import { z } from "zod";
import { sendError, sendSuccess } from "@/utils/apiResponse";
import { AuthRequest } from "@/middleware/authMiddleware";
import {
  addMessageGroupMembersService,
  createMessageGroupService,
  getMessageGroupByIdService,
  getMessageGroupMessagesService,
  listMyMessageGroupsService,
  markMessageGroupMessagesReadService,
  sendMessageGroupMessageService,
} from "@/services/messageGroupsService";

const createGroupSchema = z.object({
  name: z.string().trim().min(1, "Group name is required").max(255, "Group name is too long"),
  description: z.string().optional().nullable(),
  memberIds: z.array(z.string().uuid()).optional().default([]),
});

const addMembersSchema = z.object({
  memberIds: z.array(z.string().uuid()).min(1, "At least one member is required"),
});

const sendMessageSchema = z.object({
  content: z.string().trim().min(1, "Message is required").max(5000, "Message is too long"),
});

export const listMyMessageGroups = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    if (!req.user) {
      sendError(res, 401, "Authentication required");
      return;
    }
    const search = typeof req.query.search === "string" ? req.query.search : undefined;
    const groups = await listMyMessageGroupsService(req.user.userId, search);
    sendSuccess(res, 200, "Message groups fetched successfully", { groups });
  } catch (error: unknown) {
    const err = error as { statusCode?: number; message?: string };
    if (err.statusCode) {
      sendError(res, err.statusCode, err.message || "Something went wrong");
      return;
    }
    console.error("List message groups error:", error);
    sendError(res, 500, "Internal server error");
  }
};

export const createMessageGroup = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    if (!req.user) {
      sendError(res, 401, "Authentication required");
      return;
    }

    const parsed = createGroupSchema.safeParse(req.body);
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

    const group = await createMessageGroupService(req.user.userId, parsed.data);
    sendSuccess(res, 201, "Message group created successfully", group);
  } catch (error: unknown) {
    const err = error as { statusCode?: number; message?: string };
    if (err.statusCode) {
      sendError(res, err.statusCode, err.message || "Something went wrong");
      return;
    }
    console.error("Create message group error:", error);
    sendError(res, 500, "Internal server error");
  }
};

export const addMessageGroupMembers = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    if (!req.user) {
      sendError(res, 401, "Authentication required");
      return;
    }
    const groupId = req.params.groupId;
    if (!groupId) {
      sendError(res, 400, "Group ID is required");
      return;
    }
    const parsed = addMembersSchema.safeParse(req.body);
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
    await addMessageGroupMembersService(req.user.userId, groupId, parsed.data.memberIds);
    sendSuccess(res, 200, "Members added successfully");
  } catch (error: unknown) {
    const err = error as { statusCode?: number; message?: string };
    if (err.statusCode) {
      sendError(res, err.statusCode, err.message || "Something went wrong");
      return;
    }
    console.error("Add message group members error:", error);
    sendError(res, 500, "Internal server error");
  }
};

export const getMessageGroup = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    if (!req.user) {
      sendError(res, 401, "Authentication required");
      return;
    }
    const groupId = req.params.groupId;
    if (!groupId) {
      sendError(res, 400, "Group ID is required");
      return;
    }
    const group = await getMessageGroupByIdService(req.user.userId, groupId);
    sendSuccess(res, 200, "Message group fetched successfully", group);
  } catch (error: unknown) {
    const err = error as { statusCode?: number; message?: string };
    if (err.statusCode) {
      sendError(res, err.statusCode, err.message || "Something went wrong");
      return;
    }
    console.error("Get message group error:", error);
    sendError(res, 500, "Internal server error");
  }
};

export const getMessageGroupMessages = async (
  req: AuthRequest,
  res: Response
): Promise<void> => {
  try {
    if (!req.user) {
      sendError(res, 401, "Authentication required");
      return;
    }
    const groupId = req.params.groupId;
    if (!groupId) {
      sendError(res, 400, "Group ID is required");
      return;
    }
    const cursor = typeof req.query.cursor === "string" ? req.query.cursor : undefined;
    const limit = Math.min(parseInt(String(req.query.limit || "20"), 10) || 20, 50);
    const data = await getMessageGroupMessagesService(req.user.userId, groupId, limit, cursor);
    sendSuccess(res, 200, "Group messages fetched successfully", data);
  } catch (error: unknown) {
    const err = error as { statusCode?: number; message?: string };
    if (err.statusCode) {
      sendError(res, err.statusCode, err.message || "Something went wrong");
      return;
    }
    console.error("Get message group messages error:", error);
    sendError(res, 500, "Internal server error");
  }
};

export const sendMessageGroupMessage = async (
  req: AuthRequest,
  res: Response
): Promise<void> => {
  try {
    if (!req.user) {
      sendError(res, 401, "Authentication required");
      return;
    }
    const groupId = req.params.groupId;
    if (!groupId) {
      sendError(res, 400, "Group ID is required");
      return;
    }
    const parsed = sendMessageSchema.safeParse(req.body);
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

    const message = await sendMessageGroupMessageService(
      req.user.userId,
      groupId,
      parsed.data.content
    );

    try {
      const socketModule = await import("@/index");
      socketModule.socketService.emitMessageGroupMessage(groupId, message);
    } catch (socketErr) {
      console.error("Message group socket emit error:", socketErr);
    }

    sendSuccess(res, 201, "Group message sent successfully", message);
  } catch (error: unknown) {
    const err = error as { statusCode?: number; message?: string };
    if (err.statusCode) {
      sendError(res, err.statusCode, err.message || "Something went wrong");
      return;
    }
    console.error("Send group message error:", error);
    sendError(res, 500, "Internal server error");
  }
};

export const markMessageGroupMessagesRead = async (
  req: AuthRequest,
  res: Response
): Promise<void> => {
  try {
    if (!req.user) {
      sendError(res, 401, "Authentication required");
      return;
    }
    const groupId = req.params.groupId;
    if (!groupId) {
      sendError(res, 400, "Group ID is required");
      return;
    }
    const result = await markMessageGroupMessagesReadService(req.user.userId, groupId);
    sendSuccess(res, 200, "Group messages marked as read", result);
  } catch (error: unknown) {
    const err = error as { statusCode?: number; message?: string };
    if (err.statusCode) {
      sendError(res, err.statusCode, err.message || "Something went wrong");
      return;
    }
    console.error("Mark group messages read error:", error);
    sendError(res, 500, "Internal server error");
  }
};


