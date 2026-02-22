import { Request, Response } from "express";
import { z } from "zod";
import { sendSuccess, sendError } from "@/utils/apiResponse";
import {
  sendMessageService,
  getMessagesService,
  markMessagesAsReadService,
  getUnreadCountService,
  getAllUnreadCountsService,
  SendMessagePayload,
} from "@/services/messagesService";
import { uploadPostMedia } from "@/utils/upload";

// Validation schemas
const sendMessageSchema = z.object({
  receiver_id: z.string().uuid("Invalid receiver ID"),
  content: z.string().optional(),
  message_type: z.enum(["text", "image", "video"]),
  media: z
    .array(
      z.object({
        media_url: z.string(),
        media_type: z.enum(["image", "video"]),
        file_name: z.string().optional(),
        file_size: z.number().optional(),
        mime_type: z.string().optional(),
      })
    )
    .optional(),
});

const getMessagesSchema = z.object({
  otherUserId: z.string().uuid("Invalid user ID"),
  limit: z.string().optional().transform((val) => (val ? parseInt(val) : 20)),
  cursor: z.string().optional(),
});

// Send a message (with optional file uploads)
export const sendMessage = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    const userId = (req as any).user?.userId;
    if (!userId) {
      sendError(res, 401, "Unauthorized");
      return;
    }

    // Handle file uploads if present
    const files = req.files as Express.Multer.File[] | undefined;
    const media: any[] = [];

    if (files && files.length > 0) {
      const baseUrl = process.env.API_URL || `http://localhost:${process.env.PORT || 4269}`;
      
      for (const file of files) {
        const isImage = file.mimetype.startsWith('image/');
        const isVideo = file.mimetype.startsWith('video/');
        
        if (isImage || isVideo) {
          // Determine the correct path based on file location
          const filePath = isImage 
            ? `/uploads/images/${file.filename}`
            : `/uploads/videos/${file.filename}`;
          
          media.push({
            media_url: filePath,
            media_type: isImage ? 'image' : 'video',
            file_name: file.originalname,
            file_size: file.size,
            mime_type: file.mimetype,
          });
        }
      }
    }

    // Parse body (FormData sends data as strings)
    const bodyData: any = {
      receiver_id: req.body.receiver_id,
      content: req.body.content || undefined,
      message_type: req.body.message_type || (media.length > 0 ? media[0].media_type : 'text'),
    };

    const parsed = sendMessageSchema.safeParse(bodyData);
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

    const payload: SendMessagePayload = {
      ...parsed.data,
      media: media.length > 0 ? media : parsed.data.media,
    };

    const message = await sendMessageService(userId, payload);

    // Emit via socket for real-time delivery
    try {
      const socketModule = await import("@/index");
      const socketService = (socketModule as any).socketService;
      if (socketService) {
        const io = socketService.getIO();
        const isReceiverOnline = socketService.isUserOnline(payload.receiver_id);
        
        // Always emit to receiver's notification room (whether online or not)
        io.to(`notifications-${payload.receiver_id}`).emit("receive-message", message);
        
        // Also emit a custom event to update unread counts for the receiver
        io.to(`notifications-${payload.receiver_id}`).emit("message-unread-update", {
          senderId: userId,
          messageId: message.id,
        });
        
        console.log(`📤 Message sent via socket to ${payload.receiver_id}, online: ${isReceiverOnline}`);
      }
    } catch (error) {
      console.error("Error emitting message via socket:", error);
      // Don't fail the request if socket emit fails
    }

    sendSuccess(res, 201, "Message sent successfully", message);
  } catch (error: unknown) {
    const err = error as { statusCode?: number; message?: string };
    if (err.statusCode) {
      sendError(res, err.statusCode, err.message || "Something went wrong");
      return;
    }
    console.error("Send message error:", error);
    sendError(res, 500, "Internal server error");
  }
};

// Get messages between two users
export const getMessages = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    const userId = (req as any).user?.userId;
    if (!userId) {
      sendError(res, 401, "Unauthorized");
      return;
    }

    const parsed = getMessagesSchema.safeParse({
      otherUserId: req.params.userId,
      limit: req.query.limit,
      cursor: req.query.cursor,
    });

    if (!parsed.success) {
      sendError(res, 422, "Invalid parameters");
      return;
    }

    const { otherUserId, limit, cursor } = parsed.data;
    const result = await getMessagesService(userId, otherUserId, limit, cursor);

    sendSuccess(res, 200, "Messages retrieved successfully", result);
  } catch (error: unknown) {
    const err = error as { statusCode?: number; message?: string };
    if (err.statusCode) {
      sendError(res, err.statusCode, err.message || "Something went wrong");
      return;
    }
    console.error("Get messages error:", error);
    sendError(res, 500, "Internal server error");
  }
};

// Mark messages as read
export const markMessagesAsRead = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    const userId = (req as any).user?.userId;
    if (!userId) {
      sendError(res, 401, "Unauthorized");
      return;
    }

    const otherUserId = req.params.userId;
    if (!otherUserId || !z.string().uuid().safeParse(otherUserId).success) {
      sendError(res, 422, "Invalid user ID");
      return;
    }

    const result = await markMessagesAsReadService(userId, otherUserId);

    sendSuccess(res, 200, "Messages marked as read", result);
  } catch (error: unknown) {
    const err = error as { statusCode?: number; message?: string };
    if (err.statusCode) {
      sendError(res, err.statusCode, err.message || "Something went wrong");
      return;
    }
    console.error("Mark messages as read error:", error);
    sendError(res, 500, "Internal server error");
  }
};

// Get unread count for a conversation
export const getUnreadCount = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    const userId = (req as any).user?.userId;
    if (!userId) {
      sendError(res, 401, "Unauthorized");
      return;
    }

    const otherUserId = req.params.userId;
    if (!otherUserId || !z.string().uuid().safeParse(otherUserId).success) {
      sendError(res, 422, "Invalid user ID");
      return;
    }

    const result = await getUnreadCountService(userId, otherUserId);

    sendSuccess(res, 200, "Unread count retrieved", result);
  } catch (error: unknown) {
    const err = error as { statusCode?: number; message?: string };
    if (err.statusCode) {
      sendError(res, err.statusCode, err.message || "Something went wrong");
      return;
    }
    console.error("Get unread count error:", error);
    sendError(res, 500, "Internal server error");
  }
};

// Get all unread counts
export const getAllUnreadCounts = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    const userId = (req as any).user?.userId;
    if (!userId) {
      sendError(res, 401, "Unauthorized");
      return;
    }

    const result = await getAllUnreadCountsService(userId);

    sendSuccess(res, 200, "Unread counts retrieved", result);
  } catch (error: unknown) {
    const err = error as { statusCode?: number; message?: string };
    if (err.statusCode) {
      sendError(res, err.statusCode, err.message || "Something went wrong");
      return;
    }
    console.error("Get all unread counts error:", error);
    sendError(res, 500, "Internal server error");
  }
};

