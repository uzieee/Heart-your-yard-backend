import { QueryTypes } from "sequelize";
import sequelize from "database";
import SocketService from "@/socket/socketServer";

interface UpdatedTaskRow {
  id: string;
  user_id: string;
  status: "NOT_STARTED" | "IN_PROGRESS" | "COMPLETED";
}

const STATUS_COMPUTE_SQL = `
  CASE
    WHEN CURRENT_DATE < start_date THEN 'NOT_STARTED'
    WHEN CURRENT_DATE > due_date THEN 'COMPLETED'
    ELSE 'IN_PROGRESS'
  END
`;

const syncPlantingTaskStatuses = async (): Promise<UpdatedTaskRow[]> => {
  const rows = (await sequelize.query(
    `UPDATE planting_tasks
     SET
       status = ${STATUS_COMPUTE_SQL},
       updated_at = NOW()
     WHERE deleted_at IS NULL
       AND status IS DISTINCT FROM ${STATUS_COMPUTE_SQL}
     RETURNING id, user_id, status`,
    {
      type: QueryTypes.SELECT,
    }
  )) as UpdatedTaskRow[];

  return rows;
};

export const startPlantingTaskStatusWatcher = (
  socketService: SocketService,
  intervalMs: number = 60_000
): (() => void) => {
  let isRunning = false;

  const run = async () => {
    if (isRunning) return;
    isRunning = true;
    try {
      const updatedTasks = await syncPlantingTaskStatuses();
      if (updatedTasks.length > 0) {
        socketService.broadcastPlantingTasksUpdate({
          type: "planting-task-status-updated",
          taskIds: updatedTasks.map((t) => t.id),
          changedCount: updatedTasks.length,
        });
        console.log(
          `🕒 Planting task watcher updated ${updatedTasks.length} task status(es)`
        );
      }
    } catch (error) {
      console.error("Planting task watcher error:", error);
    } finally {
      isRunning = false;
    }
  };

  // Run once on startup, then keep syncing.
  run();
  const timer = setInterval(run, intervalMs);

  return () => clearInterval(timer);
};

