import { Response } from "express";
import { z } from "zod";
import { sendError, sendSuccess } from "@/utils/apiResponse";
import { AuthRequest } from "@/middleware/authMiddleware";
import {
  createPlantingTask,
  listMyPlantingTasks,
  updatePlantingTask,
} from "@/services/plantingTasksService";
import { createPostService } from "@/services/postsService";
import { createCommunityPostService } from "@/services/communityPostsService";

const createTaskSchema = z.object({
  title: z.string().trim().min(1, "Title is required").max(200, "Title is too long"),
  details: z.string().optional().nullable(),
  startDate: z.string().min(1, "Start date is required"),
  dueDate: z.string().min(1, "Due date is required"),
});

const updateTaskSchema = z.object({
  title: z.string().trim().min(1).max(200).optional(),
  details: z.string().optional().nullable(),
  startDate: z.string().optional().nullable(),
  dueDate: z.string().optional().nullable(),
});

const postTaskSchema = z.object({
  communityId: z.string().uuid().optional().nullable(),
});

const getImageUrlFromFile = (filename: string) => `/uploads/images/${filename}`;

export const getMyPlantingTasks = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    if (!req.user) {
      sendError(res, 401, "Authentication required");
      return;
    }

    const limit = req.query.limit ? parseInt(req.query.limit as string, 10) : 10;
    const cursor = (req.query.cursor as string) || null;
    const result = await listMyPlantingTasks(req.user.userId, limit, cursor);

    sendSuccess(res, 200, "Planting tasks fetched successfully", {
      tasks: result.tasks,
      hasMore: result.hasMore,
      nextCursor: result.nextCursor,
      summary: result.summary,
    });
  } catch (error: unknown) {
    const err = error as { statusCode?: number; message?: string };
    if (err.statusCode) {
      sendError(res, err.statusCode, err.message || "Something went wrong");
      return;
    }
    console.error("Get planting tasks error:", error);
    sendError(res, 500, "Internal server error");
  }
};

export const createMyPlantingTask = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    if (!req.user) {
      sendError(res, 401, "Authentication required");
      return;
    }

    const parsed = createTaskSchema.safeParse(req.body);
    if (!parsed.success) {
      sendError(res, 422, "Validation failed", {
        fields: parsed.error.errors.map((e) => `${e.path.join(".")}: ${e.message}`),
      });
      return;
    }

    const imageUrl = req.file ? getImageUrlFromFile(req.file.filename) : null;
    const startDate = new Date(parsed.data.startDate);
    const dueDate = new Date(parsed.data.dueDate);
    if (Number.isNaN(startDate.getTime()) || Number.isNaN(dueDate.getTime())) {
      sendError(res, 422, "Invalid start or due date");
      return;
    }
    if (dueDate.getTime() < startDate.getTime()) {
      sendError(res, 422, "Due date cannot be before start date");
      return;
    }
    const task = await createPlantingTask({
      userId: req.user.userId,
      title: parsed.data.title,
      details: parsed.data.details ?? null,
      startDate: parsed.data.startDate,
      dueDate: parsed.data.dueDate,
      imageUrl,
    });

    try {
      const socketModule = await import("@/index");
      socketModule.socketService.broadcastPlantingTasksUpdate({
        type: "planting-task-created",
        task,
      });
    } catch (socketError) {
      console.error("Planting task socket emit error:", socketError);
    }

    sendSuccess(res, 201, "Planting task created successfully", task);
  } catch (error: unknown) {
    const err = error as { statusCode?: number; message?: string };
    if (err.statusCode) {
      sendError(res, err.statusCode, err.message || "Something went wrong");
      return;
    }
    console.error("Create planting task error:", error);
    sendError(res, 500, "Internal server error");
  }
};

export const updateMyPlantingTask = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    if (!req.user) {
      sendError(res, 401, "Authentication required");
      return;
    }

    const taskId = req.params.taskId;
    if (!taskId) {
      sendError(res, 400, "taskId is required");
      return;
    }

    const parsed = updateTaskSchema.safeParse(req.body);
    if (!parsed.success) {
      sendError(res, 422, "Validation failed", {
        fields: parsed.error.errors.map((e) => `${e.path.join(".")}: ${e.message}`),
      });
      return;
    }

    if (
      !req.file &&
      parsed.data.title == null &&
      parsed.data.details == null &&
      parsed.data.startDate == null &&
      parsed.data.dueDate == null
    ) {
      sendError(res, 400, "No update fields provided");
      return;
    }

    const imageUrl = req.file ? getImageUrlFromFile(req.file.filename) : null;
    const task = await updatePlantingTask(taskId, req.user.userId, {
      title: parsed.data.title,
      details: parsed.data.details ?? null,
      startDate: parsed.data.startDate ?? undefined,
      dueDate: parsed.data.dueDate ?? undefined,
      imageUrl,
    });

    try {
      const socketModule = await import("@/index");
      socketModule.socketService.broadcastPlantingTasksUpdate({
        type: "planting-task-updated",
        task,
      });
    } catch (socketError) {
      console.error("Planting task socket emit error:", socketError);
    }

    sendSuccess(res, 200, "Planting task updated successfully", task);
  } catch (error: unknown) {
    const err = error as { statusCode?: number; message?: string };
    if (err.statusCode) {
      sendError(res, err.statusCode, err.message || "Something went wrong");
      return;
    }
    console.error("Update planting task error:", error);
    sendError(res, 500, "Internal server error");
  }
};

export const postMyPlantingTask = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    if (!req.user) {
      sendError(res, 401, "Authentication required");
      return;
    }

    const taskId = req.params.taskId;
    if (!taskId) {
      sendError(res, 400, "taskId is required");
      return;
    }
    const parsedPostInput = postTaskSchema.safeParse(req.body || {});
    if (!parsedPostInput.success) {
      sendError(res, 422, "Validation failed", {
        fields: parsedPostInput.error.errors.map((e) => `${e.path.join(".")}: ${e.message}`),
      });
      return;
    }
    const communityId = parsedPostInput.data.communityId ?? undefined;

    const tasksResult = await listMyPlantingTasks(req.user.userId, 1000, null);
    const task = tasksResult.tasks.find((t) => t.id === taskId);
    if (!task) {
      sendError(res, 404, "Task not found");
      return;
    }

    const statusLabel =
      task.status === "NOT_STARTED"
        ? "Not Started"
        : task.status === "IN_PROGRESS"
          ? "In Progress"
          : "Completed";

    const descriptionLines = [
      "[TASK_POST]",
      `Title: ${task.title}`,
      `Status: ${statusLabel}`,
      `Schedule: ${task.start_date} - ${task.due_date}`,
      task.image_url ? `Image: ${task.image_url}` : undefined,
      task.details ? `Details: ${task.details}` : undefined,
    ].filter(Boolean) as string[];

    const description = descriptionLines.join("\n");
    const media = task.image_url
      ? [{ mediaType: "IMAGE" as const, mediaUrl: task.image_url }]
      : [];
    const post = communityId
      ? await createCommunityPostService({
          userId: req.user.userId,
          communityId,
          description,
          media,
        })
      : await createPostService({
          userId: req.user.userId,
          description,
          media,
        });

    try {
      const socketModule = await import("@/index");
      if (communityId) {
        socketModule.socketService.emitCommunityPostCreated(communityId);
      } else {
        socketModule.socketService.broadcastFeedUpdate({
          type: "new-post",
          post,
        });
      }
    } catch (socketError) {
      console.error("Post task socket emit error:", socketError);
    }

    sendSuccess(
      res,
      201,
      communityId ? "Task posted successfully in community" : "Task posted successfully",
      post
    );
  } catch (error: unknown) {
    const err = error as { statusCode?: number; message?: string };
    if (err.statusCode) {
      sendError(res, err.statusCode, err.message || "Something went wrong");
      return;
    }
    console.error("Post planting task error:", error);
    sendError(res, 500, "Internal server error");
  }
};

