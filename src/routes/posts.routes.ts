import { Router } from "express";
import { createPost, getPosts } from "@/controllers/posts";
import { authenticateToken } from "@/middleware/authMiddleware";
import { uploadPostMedia } from "@/utils/upload";

const postsRouter = Router();

// All routes require authentication
postsRouter.use(authenticateToken);

// Create post with media upload
postsRouter.post(
  "/",
  uploadPostMedia.array("media", 10), // Allow up to 10 files
  createPost
);

// Get posts with pagination
postsRouter.get("/", getPosts);

export default postsRouter;


