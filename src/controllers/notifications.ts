import { Response } from "express";
import { sendSuccess, sendError } from "@/utils/apiResponse";
import {
  getNotificationsService,
  markNotificationAsReadService,
  markAllNotificationsAsReadService,
} from "@/services/notificationsService";
import { AuthRequest } from "@/middleware/authMiddleware";

export const getNotifications = async (
  req: AuthRequest,
  res: Response
): Promise<void> => {
  try {
    if (!req.user) {
      sendError(res, 401, "Authentication required");
      return;
    }

    const limit = req.query.limit ? parseInt(req.query.limit as string) : 20;
    const offset = req.query.offset ? parseInt(req.query.offset as string) : 0;

    const result = await getNotificationsService(req.user.userId, limit, offset);

    sendSuccess(res, 200, "Notifications fetched successfully", result);
  } catch (error: unknown) {
    const err = error as { statusCode?: number; message?: string };
    if (err.statusCode) {
      sendError(res, err.statusCode, err.message || "Something went wrong");
      return;
    }
    console.error("Get notifications error:", error);
    sendError(res, 500, "Internal server error");
  }
};

export const markNotificationAsRead = async (
  req: AuthRequest,
  res: Response
): Promise<void> => {
  try {
    if (!req.user) {
      sendError(res, 401, "Authentication required");
      return;
    }

    const notificationId = req.params.notificationId;
    if (!notificationId) {
      sendError(res, 400, "Notification ID is required");
      return;
    }

    await markNotificationAsReadService(notificationId, req.user.userId);

    sendSuccess(res, 200, "Notification marked as read");
  } catch (error: unknown) {
    const err = error as { statusCode?: number; message?: string };
    if (err.statusCode) {
      sendError(res, err.statusCode, err.message || "Something went wrong");
      return;
    }
    console.error("Mark notification as read error:", error);
    sendError(res, 500, "Internal server error");
  }
};

export const markAllNotificationsAsRead = async (
  req: AuthRequest,
  res: Response
): Promise<void> => {
  try {
    if (!req.user) {
      sendError(res, 401, "Authentication required");
      return;
    }

    await markAllNotificationsAsReadService(req.user.userId);

    sendSuccess(res, 200, "All notifications marked as read");
  } catch (error: unknown) {
    const err = error as { statusCode?: number; message?: string };
    if (err.statusCode) {
      sendError(res, err.statusCode, err.message || "Something went wrong");
      return;
    }
    console.error("Mark all notifications as read error:", error);
    sendError(res, 500, "Internal server error");
  }
};


