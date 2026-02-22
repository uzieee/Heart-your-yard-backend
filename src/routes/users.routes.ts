import { Router } from "express";
import { authenticateToken } from "@/middleware/authMiddleware";
import { getUsers, getCurrentUser } from "@/controllers/users";

const usersRouter = Router();

usersRouter.use(authenticateToken); // All routes require authentication

usersRouter.get("/", getUsers);
usersRouter.get("/me", getCurrentUser);

export default usersRouter;




