import { QueryTypes } from "sequelize";
import sequelize from "database";

export interface CommunityCommentReply {
  id: string;
  user_id: string;
  comment_id: string;
  parent_reply_id?: string | null;
  message: string;
  created_at: Date;
  updated_at: Date;
  user: { id: string; username: string; email: string; image: string | null; is_verified: boolean };
  likes_count: number;
  dislikes_count: number;
  is_liked: boolean;
  is_disliked: boolean;
  replies?: CommunityCommentReply[];
}

export interface CommunityComment {
  id: string;
  user_id: string;
  post_id: string;
  message: string;
  created_at: Date;
  updated_at: Date;
  user: { id: string; username: string; email: string; image: string | null; is_verified: boolean };
  likes_count: number;
  dislikes_count: number;
  is_liked: boolean;
  is_disliked: boolean;
  replies: CommunityCommentReply[];
}

export async function getCommunityPostCommentsService(
  communityPostId: string,
  currentUserId: string | null
): Promise<CommunityComment[]> {
  const comments = await sequelize.query(
    `SELECT 
       c.id, c.user_id, c.community_post_id, c.message, c.created_at, c.updated_at,
       u.id as u_id, u.username, u.email,
       COALESCE(o.image, u.image) as user_image,
       COALESCE(u.is_verified_email, false) as is_verified,
       COALESCE(l.likes_count::INTEGER, 0) as likes_count,
       COALESCE(d.dislikes_count::INTEGER, 0) as dislikes_count,
       CASE WHEN cr_like.user_id IS NOT NULL THEN true ELSE false END as is_liked,
       CASE WHEN cr_dislike.user_id IS NOT NULL THEN true ELSE false END as is_disliked
     FROM community_post_comments c
     INNER JOIN users u ON c.user_id = u.id
     LEFT JOIN onboarding o ON u.id = o.user_id AND o.deleted_at IS NULL
     LEFT JOIN (SELECT community_post_comment_id, COUNT(*)::INTEGER as likes_count FROM community_post_comment_reaction WHERE reaction_type = 'LIKE' AND deleted_at IS NULL GROUP BY community_post_comment_id) l ON c.id = l.community_post_comment_id
     LEFT JOIN (SELECT community_post_comment_id, COUNT(*)::INTEGER as dislikes_count FROM community_post_comment_reaction WHERE reaction_type = 'DISLIKE' AND deleted_at IS NULL GROUP BY community_post_comment_id) d ON c.id = d.community_post_comment_id
     LEFT JOIN community_post_comment_reaction cr_like ON c.id = cr_like.community_post_comment_id AND cr_like.user_id = $2 AND cr_like.reaction_type = 'LIKE' AND cr_like.deleted_at IS NULL
     LEFT JOIN community_post_comment_reaction cr_dislike ON c.id = cr_dislike.community_post_comment_id AND cr_dislike.user_id = $2 AND cr_dislike.reaction_type = 'DISLIKE' AND cr_dislike.deleted_at IS NULL
     WHERE c.community_post_id = $1 AND c.deleted_at IS NULL
     ORDER BY c.created_at DESC`,
    { bind: [communityPostId, currentUserId || null], type: QueryTypes.SELECT }
  );

  const commentIds = (comments as any[]).map((c: any) => c.id);
  let repliesMap: Map<string, CommunityCommentReply[]> = new Map();

  if (commentIds.length > 0) {
    const repliesResult = await sequelize.query(
      `SELECT 
         r.id, r.user_id, r.community_post_comment_id as comment_id, r.parent_reply_id, r.message, r.created_at, r.updated_at,
         u.id as u_id, u.username, u.email, COALESCE(o.image, u.image) as user_image, COALESCE(u.is_verified_email, false) as is_verified,
         COALESCE(l.likes_count::INTEGER, 0) as likes_count, COALESCE(d.dislikes_count::INTEGER, 0) as dislikes_count,
         CASE WHEN rr_like.user_id IS NOT NULL THEN true ELSE false END as is_liked,
         CASE WHEN rr_dislike.user_id IS NOT NULL THEN true ELSE false END as is_disliked
       FROM community_post_comment_replies r
       INNER JOIN users u ON r.user_id = u.id
       LEFT JOIN onboarding o ON u.id = o.user_id AND o.deleted_at IS NULL
       LEFT JOIN (SELECT community_post_comment_reply_id, COUNT(*)::INTEGER as likes_count FROM community_post_comment_replies_reaction WHERE reaction_type = 'LIKE' AND deleted_at IS NULL GROUP BY community_post_comment_reply_id) l ON r.id = l.community_post_comment_reply_id
       LEFT JOIN (SELECT community_post_comment_reply_id, COUNT(*)::INTEGER as dislikes_count FROM community_post_comment_replies_reaction WHERE reaction_type = 'DISLIKE' AND deleted_at IS NULL GROUP BY community_post_comment_reply_id) d ON r.id = d.community_post_comment_reply_id
       LEFT JOIN community_post_comment_replies_reaction rr_like ON r.id = rr_like.community_post_comment_reply_id AND rr_like.user_id = $2 AND rr_like.reaction_type = 'LIKE' AND rr_like.deleted_at IS NULL
       LEFT JOIN community_post_comment_replies_reaction rr_dislike ON r.id = rr_dislike.community_post_comment_reply_id AND rr_dislike.user_id = $2 AND rr_dislike.reaction_type = 'DISLIKE' AND rr_dislike.deleted_at IS NULL
       WHERE r.community_post_comment_id = ANY($1) AND r.deleted_at IS NULL
       ORDER BY r.created_at ASC`,
      { bind: [commentIds, currentUserId || null], type: QueryTypes.SELECT }
    );

    const repliesArray = (repliesResult as any[]).map((reply: any) => ({
      id: reply.id,
      user_id: reply.user_id,
      comment_id: reply.comment_id,
      parent_reply_id: reply.parent_reply_id || null,
      message: reply.message,
      created_at: reply.created_at,
      updated_at: reply.updated_at,
      user: { id: reply.user_id, username: reply.username, email: reply.email, image: reply.user_image, is_verified: reply.is_verified },
      likes_count: reply.likes_count || 0,
      dislikes_count: reply.dislikes_count || 0,
      is_liked: reply.is_liked || false,
      is_disliked: reply.is_disliked || false,
      replies: [] as CommunityCommentReply[],
    }));

    repliesArray.forEach((reply: CommunityCommentReply) => {
      if (!reply.parent_reply_id) {
        if (!repliesMap.has(reply.comment_id)) repliesMap.set(reply.comment_id, []);
        repliesMap.get(reply.comment_id)!.push(reply);
      }
    });
    repliesArray.forEach((reply: CommunityCommentReply) => {
      if (reply.parent_reply_id) {
        const commentReplies = repliesMap.get(reply.comment_id) || [];
        const findAndAdd = (replies: CommunityCommentReply[]): boolean => {
          for (const p of replies) {
            if (p.id === reply.parent_reply_id) {
              if (!p.replies) p.replies = [];
              p.replies.push(reply);
              return true;
            }
            if (p.replies && findAndAdd(p.replies)) return true;
          }
          return false;
        };
        findAndAdd(commentReplies);
      }
    });
  }

  return (comments as any[]).map((c: any) => ({
    id: c.id,
    user_id: c.user_id,
    post_id: c.community_post_id,
    message: c.message,
    created_at: c.created_at,
    updated_at: c.updated_at,
    user: { id: c.user_id, username: c.username, email: c.email, image: c.user_image, is_verified: c.is_verified },
    likes_count: c.likes_count || 0,
    dislikes_count: c.dislikes_count || 0,
    is_liked: c.is_liked || false,
    is_disliked: c.is_disliked || false,
    replies: repliesMap.get(c.id) || [],
  }));
}

export async function createCommunityPostCommentService(
  userId: string,
  communityPostId: string,
  message: string
): Promise<CommunityComment> {
  const [row] = await sequelize.query(
    `INSERT INTO community_post_comments (user_id, community_post_id, message, created_at, updated_at)
     VALUES ($1, $2, $3, NOW(), NOW())
     RETURNING id, user_id, community_post_id, message, created_at, updated_at`,
    { bind: [userId, communityPostId, message], type: QueryTypes.SELECT }
  );
  if (!row) throw new Error("Failed to create comment");
  const list = await getCommunityPostCommentsService(communityPostId, userId);
  const found = list.find((c) => (c as any).id === (row as any).id);
  if (!found) throw new Error("Failed to fetch created comment");
  return found;
}

export async function createCommunityPostCommentReplyService(
  userId: string,
  communityPostCommentId: string,
  message: string,
  parentReplyId?: string | null
): Promise<CommunityCommentReply> {
  const [row] = await sequelize.query(
    `INSERT INTO community_post_comment_replies (user_id, community_post_comment_id, parent_reply_id, message, created_at, updated_at)
     VALUES ($1, $2, $3, $4, NOW(), NOW())
     RETURNING id, user_id, community_post_comment_id, parent_reply_id, message, created_at, updated_at`,
    { bind: [userId, communityPostCommentId, parentReplyId || null, message], type: QueryTypes.SELECT }
  );
  if (!row) throw new Error("Failed to create reply");
  const r = row as any;
  const [commentRow] = await sequelize.query(
    `SELECT community_post_id FROM community_post_comments WHERE id = $1 AND deleted_at IS NULL`,
    { bind: [communityPostCommentId], type: QueryTypes.SELECT }
  );
  const postId = (commentRow as any)?.community_post_id;
  if (!postId) throw new Error("Comment not found");
  const list = await getCommunityPostCommentsService(postId, userId);
  const flatReplies: CommunityCommentReply[] = [];
  const collect = (replies: CommunityCommentReply[]) => {
    (replies || []).forEach((reply) => {
      flatReplies.push(reply);
      if (reply.replies?.length) collect(reply.replies);
    });
  };
  list.forEach((c) => collect(c.replies || []));
  const found = flatReplies.find((x) => x.id === r.id);
  if (found) return found;
  return {
    id: r.id,
    user_id: r.user_id,
    comment_id: r.community_post_comment_id,
    parent_reply_id: r.parent_reply_id || null,
    message: r.message,
    created_at: r.created_at,
    updated_at: r.updated_at,
    user: { id: r.user_id, username: "", email: "", image: null, is_verified: false },
    likes_count: 0,
    dislikes_count: 0,
    is_liked: false,
    is_disliked: false,
    replies: [],
  };
}

export async function toggleCommunityCommentLikeService(
  userId: string,
  commentId: string
): Promise<{ isLiked: boolean; isDisliked: boolean; likesCount: number; dislikesCount: number }> {
  const existing = await sequelize.query(
    `SELECT id, reaction_type FROM community_post_comment_reaction WHERE user_id = $1 AND community_post_comment_id = $2 AND deleted_at IS NULL`,
    { bind: [userId, commentId], type: QueryTypes.SELECT }
  );
  if (existing.length > 0) {
    const r = (existing[0] as any).reaction_type;
    if (r === "LIKE") {
      await sequelize.query(
        `UPDATE community_post_comment_reaction SET deleted_at = NOW() WHERE user_id = $1 AND community_post_comment_id = $2 AND deleted_at IS NULL`,
        { bind: [userId, commentId], type: QueryTypes.UPDATE }
      );
    } else {
      await sequelize.query(
        `UPDATE community_post_comment_reaction SET reaction_type = 'LIKE', updated_at = NOW(), deleted_at = NULL WHERE user_id = $1 AND community_post_comment_id = $2`,
        { bind: [userId, commentId], type: QueryTypes.UPDATE }
      );
    }
  } else {
    await sequelize.query(
      `INSERT INTO community_post_comment_reaction (user_id, community_post_comment_id, reaction_type, created_at, updated_at) VALUES ($1, $2, 'LIKE', NOW(), NOW())`,
      { bind: [userId, commentId], type: QueryTypes.INSERT }
    );
  }
  const [likes] = await sequelize.query(
    `SELECT COUNT(*)::INTEGER as c FROM community_post_comment_reaction WHERE community_post_comment_id = $1 AND reaction_type = 'LIKE' AND deleted_at IS NULL`,
    { bind: [commentId], type: QueryTypes.SELECT }
  );
  const [dislikes] = await sequelize.query(
    `SELECT COUNT(*)::INTEGER as c FROM community_post_comment_reaction WHERE community_post_comment_id = $1 AND reaction_type = 'DISLIKE' AND deleted_at IS NULL`,
    { bind: [commentId], type: QueryTypes.SELECT }
  );
  const [cur] = await sequelize.query(
    `SELECT reaction_type FROM community_post_comment_reaction WHERE user_id = $1 AND community_post_comment_id = $2 AND deleted_at IS NULL`,
    { bind: [userId, commentId], type: QueryTypes.SELECT }
  );
  return {
    likesCount: (likes as any[])[0]?.c || 0,
    dislikesCount: (dislikes as any[])[0]?.c || 0,
    isLiked: (cur as any[])[0]?.reaction_type === "LIKE",
    isDisliked: (cur as any[])[0]?.reaction_type === "DISLIKE",
  };
}

export async function toggleCommunityCommentDislikeService(
  userId: string,
  commentId: string
): Promise<{ isLiked: boolean; isDisliked: boolean; likesCount: number; dislikesCount: number }> {
  const existing = await sequelize.query(
    `SELECT id, reaction_type FROM community_post_comment_reaction WHERE user_id = $1 AND community_post_comment_id = $2 AND deleted_at IS NULL`,
    { bind: [userId, commentId], type: QueryTypes.SELECT }
  );
  if (existing.length > 0) {
    const r = (existing[0] as any).reaction_type;
    if (r === "DISLIKE") {
      await sequelize.query(
        `UPDATE community_post_comment_reaction SET deleted_at = NOW() WHERE user_id = $1 AND community_post_comment_id = $2 AND deleted_at IS NULL`,
        { bind: [userId, commentId], type: QueryTypes.UPDATE }
      );
    } else {
      await sequelize.query(
        `UPDATE community_post_comment_reaction SET reaction_type = 'DISLIKE', updated_at = NOW(), deleted_at = NULL WHERE user_id = $1 AND community_post_comment_id = $2`,
        { bind: [userId, commentId], type: QueryTypes.UPDATE }
      );
    }
  } else {
    await sequelize.query(
      `INSERT INTO community_post_comment_reaction (user_id, community_post_comment_id, reaction_type, created_at, updated_at) VALUES ($1, $2, 'DISLIKE', NOW(), NOW())`,
      { bind: [userId, commentId], type: QueryTypes.INSERT }
    );
  }
  const [likes] = await sequelize.query(
    `SELECT COUNT(*)::INTEGER as c FROM community_post_comment_reaction WHERE community_post_comment_id = $1 AND reaction_type = 'LIKE' AND deleted_at IS NULL`,
    { bind: [commentId], type: QueryTypes.SELECT }
  );
  const [dislikes] = await sequelize.query(
    `SELECT COUNT(*)::INTEGER as c FROM community_post_comment_reaction WHERE community_post_comment_id = $1 AND reaction_type = 'DISLIKE' AND deleted_at IS NULL`,
    { bind: [commentId], type: QueryTypes.SELECT }
  );
  const [cur] = await sequelize.query(
    `SELECT reaction_type FROM community_post_comment_reaction WHERE user_id = $1 AND community_post_comment_id = $2 AND deleted_at IS NULL`,
    { bind: [userId, commentId], type: QueryTypes.SELECT }
  );
  return {
    likesCount: (likes as any[])[0]?.c || 0,
    dislikesCount: (dislikes as any[])[0]?.c || 0,
    isLiked: (cur as any[])[0]?.reaction_type === "LIKE",
    isDisliked: (cur as any[])[0]?.reaction_type === "DISLIKE",
  };
}

export async function toggleCommunityReplyLikeService(
  userId: string,
  replyId: string
): Promise<{ isLiked: boolean; isDisliked: boolean; likesCount: number; dislikesCount: number }> {
  const existing = await sequelize.query(
    `SELECT id, reaction_type FROM community_post_comment_replies_reaction WHERE user_id = $1 AND community_post_comment_reply_id = $2 AND deleted_at IS NULL`,
    { bind: [userId, replyId], type: QueryTypes.SELECT }
  );
  if (existing.length > 0) {
    const r = (existing[0] as any).reaction_type;
    if (r === "LIKE") {
      await sequelize.query(
        `UPDATE community_post_comment_replies_reaction SET deleted_at = NOW() WHERE user_id = $1 AND community_post_comment_reply_id = $2 AND deleted_at IS NULL`,
        { bind: [userId, replyId], type: QueryTypes.UPDATE }
      );
    } else {
      await sequelize.query(
        `UPDATE community_post_comment_replies_reaction SET reaction_type = 'LIKE', updated_at = NOW(), deleted_at = NULL WHERE user_id = $1 AND community_post_comment_reply_id = $2`,
        { bind: [userId, replyId], type: QueryTypes.UPDATE }
      );
    }
  } else {
    await sequelize.query(
      `INSERT INTO community_post_comment_replies_reaction (user_id, community_post_comment_reply_id, reaction_type, created_at, updated_at) VALUES ($1, $2, 'LIKE', NOW(), NOW())`,
      { bind: [userId, replyId], type: QueryTypes.INSERT }
    );
  }
  const [likes] = await sequelize.query(
    `SELECT COUNT(*)::INTEGER as c FROM community_post_comment_replies_reaction WHERE community_post_comment_reply_id = $1 AND reaction_type = 'LIKE' AND deleted_at IS NULL`,
    { bind: [replyId], type: QueryTypes.SELECT }
  );
  const [dislikes] = await sequelize.query(
    `SELECT COUNT(*)::INTEGER as c FROM community_post_comment_replies_reaction WHERE community_post_comment_reply_id = $1 AND reaction_type = 'DISLIKE' AND deleted_at IS NULL`,
    { bind: [replyId], type: QueryTypes.SELECT }
  );
  const [cur] = await sequelize.query(
    `SELECT reaction_type FROM community_post_comment_replies_reaction WHERE user_id = $1 AND community_post_comment_reply_id = $2 AND deleted_at IS NULL`,
    { bind: [userId, replyId], type: QueryTypes.SELECT }
  );
  return {
    likesCount: (likes as any[])[0]?.c || 0,
    dislikesCount: (dislikes as any[])[0]?.c || 0,
    isLiked: (cur as any[])[0]?.reaction_type === "LIKE",
    isDisliked: (cur as any[])[0]?.reaction_type === "DISLIKE",
  };
}

export async function toggleCommunityReplyDislikeService(
  userId: string,
  replyId: string
): Promise<{ isLiked: boolean; isDisliked: boolean; likesCount: number; dislikesCount: number }> {
  const existing = await sequelize.query(
    `SELECT id, reaction_type FROM community_post_comment_replies_reaction WHERE user_id = $1 AND community_post_comment_reply_id = $2 AND deleted_at IS NULL`,
    { bind: [userId, replyId], type: QueryTypes.SELECT }
  );
  if (existing.length > 0) {
    const r = (existing[0] as any).reaction_type;
    if (r === "DISLIKE") {
      await sequelize.query(
        `UPDATE community_post_comment_replies_reaction SET deleted_at = NOW() WHERE user_id = $1 AND community_post_comment_reply_id = $2 AND deleted_at IS NULL`,
        { bind: [userId, replyId], type: QueryTypes.UPDATE }
      );
    } else {
      await sequelize.query(
        `UPDATE community_post_comment_replies_reaction SET reaction_type = 'DISLIKE', updated_at = NOW(), deleted_at = NULL WHERE user_id = $1 AND community_post_comment_reply_id = $2`,
        { bind: [userId, replyId], type: QueryTypes.UPDATE }
      );
    }
  } else {
    await sequelize.query(
      `INSERT INTO community_post_comment_replies_reaction (user_id, community_post_comment_reply_id, reaction_type, created_at, updated_at) VALUES ($1, $2, 'DISLIKE', NOW(), NOW())`,
      { bind: [userId, replyId], type: QueryTypes.INSERT }
    );
  }
  const [likes] = await sequelize.query(
    `SELECT COUNT(*)::INTEGER as c FROM community_post_comment_replies_reaction WHERE community_post_comment_reply_id = $1 AND reaction_type = 'LIKE' AND deleted_at IS NULL`,
    { bind: [replyId], type: QueryTypes.SELECT }
  );
  const [dislikes] = await sequelize.query(
    `SELECT COUNT(*)::INTEGER as c FROM community_post_comment_replies_reaction WHERE community_post_comment_reply_id = $1 AND reaction_type = 'DISLIKE' AND deleted_at IS NULL`,
    { bind: [replyId], type: QueryTypes.SELECT }
  );
  const [cur] = await sequelize.query(
    `SELECT reaction_type FROM community_post_comment_replies_reaction WHERE user_id = $1 AND community_post_comment_reply_id = $2 AND deleted_at IS NULL`,
    { bind: [userId, replyId], type: QueryTypes.SELECT }
  );
  return {
    likesCount: (likes as any[])[0]?.c || 0,
    dislikesCount: (dislikes as any[])[0]?.c || 0,
    isLiked: (cur as any[])[0]?.reaction_type === "LIKE",
    isDisliked: (cur as any[])[0]?.reaction_type === "DISLIKE",
  };
}

