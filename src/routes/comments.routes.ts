import { Router } from "express";
import {
  createComment,
  getComments,
  createCommentReply,
  toggleCommentLike,
  toggleCommentReplyLike,
  toggleCommentDislike,
  toggleCommentReplyDislike,
  getCommentLikers,
  getCommentDislikers,
  getReplyLikers,
  getReplyDislikers,
} from "@/controllers/comments";
import { authenticateToken } from "@/middleware/authMiddleware";

const commentsRouter = Router();

// All routes require authentication
commentsRouter.use(authenticateToken);

// Post comments
commentsRouter.post("/posts/:postId", createComment);
commentsRouter.get("/posts/:postId", getComments);

// Comment replies
commentsRouter.post("/:commentId/replies", createCommentReply);

// Comment likes/dislikes
commentsRouter.post("/:commentId/like", toggleCommentLike);
commentsRouter.post("/:commentId/dislike", toggleCommentDislike);

// Comment likers/dislikers
commentsRouter.get("/:commentId/likers", getCommentLikers);
commentsRouter.get("/:commentId/dislikers", getCommentDislikers);

// Reply likes/dislikes
commentsRouter.post("/replies/:replyId/like", toggleCommentReplyLike);
commentsRouter.post("/replies/:replyId/dislike", toggleCommentReplyDislike);

// Reply likers/dislikers
commentsRouter.get("/replies/:replyId/likers", getReplyLikers);
commentsRouter.get("/replies/:replyId/dislikers", getReplyDislikers);

export default commentsRouter;


