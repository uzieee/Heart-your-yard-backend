import { Router } from "express";
import { authenticateToken } from "@/middleware/authMiddleware";
import {
  createMyPlantingTask,
  getMyPlantingTasks,
  postMyPlantingTask,
  updateMyPlantingTask,
} from "@/controllers/plantingTasks";
import { uploadImage } from "@/utils/upload";

const plantingTasksRouter = Router();

plantingTasksRouter.use(authenticateToken);

plantingTasksRouter.get("/me", getMyPlantingTasks);
plantingTasksRouter.post("/me", uploadImage.single("image"), createMyPlantingTask);
plantingTasksRouter.patch("/me/:taskId", uploadImage.single("image"), updateMyPlantingTask);
plantingTasksRouter.post("/me/:taskId/post", postMyPlantingTask);

export default plantingTasksRouter;

