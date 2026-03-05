import { Router } from "express";
import { authenticateToken } from "@/middleware/authMiddleware";
import {
  addMessageGroupMembers,
  createMessageGroup,
  getMessageGroup,
  getMessageGroupMessages,
  listMyMessageGroups,
  markMessageGroupMessagesRead,
  sendMessageGroupMessage,
} from "@/controllers/messageGroups";

const messageGroupsRouter = Router();

messageGroupsRouter.use(authenticateToken);

messageGroupsRouter.get("/", listMyMessageGroups);
messageGroupsRouter.post("/", createMessageGroup);
messageGroupsRouter.get("/:groupId", getMessageGroup);
messageGroupsRouter.post("/:groupId/members", addMessageGroupMembers);
messageGroupsRouter.get("/:groupId/messages", getMessageGroupMessages);
messageGroupsRouter.post("/:groupId/messages", sendMessageGroupMessage);
messageGroupsRouter.post("/:groupId/read", markMessageGroupMessagesRead);

export default messageGroupsRouter;


