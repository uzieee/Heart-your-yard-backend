import { Router } from "express";
import { authenticateToken } from "@/middleware/authMiddleware";
import { getTrendingTags } from "@/controllers/tags";

const tagsRouter = Router();

tagsRouter.use(authenticateToken);
tagsRouter.get("/trending", getTrendingTags);

export default tagsRouter;

