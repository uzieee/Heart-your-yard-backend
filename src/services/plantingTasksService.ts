import { QueryTypes } from "sequelize";
import sequelize from "database";

export type PlantingTaskStatus = "NOT_STARTED" | "IN_PROGRESS" | "COMPLETED";

export interface PlantingTaskRecord {
  id: string;
  user_id: string;
  title: string;
  details: string | null;
  start_date: string;
  due_date: string;
  image_url: string | null;
  status: PlantingTaskStatus;
  created_at: Date;
  updated_at: Date;
}

export interface PlantingTaskSummary {
  total: number;
  completed: number;
  inProgress: number;
  notStarted: number;
  completedPercent: number;
  inProgressPercent: number;
  notStartedPercent: number;
}

export interface PlantingTaskPageResult {
  tasks: PlantingTaskRecord[];
  hasMore: boolean;
  nextCursor: string | null;
  summary: PlantingTaskSummary;
}

const safePercent = (count: number, total: number): number => {
  if (!total) return 0;
  return Math.round((count / total) * 100);
};

const computedStatusSql = `
  CASE
    WHEN CURRENT_DATE < pt.start_date THEN 'NOT_STARTED'
    WHEN CURRENT_DATE > pt.due_date THEN 'COMPLETED'
    ELSE 'IN_PROGRESS'
  END
`;

export const getPlantingTasksSummary = async (
  userId: string
): Promise<PlantingTaskSummary> => {
  const rows = (await sequelize.query(
    `SELECT
      COUNT(*)::INTEGER AS total,
      COUNT(*) FILTER (WHERE ${computedStatusSql} = 'COMPLETED')::INTEGER AS completed,
      COUNT(*) FILTER (WHERE ${computedStatusSql} = 'IN_PROGRESS')::INTEGER AS in_progress,
      COUNT(*) FILTER (WHERE ${computedStatusSql} = 'NOT_STARTED')::INTEGER AS not_started
     FROM planting_tasks pt
     WHERE pt.user_id = $1 AND pt.deleted_at IS NULL`,
    {
      bind: [userId],
      type: QueryTypes.SELECT,
    }
  )) as Array<{
    total: number;
    completed: number;
    in_progress: number;
    not_started: number;
  }>;

  const row = rows[0] || { total: 0, completed: 0, in_progress: 0, not_started: 0 };
  return {
    total: row.total || 0,
    completed: row.completed || 0,
    inProgress: row.in_progress || 0,
    notStarted: row.not_started || 0,
    completedPercent: safePercent(row.completed || 0, row.total || 0),
    inProgressPercent: safePercent(row.in_progress || 0, row.total || 0),
    notStartedPercent: safePercent(row.not_started || 0, row.total || 0),
  };
};

export const listMyPlantingTasks = async (
  userId: string,
  limit: number = 10,
  cursor?: string | null
): Promise<PlantingTaskPageResult> => {
  const limitNum = Math.min(Math.max(1, limit), 50);
  const offset = cursor != null ? parseInt(cursor, 10) : 0;
  const safeOffset = Number.isNaN(offset) || offset < 0 ? 0 : offset;

  const rows = (await sequelize.query(
    `SELECT
      pt.id,
      pt.user_id,
      pt.title,
      pt.details,
      pt.start_date,
      pt.due_date,
      pt.image_url,
      ${computedStatusSql}::text AS status,
      pt.created_at,
      pt.updated_at
     FROM planting_tasks pt
     WHERE pt.user_id = $1 AND pt.deleted_at IS NULL
     ORDER BY pt.start_date ASC, pt.created_at DESC, pt.id DESC
     LIMIT ${limitNum + 1} OFFSET ${safeOffset}`,
    {
      bind: [userId],
      type: QueryTypes.SELECT,
    }
  )) as PlantingTaskRecord[];

  const hasMore = rows.length > limitNum;
  const tasks = hasMore ? rows.slice(0, limitNum) : rows;
  const nextCursor = hasMore ? String(safeOffset + limitNum) : null;
  const summary = await getPlantingTasksSummary(userId);

  return { tasks, hasMore, nextCursor, summary };
};

export const createPlantingTask = async (payload: {
  userId: string;
  title: string;
  details?: string | null;
  startDate: string;
  dueDate: string;
  imageUrl?: string | null;
}): Promise<PlantingTaskRecord> => {
  const rows = (await sequelize.query(
    `INSERT INTO planting_tasks (user_id, title, details, start_date, due_date, image_url, status, created_at, updated_at)
     VALUES ($1, $2, $3, $4, $5, $6, 'NOT_STARTED', NOW(), NOW())
     RETURNING id, user_id, title, details, start_date, due_date, image_url,
      CASE
        WHEN CURRENT_DATE < start_date THEN 'NOT_STARTED'
        WHEN CURRENT_DATE > due_date THEN 'COMPLETED'
        ELSE 'IN_PROGRESS'
      END::text AS status,
      created_at, updated_at`,
    {
      bind: [
        payload.userId,
        payload.title,
        payload.details || null,
        payload.startDate,
        payload.dueDate,
        payload.imageUrl || null,
      ],
      type: QueryTypes.SELECT,
    }
  )) as PlantingTaskRecord[];

  const row = rows[0];
  if (!row) throw { statusCode: 500, message: "Failed to create task" };
  return row;
};

export const updatePlantingTask = async (
  taskId: string,
  userId: string,
  payload: {
    title?: string;
    details?: string | null;
    startDate?: string;
    dueDate?: string;
    imageUrl?: string | null;
  }
): Promise<PlantingTaskRecord> => {
  const existing = (await sequelize.query(
    `SELECT id, start_date, due_date FROM planting_tasks
     WHERE id = $1 AND user_id = $2 AND deleted_at IS NULL
     LIMIT 1`,
    {
      bind: [taskId, userId],
      type: QueryTypes.SELECT,
    }
  )) as Array<{ id: string; start_date: string; due_date: string }>;

  if (!existing.length) {
    throw { statusCode: 404, message: "Task not found" };
  }

  const nextStartDate = payload.startDate ?? existing[0].start_date;
  const nextDueDate = payload.dueDate ?? existing[0].due_date;
  if (new Date(nextDueDate).getTime() < new Date(nextStartDate).getTime()) {
    throw { statusCode: 422, message: "Due date cannot be before start date" };
  }

  const rows = (await sequelize.query(
    `UPDATE planting_tasks
     SET
      title = COALESCE($3, title),
      details = COALESCE($4, details),
      start_date = COALESCE($5, start_date),
      due_date = COALESCE($6, due_date),
      image_url = COALESCE($7, image_url),
      updated_at = NOW()
     WHERE id = $1 AND user_id = $2 AND deleted_at IS NULL
     RETURNING id, user_id, title, details, start_date, due_date, image_url,
      CASE
        WHEN CURRENT_DATE < start_date THEN 'NOT_STARTED'
        WHEN CURRENT_DATE > due_date THEN 'COMPLETED'
        ELSE 'IN_PROGRESS'
      END::text AS status,
      created_at, updated_at`,
    {
      bind: [
        taskId,
        userId,
        payload.title ?? null,
        payload.details ?? null,
        payload.startDate ?? null,
        payload.dueDate ?? null,
        payload.imageUrl ?? null,
      ],
      type: QueryTypes.SELECT,
    }
  )) as PlantingTaskRecord[];

  const row = rows[0];
  if (!row) throw { statusCode: 500, message: "Failed to update task" };
  return row;
};

