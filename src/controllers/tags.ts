import { Response } from "express";
import { sendError, sendSuccess } from "@/utils/apiResponse";
import { AuthRequest } from "@/middleware/authMiddleware";
import { listTrendingTags } from "@/services/tagsService";

const formatTagCount = (count: number): string => {
  if (count >= 1_000_000) return `${(count / 1_000_000).toFixed(1)}M`;
  if (count >= 1_000) return `${(count / 1_000).toFixed(1)}K`;
  return String(count);
};

export const getTrendingTags = async (
  req: AuthRequest,
  res: Response
): Promise<void> => {
  try {
    if (!req.user) {
      sendError(res, 401, "Authentication required");
      return;
    }

    const limit = req.query.limit ? parseInt(req.query.limit as string, 10) : 10;
    const cursor = (req.query.cursor as string) || null;
    const result = await listTrendingTags(limit, cursor);

    sendSuccess(res, 200, "Trending tags fetched successfully", {
      tags: result.tags.map((tag) => ({
        id: tag.id,
        tag: `#${tag.name}`,
        count: formatTagCount(tag.posts_count),
        postsCount: tag.posts_count,
      })),
      hasMore: result.hasMore,
      nextCursor: result.nextCursor,
    });
  } catch (error: unknown) {
    const err = error as { statusCode?: number; message?: string };
    if (err.statusCode) {
      sendError(res, err.statusCode, err.message || "Something went wrong");
      return;
    }
    console.error("Get trending tags error:", error);
    sendError(res, 500, "Internal server error");
  }
};

