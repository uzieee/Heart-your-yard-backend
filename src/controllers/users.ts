import { Response } from "express";
import { z } from "zod";
import { sendSuccess, sendError } from "@/utils/apiResponse";
import { AuthRequest } from "@/middleware/authMiddleware";
import {
  getUsersService,
  getCurrentUserService,
  getProfileHeaderService,
  getProfileAboutService,
  updateProfileAboutService,
} from "@/services/usersService";

const updateProfileAboutSchema = z.object({
  gender: z.string().optional().nullable(),
  dateOfBirth: z.string().optional().nullable(),
  location: z.string().optional().nullable(),
  email: z.string().email().optional().nullable(),
  phone: z.string().optional().nullable(),
});

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
    const search = req.query.search as string | undefined;

    const result = await getUsersService(req.user.userId, cursor, limit, search);

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

export const getProfileHeader = async (
  req: AuthRequest,
  res: Response
): Promise<void> => {
  try {
    if (!req.user) {
      sendError(res, 401, "Authentication required");
      return;
    }
    const result = await getProfileHeaderService(req.user.userId);
    sendSuccess(res, 200, "Profile header fetched successfully", result);
  } catch (error: unknown) {
    const err = error as { statusCode?: number; message?: string };
    if (err.statusCode) {
      sendError(res, err.statusCode, err.message || "Something went wrong");
      return;
    }
    console.error("Get profile header error:", error);
    sendError(res, 500, "Internal server error");
  }
};

export const getProfileAbout = async (
  req: AuthRequest,
  res: Response
): Promise<void> => {
  try {
    if (!req.user) {
      sendError(res, 401, "Authentication required");
      return;
    }
    const result = await getProfileAboutService(req.user.userId);
    sendSuccess(res, 200, "Profile about fetched successfully", result);
  } catch (error: unknown) {
    const err = error as { statusCode?: number; message?: string };
    if (err.statusCode) {
      sendError(res, err.statusCode, err.message || "Something went wrong");
      return;
    }
    console.error("Get profile about error:", error);
    sendError(res, 500, "Internal server error");
  }
};

export const updateProfileAbout = async (
  req: AuthRequest,
  res: Response
): Promise<void> => {
  try {
    if (!req.user) {
      sendError(res, 401, "Authentication required");
      return;
    }
    const parsed = updateProfileAboutSchema.safeParse(req.body);
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
    await updateProfileAboutService(req.user.userId, {
      gender: parsed.data.gender,
      dateOfBirth: parsed.data.dateOfBirth,
      location: parsed.data.location,
      email: parsed.data.email,
      phone: parsed.data.phone,
    });
    sendSuccess(res, 200, "Profile about updated successfully");
  } catch (error: unknown) {
    const err = error as { statusCode?: number; message?: string };
    if (err.statusCode) {
      sendError(res, err.statusCode, err.message || "Something went wrong");
      return;
    }
    console.error("Update profile about error:", error);
    sendError(res, 500, "Internal server error");
  }
};
