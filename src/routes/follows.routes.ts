import { Router } from "express";
import { authenticateToken } from "@/middleware/authMiddleware";
import {
  followUser,
  unfollowUser,
  getFollowingsCount,
  getFollowedUsers,
  getFollowers,
  checkFollowStatus,
} from "@/controllers/follows";

const followsRouter = Router();

followsRouter.use(authenticateToken); // All routes require authentication

followsRouter.post("/", followUser);
followsRouter.delete("/:followingId", unfollowUser);
followsRouter.get("/count", getFollowingsCount);
followsRouter.get("/following", getFollowedUsers);
followsRouter.get("/followers", getFollowers);
followsRouter.get("/check", checkFollowStatus);

export default followsRouter;

