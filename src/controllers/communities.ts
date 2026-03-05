import { Response } from "express";
import { z } from "zod";
import { sendSuccess, sendError } from "@/utils/apiResponse";
import { AuthRequest } from "@/middleware/authMiddleware";
import {
  createCommunityService,
  getMyCommunitiesService,
  getDiscoverCommunitiesService,
  getDiscoverCommunitiesPaginatedService,
  getCommunityByIdService,
  getCommunityMembersService,
  joinCommunityService,
  addCommunityMemberService,
  leaveCommunityService,
  updateCommunityService,
  deleteCommunityService,
} from "@/services/communitiesService";
import type { DiscoverSort, DiscoverTimeFilter } from "@/services/communitiesService";

const createCommunitySchema = z.object({
  name: z.string().min(1, "Name is required").max(255),
  description: z.string().max(2000).optional(),
  image: z.string().url().optional().or(z.literal("")),
});

export const createCommunity = async (
  req: AuthRequest,
  res: Response
): Promise<void> => {
  try {
    if (!req.user) {
      sendError(res, 401, "Authentication required");
      return;
    }

    const parsed = createCommunitySchema.safeParse(req.body);
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

    const payload = parsed.data;
    const community = await createCommunityService(req.user.userId, {
      name: payload.name,
      description: payload.description,
      image: payload.image && payload.image.length > 0 ? payload.image : undefined,
    });

    try {
      const socketModule = await import("@/index");
      const socketService = socketModule.socketService;
      if (socketService) {
        socketService.broadcastCommunityCreated({ communityId: community.id });
      }
    } catch (socketErr) {
      console.error("Error emitting community-created socket:", socketErr);
    }

    sendSuccess(res, 201, "Community created successfully", community);
  } catch (error: unknown) {
    const err = error as { statusCode?: number; message?: string };
    if (err.statusCode) {
      sendError(res, err.statusCode, err.message || "Something went wrong");
      return;
    }
    console.error("Create community error:", error);
    sendError(res, 500, "Internal server error");
  }
};

export const getMyCommunities = async (
  req: AuthRequest,
  res: Response
): Promise<void> => {
  try {
    if (!req.user) {
      sendError(res, 401, "Authentication required");
      return;
    }

    const limit = Math.min(
      parseInt(String(req.query.limit || "50"), 10) || 50,
      50
    );
    const communities = await getMyCommunitiesService(req.user.userId, limit);

    sendSuccess(res, 200, "My communities fetched successfully", {
      communities,
    });
  } catch (error: unknown) {
    const err = error as { statusCode?: number; message?: string };
    if (err.statusCode) {
      sendError(res, err.statusCode, err.message || "Something went wrong");
      return;
    }
    console.error("Get my communities error:", error);
    sendError(res, 500, "Internal server error");
  }
};

const DISCOVER_SORT_VALUES: DiscoverSort[] = ["newest", "oldest", "most_members", "least_members"];
const DISCOVER_TIME_VALUES: DiscoverTimeFilter[] = ["all", "last_week", "last_month", "last_3_months"];

export const getDiscoverCommunities = async (
  req: AuthRequest,
  res: Response
): Promise<void> => {
  try {
    const search = typeof req.query.search === "string" ? req.query.search : "";
    const limit = Math.min(
      parseInt(String(req.query.limit || "12"), 10) || 12,
      50
    );
    const page = Math.max(1, parseInt(String(req.query.page || "1"), 10) || 1);
    const sortParam = typeof req.query.sort === "string" ? req.query.sort : "newest";
    const timeParam = typeof req.query.timeFilter === "string" ? req.query.timeFilter : "all";
    const sort: DiscoverSort = DISCOVER_SORT_VALUES.includes(sortParam as DiscoverSort) ? sortParam as DiscoverSort : "newest";
    const timeFilter: DiscoverTimeFilter = DISCOVER_TIME_VALUES.includes(timeParam as DiscoverTimeFilter) ? timeParam as DiscoverTimeFilter : "all";
    const userId = req.user?.userId;

    const result = await getDiscoverCommunitiesPaginatedService({
      search: search || undefined,
      page,
      limit,
      userId,
      sort,
      timeFilter,
    });

    sendSuccess(res, 200, "Communities fetched successfully", result);
  } catch (error: unknown) {
    const err = error as { statusCode?: number; message?: string };
    if (err.statusCode) {
      sendError(res, err.statusCode, err.message || "Something went wrong");
      return;
    }
    console.error("Get discover communities error:", error);
    sendError(res, 500, "Internal server error");
  }
};

const updateCommunitySchema = z.object({
  name: z.string().min(1, "Name is required").max(255).optional(),
  description: z.string().max(2000).optional().nullable(),
  image: z.string().url().optional().or(z.literal("")).nullable(),
});

export const updateCommunity = async (
  req: AuthRequest,
  res: Response
): Promise<void> => {
  try {
    if (!req.user) {
      sendError(res, 401, "Authentication required");
      return;
    }

    const { communityId } = req.params;
    if (!communityId) {
      sendError(res, 400, "Community ID is required");
      return;
    }

    const parsed = updateCommunitySchema.safeParse(req.body);
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

    const payload = parsed.data;
    const updateData: { name?: string; description?: string | null; image?: string | null } = {};
    if (payload.name !== undefined) updateData.name = payload.name;
    if (payload.description !== undefined) updateData.description = payload.description ?? null;
    if (payload.image !== undefined) updateData.image = payload.image && payload.image.length > 0 ? payload.image : null;

    const community = await updateCommunityService(req.user.userId, communityId, updateData);

    try {
      const socketModule = await import("@/index");
      const socketService = socketModule.socketService;
      if (socketService) {
        socketService.emitCommunityUpdated(communityId);
      }
    } catch (socketErr) {
      console.error("Error emitting community-updated socket:", socketErr);
    }

    sendSuccess(res, 200, "Community updated successfully", community);
  } catch (error: unknown) {
    const err = error as { statusCode?: number; message?: string };
    if (err.statusCode) {
      sendError(res, err.statusCode, err.message || "Something went wrong");
      return;
    }
    console.error("Update community error:", error);
    sendError(res, 500, "Internal server error");
  }
};

export const getCommunityById = async (
  req: AuthRequest,
  res: Response
): Promise<void> => {
  try {
    const { communityId } = req.params;
    if (!communityId) {
      sendError(res, 400, "Community ID is required");
      return;
    }

    const userId = req.user?.userId;
    const community = await getCommunityByIdService(communityId, userId);

    if (!community) {
      sendError(res, 404, "Community not found");
      return;
    }

    sendSuccess(res, 200, "Community fetched successfully", community);
  } catch (error: unknown) {
    const err = error as { statusCode?: number; message?: string };
    if (err.statusCode) {
      sendError(res, err.statusCode, err.message || "Something went wrong");
      return;
    }
    console.error("Get community by id error:", error);
    sendError(res, 500, "Internal server error");
  }
};

export const getCommunityMembers = async (
  req: AuthRequest,
  res: Response
): Promise<void> => {
  try {
    const { communityId } = req.params;
    if (!communityId) {
      sendError(res, 400, "Community ID is required");
      return;
    }

    const limit = Math.min(
      parseInt(String(req.query.limit || "50"), 10) || 50,
      50
    );
    const members = await getCommunityMembersService(communityId, limit);

    sendSuccess(res, 200, "Members fetched successfully", { members });
  } catch (error: unknown) {
    const err = error as { statusCode?: number; message?: string };
    if (err.statusCode) {
      sendError(res, err.statusCode, err.message || "Something went wrong");
      return;
    }
    console.error("Get community members error:", error);
    sendError(res, 500, "Internal server error");
  }
};

export const joinCommunity = async (
  req: AuthRequest,
  res: Response
): Promise<void> => {
  try {
    if (!req.user) {
      sendError(res, 401, "Authentication required");
      return;
    }

    const { communityId } = req.params;
    if (!communityId) {
      sendError(res, 400, "Community ID is required");
      return;
    }

    await joinCommunityService(req.user.userId, communityId);

    try {
      const socketModule = await import("@/index");
      const socketService = socketModule.socketService;
      if (socketService) {
        socketService.emitCommunityUpdate(communityId, {
          type: "member_joined",
          communityId,
        });
        socketService.broadcastCommunityUpdate({
          type: "member_joined",
          communityId,
        });
      }
    } catch (socketErr) {
      console.error("Error emitting community join socket:", socketErr);
    }

    sendSuccess(res, 200, "Joined community successfully");
  } catch (error: unknown) {
    const err = error as { statusCode?: number; message?: string };
    if (err.statusCode) {
      sendError(res, err.statusCode, err.message || "Something went wrong");
      return;
    }
    console.error("Join community error:", error);
    sendError(res, 500, "Internal server error");
  }
};

export const leaveCommunity = async (
  req: AuthRequest,
  res: Response
): Promise<void> => {
  try {
    if (!req.user) {
      sendError(res, 401, "Authentication required");
      return;
    }

    const { communityId } = req.params;
    if (!communityId) {
      sendError(res, 400, "Community ID is required");
      return;
    }

    await leaveCommunityService(req.user.userId, communityId);

    try {
      const socketModule = await import("@/index");
      const socketService = socketModule.socketService;
      if (socketService) {
        socketService.emitCommunityUpdate(communityId, {
          type: "member_left",
          communityId,
        });
        socketService.broadcastCommunityUpdate({
          type: "member_left",
          communityId,
        });
      }
    } catch (socketErr) {
      console.error("Error emitting community leave socket:", socketErr);
    }

    sendSuccess(res, 200, "Left community successfully");
  } catch (error: unknown) {
    const err = error as { statusCode?: number; message?: string };
    if (err.statusCode) {
      sendError(res, err.statusCode, err.message || "Something went wrong");
      return;
    }
    console.error("Leave community error:", error);
    sendError(res, 500, "Internal server error");
  }
};

const addCommunityMemberSchema = z.object({
  userId: z.string().uuid("Valid userId is required"),
});

export const addCommunityMember = async (
  req: AuthRequest,
  res: Response
): Promise<void> => {
  try {
    if (!req.user) {
      sendError(res, 401, "Authentication required");
      return;
    }
    const { communityId } = req.params;
    if (!communityId) {
      sendError(res, 400, "Community ID is required");
      return;
    }

    const parsed = addCommunityMemberSchema.safeParse(req.body);
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

    await addCommunityMemberService(req.user.userId, communityId, parsed.data.userId);

    try {
      const socketModule = await import("@/index");
      const socketService = socketModule.socketService;
      if (socketService) {
        socketService.emitCommunityUpdate(communityId, {
          type: "member_joined",
          communityId,
        });
        socketService.broadcastCommunityUpdate({
          type: "member_joined",
          communityId,
        });
      }
    } catch (socketErr) {
      console.error("Error emitting community add-member socket:", socketErr);
    }

    sendSuccess(res, 200, "Member added successfully");
  } catch (error: unknown) {
    const err = error as { statusCode?: number; message?: string };
    if (err.statusCode) {
      sendError(res, err.statusCode, err.message || "Something went wrong");
      return;
    }
    console.error("Add community member error:", error);
    sendError(res, 500, "Internal server error");
  }
};

export const deleteCommunity = async (
  req: AuthRequest,
  res: Response
): Promise<void> => {
  try {
    if (!req.user) {
      sendError(res, 401, "Authentication required");
      return;
    }

    const { communityId } = req.params;
    if (!communityId) {
      sendError(res, 400, "Community ID is required");
      return;
    }

    await deleteCommunityService(req.user.userId, communityId);

    sendSuccess(res, 200, "Community deleted successfully");
  } catch (error: unknown) {
    const err = error as { statusCode?: number; message?: string };
    if (err.statusCode) {
      sendError(res, err.statusCode, err.message || "Something went wrong");
      return;
    }
    console.error("Delete community error:", error);
    sendError(res, 500, "Internal server error");
  }
};
