import { Router } from "express";
import { authenticateToken, optionalAuth } from "@/middleware/authMiddleware";
import {
  createCommunity,
  getMyCommunities,
  getDiscoverCommunities,
  getCommunityById,
  getCommunityMembers,
  joinCommunity,
  leaveCommunity,
  updateCommunity,
  deleteCommunity,
} from "@/controllers/communities";
import { createCommunityPost, getCommunityPosts, getCommunityFeed, getPublicCommunityFeed } from "@/controllers/communityPosts";
import {
  toggleCommunityPostLike,
  toggleCommunityPostDislike,
  getCommunityPostComments,
  createCommunityPostComment,
  createCommunityPostCommentReply,
  toggleCommunityCommentLike,
  toggleCommunityCommentDislike,
  toggleCommunityReplyLike,
  toggleCommunityReplyDislike,
} from "@/controllers/communityPostReactions";
import { uploadPostMedia } from "@/utils/upload";

const communitiesRouter = Router();

communitiesRouter.post("/", authenticateToken, createCommunity);
communitiesRouter.get("/my/feed", authenticateToken, getCommunityFeed);
communitiesRouter.get("/my", authenticateToken, getMyCommunities);
communitiesRouter.get("/discover", getDiscoverCommunities);
communitiesRouter.get("/feed", optionalAuth, getPublicCommunityFeed);
communitiesRouter.get("/:communityId", optionalAuth, getCommunityById);
communitiesRouter.get("/:communityId/members", getCommunityMembers);
communitiesRouter.patch("/:communityId", authenticateToken, updateCommunity);
communitiesRouter.delete("/:communityId", authenticateToken, deleteCommunity);
communitiesRouter.post("/:communityId/join", authenticateToken, joinCommunity);
communitiesRouter.post("/:communityId/leave", authenticateToken, leaveCommunity);

communitiesRouter.get("/:communityId/posts", authenticateToken, getCommunityPosts);
communitiesRouter.post(
  "/:communityId/posts",
  authenticateToken,
  uploadPostMedia.array("media", 10),
  createCommunityPost
);

communitiesRouter.post("/:communityId/posts/:postId/like", authenticateToken, toggleCommunityPostLike);
communitiesRouter.post("/:communityId/posts/:postId/dislike", authenticateToken, toggleCommunityPostDislike);
communitiesRouter.get("/:communityId/posts/:postId/comments", authenticateToken, getCommunityPostComments);
communitiesRouter.post("/:communityId/posts/:postId/comments", authenticateToken, createCommunityPostComment);
communitiesRouter.post("/:communityId/comments/:commentId/replies", authenticateToken, createCommunityPostCommentReply);
communitiesRouter.post("/:communityId/comments/:commentId/like", authenticateToken, toggleCommunityCommentLike);
communitiesRouter.post("/:communityId/comments/:commentId/dislike", authenticateToken, toggleCommunityCommentDislike);
communitiesRouter.post("/:communityId/replies/:replyId/like", authenticateToken, toggleCommunityReplyLike);
communitiesRouter.post("/:communityId/replies/:replyId/dislike", authenticateToken, toggleCommunityReplyDislike);

export default communitiesRouter;
