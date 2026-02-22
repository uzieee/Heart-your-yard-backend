import { Response } from "express";
import { z } from "zod";
import { sendSuccess, sendError } from "@/utils/apiResponse";
import { AuthRequest } from "@/middleware/authMiddleware";
import {
  createCommunityPostService,
  getCommunityPostsService,
  getCommunityFeedService,
  getPublicCommunityFeedService,
} from "@/services/communityPostsService";
import { uploadPostMedia } from "@/utils/upload";

const createCommunityPostSchema = z.object({
  description: z.string().optional().nullable(),
  location: z.string().optional().nullable(),
  locationCoordinates: z
    .union([
      z.object({ lat: z.number(), lng: z.number() }),
      z.string().transform((val) => {
        try {
          return typeof val === "string" ? JSON.parse(val) : val;
        } catch {
          return null;
        }
      }),
    ])
    .optional()
    .nullable(),
  plantingScheduleDate: z.string().optional().nullable(),
});

export const createCommunityPost = async (
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

    const parsed = createCommunityPostSchema.safeParse(req.body);
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

    const { description, location, locationCoordinates, plantingScheduleDate } = parsed.data;
    const media: Array<{ mediaType: "IMAGE" | "VIDEO"; mediaUrl: string }> = [];
    if (req.files && Array.isArray(req.files) && req.files.length > 0) {
      for (const file of req.files) {
        const mediaType = file.mimetype.startsWith("image/") ? "IMAGE" : "VIDEO";
        const folder = mediaType === "IMAGE" ? "images" : "videos";
        media.push({ mediaType, mediaUrl: `/uploads/${folder}/${file.filename}` });
      }
    } else if (req.file) {
      const mediaType = req.file.mimetype.startsWith("image/") ? "IMAGE" : "VIDEO";
      const folder = mediaType === "IMAGE" ? "images" : "videos";
      media.push({ mediaType, mediaUrl: `/uploads/${folder}/${req.file.filename}` });
    }

    const post = await createCommunityPostService({
      userId: req.user.userId,
      communityId,
      description: description || undefined,
      location: location || undefined,
      locationCoordinates: locationCoordinates || undefined,
      plantingScheduleDate: plantingScheduleDate ? new Date(plantingScheduleDate) : undefined,
      media,
    });

    try {
      const socketModule = await import("@/index");
      const socketService = socketModule.socketService;
      if (socketService && typeof socketService.emitCommunityPostCreated === "function") {
        socketService.emitCommunityPostCreated(communityId);
      }
    } catch (_) {}

    sendSuccess(res, 201, "Community post created", post);
  } catch (error: unknown) {
    const err = error as { statusCode?: number; message?: string };
    if (err.statusCode) {
      sendError(res, err.statusCode, err.message || "Something went wrong");
      return;
    }
    console.error("Create community post error:", error);
    sendError(res, 500, "Internal server error");
  }
};

export const getCommunityPosts = async (
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
    const cursor = typeof req.query.cursor === "string" ? req.query.cursor : undefined;
    const limit = Math.min(
      parseInt(String(req.query.limit || "10"), 10) || 10,
      50
    );

    const result = await getCommunityPostsService(
      communityId,
      req.user.userId,
      cursor,
      limit
    );

    sendSuccess(res, 200, "Community posts fetched", result);
  } catch (error: unknown) {
    const err = error as { statusCode?: number; message?: string };
    if (err.statusCode) {
      sendError(res, err.statusCode, err.message || "Something went wrong");
      return;
    }
    console.error("Get community posts error:", error);
    sendError(res, 500, "Internal server error");
  }
};

export const getCommunityFeed = async (
  req: AuthRequest,
  res: Response
): Promise<void> => {
  try {
    if (!req.user) {
      sendError(res, 401, "Authentication required");
      return;
    }
    const cursor = typeof req.query.cursor === "string" ? req.query.cursor : undefined;
    const limit = Math.min(
      parseInt(String(req.query.limit || "10"), 10) || 10,
      50
    );

    const result = await getCommunityFeedService(
      req.user.userId,
      cursor,
      limit
    );

    sendSuccess(res, 200, "Community feed fetched", result);
  } catch (error: unknown) {
    const err = error as { statusCode?: number; message?: string };
    if (err.statusCode) {
      sendError(res, err.statusCode, err.message || "Something went wrong");
      return;
    }
    console.error("Get community feed error:", error);
    sendError(res, 500, "Internal server error");
  }
};

export const getPublicCommunityFeed = async (
  req: AuthRequest,
  res: Response
): Promise<void> => {
  try {
    const cursor = typeof req.query.cursor === "string" ? req.query.cursor : undefined;
    const limit = Math.min(
      parseInt(String(req.query.limit || "10"), 10) || 10,
      50
    );
    const currentUserId = req.user?.userId ?? null;

    const result = await getPublicCommunityFeedService(
      currentUserId,
      cursor,
      limit
    );

    sendSuccess(res, 200, "Public community feed fetched", result);
  } catch (error: unknown) {
    const err = error as { statusCode?: number; message?: string };
    if (err.statusCode) {
      sendError(res, err.statusCode, err.message || "Something went wrong");
      return;
    }
    console.error("Get public community feed error:", error);
    sendError(res, 500, "Internal server error");
  }
};

