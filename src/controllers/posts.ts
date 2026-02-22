import { Response } from "express";
import { z } from "zod";
import { sendSuccess, sendError } from "@/utils/apiResponse";
import { createPostService, getPostsService } from "@/services/postsService";
import { AuthRequest } from "@/middleware/authMiddleware";
import { uploadPostMedia } from "@/utils/upload";
import path from "path";
import sequelize from "database";
import { QueryTypes } from "sequelize";

// Validation schema for creating post
const createPostSchema = z.object({
  description: z.string().optional().nullable(),
  location: z.string().optional().nullable(),
  locationCoordinates: z
    .union([
      z.object({
        lat: z.number(),
        lng: z.number(),
      }),
      z.string(), // Can be JSON string from FormData
    ])
    .optional()
    .nullable()
    .transform((val) => {
      if (typeof val === 'string') {
        try {
          return JSON.parse(val);
        } catch {
          return null;
        }
      }
      return val;
    }),
  plantingScheduleDate: z.string().optional().nullable(),
});

export const createPost = async (
  req: AuthRequest,
  res: Response
): Promise<void> => {
  try {
    if (!req.user) {
      sendError(res, 401, "Authentication required");
      return;
    }

    const parsed = createPostSchema.safeParse(req.body);
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

    const { description, location, locationCoordinates, plantingScheduleDate } = parsed.data;

    // Handle media files
    const media: Array<{ mediaType: "IMAGE" | "VIDEO"; mediaUrl: string }> = [];
    
    if (req.files && Array.isArray(req.files) && req.files.length > 0) {
      for (const file of req.files) {
        const mediaType = file.mimetype.startsWith("image/") ? "IMAGE" : "VIDEO";
        // Determine the folder path based on media type
        const folder = mediaType === "IMAGE" ? "images" : "videos";
        const mediaUrl = `/uploads/${folder}/${file.filename}`;
        media.push({ mediaType, mediaUrl });
      }
    } else if (req.file) {
      // Single file upload
      const mediaType = req.file.mimetype.startsWith("image/") ? "IMAGE" : "VIDEO";
      const folder = mediaType === "IMAGE" ? "images" : "videos";
      const mediaUrl = `/uploads/${folder}/${req.file.filename}`;
      media.push({ mediaType, mediaUrl });
    }

    const post = await createPostService({
      userId: req.user.userId,
      description: description || undefined,
      location: location || undefined,
      locationCoordinates: locationCoordinates || undefined,
      plantingScheduleDate: plantingScheduleDate ? new Date(plantingScheduleDate) : undefined,
      media,
    });

    // Create notifications for followers
    try {
      const { createNotificationService } = await import("@/services/notificationsService");
      
      // Get all users following the post creator
      const followers = await sequelize.query(
        `SELECT follower_id FROM follows WHERE following_id = $1 AND deleted_at IS NULL`,
        {
          bind: [req.user.userId],
          type: QueryTypes.SELECT,
        }
      );

      // Create notifications for each follower
      for (const follower of followers) {
        try {
          await createNotificationService({
            userId: (follower as any).follower_id,
            actorId: req.user.userId,
            type: "POST_CREATED",
            referenceId: post.id,
            referenceType: "POST",
          });
        } catch (notifError) {
          // Continue even if notification creation fails
          console.error("Error creating notification:", notifError);
        }
      }
    } catch (notifError) {
      console.error("Error creating post notifications:", notifError);
    }

    // Emit socket event for new post to all connected users
    try {
      // Get socket service instance dynamically
      const socketModule = await import("@/index");
      const socketService = socketModule.socketService;
      
      if (socketService) {
        // Broadcast to all users who are subscribed to feed
        socketService.broadcastFeedUpdate({
          type: "new-post",
          post,
        });
        
        console.log(`📢 Post broadcasted to all users: ${post.id}`, {
          postId: post.id,
          userId: post.user_id,
          hasMedia: post.media?.length > 0,
        });
        
        // Broadcast notification to followers
        const followers = await sequelize.query(
          `SELECT follower_id FROM follows WHERE following_id = $1 AND deleted_at IS NULL`,
          {
            bind: [req.user.userId],
            type: QueryTypes.SELECT,
          }
        );

        followers.forEach((follower: any) => {
          socketService.emitNotification(follower.follower_id, {
            type: "new-notification",
          });
        });
      }
    } catch (socketError) {
      // Don't fail the request if socket emission fails
      console.error("Error emitting socket event:", socketError);
    }

    sendSuccess(res, 201, "Post created successfully", post);
  } catch (error: unknown) {
    const err = error as { statusCode?: number; message?: string };
    if (err.statusCode) {
      sendError(res, err.statusCode, err.message || "Something went wrong");
      return;
    }
    console.error("Create post error:", error);
    sendError(res, 500, "Internal server error");
  }
};

export const getPosts = async (
  req: AuthRequest,
  res: Response
): Promise<void> => {
  try {
    if (!req.user) {
      sendError(res, 401, "Authentication required");
      return;
    }

    const cursor = req.query.cursor as string | undefined;
    const limit = req.query.limit ? parseInt(req.query.limit as string) : 10;

    const result = await getPostsService(req.user.userId, cursor, limit);

    sendSuccess(res, 200, "Posts fetched successfully", result);
  } catch (error: unknown) {
    const err = error as { statusCode?: number; message?: string };
    if (err.statusCode) {
      sendError(res, err.statusCode, err.message || "Something went wrong");
      return;
    }
    console.error("Get posts error:", error);
    sendError(res, 500, "Internal server error");
  }
};

