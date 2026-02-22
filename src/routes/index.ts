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

export default router;


