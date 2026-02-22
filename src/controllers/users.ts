import { Response } from "express";
import { sendSuccess, sendError } from "@/utils/apiResponse";
import { AuthRequest } from "@/middleware/authMiddleware";
import { getUsersService, getCurrentUserService } from "@/services/usersService";

export const getUsers = async (
  req: AuthRequest,
  res: Response
): Promise<void> => {
  try {
    if (!req.user) {
      sendError(res, 401, "Authentication required");
      return;
    }

    const cursor = req.query.cursor as string | undefined;
    const limit = parseInt(req.query.limit as string) || 10;

    const result = await getUsersService(req.user.userId, cursor, limit);

    sendSuccess(res, 200, "Users fetched successfully", result);
  } catch (error: unknown) {
    const err = error as { statusCode?: number; message?: string };
    if (err.statusCode) {
      sendError(res, err.statusCode, err.message || "Something went wrong");
      return;
    }
    console.error("Get users error:", error);
    sendError(res, 500, "Internal server error");
  }
};

export const getCurrentUser = async (
  req: AuthRequest,
  res: Response
): Promise<void> => {
  try {
    if (!req.user) {
      sendError(res, 401, "Authentication required");
      return;
    }

    const result = await getCurrentUserService(req.user.userId);

    sendSuccess(res, 200, "Current user fetched successfully", result);
  } catch (error: unknown) {
    const err = error as { statusCode?: number; message?: string };
    if (err.statusCode) {
      sendError(res, err.statusCode, err.message || "Something went wrong");
      return;
    }
    console.error("Get current user error:", error);
    sendError(res, 500, "Internal server error");
  }
};




