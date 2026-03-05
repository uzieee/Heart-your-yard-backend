import { Router } from "express";
import { authenticateToken } from "@/middleware/authMiddleware";
import {
  getCommunityMessages,
  listCommunityChats,
  markCommunityMessagesAsRead,
  sendCommunityMessage,
} from "@/controllers/communityMessages";

const communityMessagesRouter = Router();

communityMessagesRouter.use(authenticateToken);

communityMessagesRouter.get("/", listCommunityChats);
communityMessagesRouter.get("/:communityId/messages", getCommunityMessages);
communityMessagesRouter.post("/:communityId/messages", sendCommunityMessage);
communityMessagesRouter.post("/:communityId/read", markCommunityMessagesAsRead);

export default communityMessagesRouter;


