import { Router } from "express";
import {
  getNotifications,
  markNotificationAsRead,
  markAllNotificationsAsRead,
} from "@/controllers/notifications";
import { authenticateToken } from "@/middleware/authMiddleware";

const notificationsRouter = Router();

// All routes require authentication
notificationsRouter.use(authenticateToken);

// Get notifications
notificationsRouter.get("/", getNotifications);

// Mark notification as read
notificationsRouter.post("/:notificationId/read", markNotificationAsRead);

// Mark all notifications as read
notificationsRouter.post("/read-all", markAllNotificationsAsRead);

export default notificationsRouter;


