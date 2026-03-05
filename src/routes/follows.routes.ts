import { Router } from "express";
import { authenticateToken } from "@/middleware/authMiddleware";
import {
  followUser,
  unfollowUser,
  removeFollower,
  getFollowingsCount,
  getFollowedUsers,
  getFollowers,
  checkFollowStatus,
  checkIsFriend,
} from "@/controllers/follows";

const followsRouter = Router();

followsRouter.use(authenticateToken); // All routes require authentication

followsRouter.post("/", followUser);
followsRouter.delete("/followers/:followerId", removeFollower);
followsRouter.delete("/:followingId", unfollowUser);
followsRouter.get("/count", getFollowingsCount);
followsRouter.get("/following", getFollowedUsers);
followsRouter.get("/followers", getFollowers);
followsRouter.get("/check", checkFollowStatus);
followsRouter.get("/is-friend/:userId", checkIsFriend);

export default followsRouter;

