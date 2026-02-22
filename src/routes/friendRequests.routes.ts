import { Router } from "express";
import { authenticateToken } from "@/middleware/authMiddleware";
import {
  sendFriendRequest,
  acceptFriendRequest,
  declineFriendRequest,
  getFriendRequests,
  getSentFriendRequestsCount,
  getFriends,
} from "@/controllers/friendRequests";

const friendRequestsRouter = Router();

friendRequestsRouter.use(authenticateToken); // All routes require authentication

friendRequestsRouter.post("/", sendFriendRequest);
friendRequestsRouter.get("/", getFriendRequests);
friendRequestsRouter.get("/friends", getFriends);
friendRequestsRouter.get("/sent/count", getSentFriendRequestsCount);
friendRequestsRouter.post("/:requestId/accept", acceptFriendRequest);
friendRequestsRouter.post("/:requestId/decline", declineFriendRequest);

export default friendRequestsRouter;

