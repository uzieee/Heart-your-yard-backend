import { Router } from "express";
import { togglePostLike, togglePostDislike, getPostLikers, getPostDislikers, getPostReactions } from "@/controllers/likes";
import { authenticateToken } from "@/middleware/authMiddleware";

const likesRouter = Router();

// All routes require authentication
likesRouter.use(authenticateToken);

// Post likes
likesRouter.post("/posts/:postId", togglePostLike);
likesRouter.post("/posts/:postId/dislike", togglePostDislike);
likesRouter.get("/posts/:postId/likers", getPostLikers);
likesRouter.get("/posts/:postId/dislikers", getPostDislikers);
likesRouter.get("/posts/:postId/reactions", getPostReactions);

export default likesRouter;


