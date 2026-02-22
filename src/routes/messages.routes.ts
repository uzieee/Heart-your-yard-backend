import { Router } from "express";
import {
  sendMessage,
  getMessages,
  markMessagesAsRead,
  getUnreadCount,
  getAllUnreadCounts,
} from "@/controllers/messages";
import { authenticateToken } from "@/middleware/authMiddleware";
import { uploadPostMedia } from "@/utils/upload";

const messagesRouter = Router();

// All routes require authentication
messagesRouter.use(authenticateToken);

// Send a message (with optional file uploads - up to 10 files)
messagesRouter.post("/", uploadPostMedia.array("media", 10), sendMessage);

// Get messages between current user and another user (with pagination)
messagesRouter.get("/:userId", getMessages);

// Mark messages as read
messagesRouter.post("/:userId/read", markMessagesAsRead);

// Get unread count for a conversation
messagesRouter.get("/:userId/unread", getUnreadCount);

// Get all unread counts
messagesRouter.get("/unread/all", getAllUnreadCounts);

export default messagesRouter;

