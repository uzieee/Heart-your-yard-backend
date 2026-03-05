import { Router } from "express";
import authRouter from "@/routes/auth.routes";
import onboardingRouter from "@/routes/onboarding.routes";
import usersRouter from "@/routes/users.routes";
import followsRouter from "@/routes/follows.routes";
import postsRouter from "@/routes/posts.routes";
import commentsRouter from "@/routes/comments.routes";
import likesRouter from "@/routes/likes.routes";
import notificationsRouter from "@/routes/notifications.routes";
import friendRequestsRouter from "@/routes/friendRequests.routes";
import messagesRouter from "@/routes/messages.routes";
import communitiesRouter from "@/routes/communities.routes";
import plantingTasksRouter from "@/routes/plantingTasks.routes";
import mapRouter from "@/routes/map.routes";
import tagsRouter from "@/routes/tags.routes";
import communityMessagesRouter from "@/routes/communityMessages.routes";
import messageGroupsRouter from "@/routes/messageGroups.routes";
import adminRouter from "@/routes/admin.routes";

const router = Router();

router.use("/auth", authRouter);
router.use("/onboarding", onboardingRouter);
router.use("/users", usersRouter);
router.use("/follows", followsRouter);
router.use("/posts", postsRouter);
router.use("/comments", commentsRouter);
router.use("/likes", likesRouter);
router.use("/notifications", notificationsRouter);
router.use("/friend-requests", friendRequestsRouter);
router.use("/messages", messagesRouter);
router.use("/communities", communitiesRouter);
router.use("/planting-tasks", plantingTasksRouter);
router.use("/map", mapRouter);
router.use("/tags", tagsRouter);
router.use("/community-messages", communityMessagesRouter);
router.use("/message-groups", messageGroupsRouter);
router.use("/admin", adminRouter);

export default router;


