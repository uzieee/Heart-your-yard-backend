import { QueryTypes } from "sequelize";
import sequelize from "database";

export interface Comment {
  id: string;
  user_id: string;
  post_id: string;
  message: string;
  created_at: Date;
  updated_at: Date;
  user: {
    id: string;
    username: string;
    email: string;
    image: string | null;
    is_verified: boolean;
  };
  likes_count: number;
  dislikes_count: number;
  is_liked: boolean;
  is_disliked: boolean;
  replies: CommentReply[];
}

export interface CommentReply {
  id: string;
  user_id: string;
  comment_id: string;
  parent_reply_id?: string | null; // For nested replies
  message: string;
  created_at: Date;
  updated_at: Date;
  user: {
    id: string;
    username: string;
    email: string;
    image: string | null;
    is_verified: boolean;
  };
  likes_count: number;
  dislikes_count: number;
  is_liked: boolean;
  is_disliked: boolean;
  replies?: CommentReply[]; // Nested replies
}

export interface CreateCommentPayload {
  userId: string;
  postId: string;
  message: string;
}

export interface CreateCommentReplyPayload {
  userId: string;
  commentId: string;
  message: string;
  parentReplyId?: string; // For nested replies (replies of replies)
}

export const createCommentService = async (
  payload: CreateCommentPayload
): Promise<Comment> => {
  const { userId, postId, message } = payload;

  const result = await sequelize.query(
    `INSERT INTO comments (user_id, post_id, message, created_at, updated_at)
     VALUES ($1, $2, $3, NOW(), NOW())
     RETURNING *`,
    {
      bind: [userId, postId, message],
      type: QueryTypes.SELECT,
    }
  );

  if (!Array.isArray(result) || result.length === 0) {
    throw new Error("Failed to create comment");
  }

  const comment = result[0] as any;
  return await getCommentByIdService(comment.id, userId);
};

export const getCommentByIdService = async (
  commentId: string,
  currentUserId?: string
): Promise<Comment> => {
  const comments = await sequelize.query(
    `SELECT 
       c.id,
       c.user_id,
       c.post_id,
       c.message,
       c.created_at,
       c.updated_at,
       u.id as user_id,
       u.username,
       u.email,
       COALESCE(o.image, u.image) as user_image,
       COALESCE(u.is_verified_email, false) as is_verified,
       COALESCE(l.likes_count::INTEGER, 0) as likes_count,
       COALESCE(d.dislikes_count::INTEGER, 0) as dislikes_count,
       CASE WHEN cr_like.user_id IS NOT NULL THEN true ELSE false END as is_liked,
       CASE WHEN cr_dislike.user_id IS NOT NULL THEN true ELSE false END as is_disliked
     FROM comments c
     INNER JOIN users u ON c.user_id = u.id
     LEFT JOIN onboarding o ON u.id = o.user_id AND o.deleted_at IS NULL
     LEFT JOIN (
       SELECT comment_id, COUNT(*)::INTEGER as likes_count
       FROM comment_reaction
       WHERE reaction_type = 'LIKE' AND deleted_at IS NULL
       GROUP BY comment_id
     ) l ON c.id = l.comment_id
     LEFT JOIN (
       SELECT comment_id, COUNT(*)::INTEGER as dislikes_count
       FROM comment_reaction
       WHERE reaction_type = 'DISLIKE' AND deleted_at IS NULL
       GROUP BY comment_id
     ) d ON c.id = d.comment_id
     LEFT JOIN comment_reaction cr_like ON c.id = cr_like.comment_id AND cr_like.user_id = $2 AND cr_like.reaction_type = 'LIKE' AND cr_like.deleted_at IS NULL
     LEFT JOIN comment_reaction cr_dislike ON c.id = cr_dislike.comment_id AND cr_dislike.user_id = $2 AND cr_dislike.reaction_type = 'DISLIKE' AND cr_dislike.deleted_at IS NULL
     WHERE c.id = $1 AND c.deleted_at IS NULL`,
    {
      bind: [commentId, currentUserId || null],
      type: QueryTypes.SELECT,
    }
  );

  if (comments.length === 0) {
    throw new Error("Comment not found");
  }

  const commentData = comments[0] as any;

  // Fetch replies
  const repliesResult = await sequelize.query(
    `SELECT 
       cr.id,
       cr.user_id,
       cr.comment_id,
       cr.parent_reply_id,
       cr.message,
       cr.created_at,
       cr.updated_at,
       u.id as user_id,
       u.username,
       u.email,
       COALESCE(o.image, u.image) as user_image,
       COALESCE(u.is_verified_email, false) as is_verified,
       COALESCE(l.likes_count::INTEGER, 0) as likes_count,
       COALESCE(d.dislikes_count::INTEGER, 0) as dislikes_count,
       CASE WHEN crr_like.user_id IS NOT NULL THEN true ELSE false END as is_liked,
       CASE WHEN crr_dislike.user_id IS NOT NULL THEN true ELSE false END as is_disliked
     FROM comments_replies cr
     INNER JOIN users u ON cr.user_id = u.id
     LEFT JOIN onboarding o ON u.id = o.user_id AND o.deleted_at IS NULL
     LEFT JOIN (
       SELECT comment_reply_id, COUNT(*)::INTEGER as likes_count
       FROM comment_replies_reaction
       WHERE reaction_type = 'LIKE' AND deleted_at IS NULL
       GROUP BY comment_reply_id
     ) l ON cr.id = l.comment_reply_id
     LEFT JOIN (
       SELECT comment_reply_id, COUNT(*)::INTEGER as dislikes_count
       FROM comment_replies_reaction
       WHERE reaction_type = 'DISLIKE' AND deleted_at IS NULL
       GROUP BY comment_reply_id
     ) d ON cr.id = d.comment_reply_id
     LEFT JOIN comment_replies_reaction crr_like ON cr.id = crr_like.comment_reply_id AND crr_like.user_id = $2 AND crr_like.reaction_type = 'LIKE' AND crr_like.deleted_at IS NULL
     LEFT JOIN comment_replies_reaction crr_dislike ON cr.id = crr_dislike.comment_reply_id AND crr_dislike.user_id = $2 AND crr_dislike.reaction_type = 'DISLIKE' AND crr_dislike.deleted_at IS NULL
     WHERE cr.comment_id = $1 AND cr.deleted_at IS NULL
     ORDER BY cr.created_at ASC`,
    {
      bind: [commentId, currentUserId || null],
      type: QueryTypes.SELECT,
    }
  );

  return {
    id: commentData.id,
    user_id: commentData.user_id,
    post_id: commentData.post_id,
    message: commentData.message,
    created_at: commentData.created_at,
    updated_at: commentData.updated_at,
    user: {
      id: commentData.user_id,
      username: commentData.username,
      email: commentData.email,
      image: commentData.user_image,
      is_verified: commentData.is_verified,
    },
    likes_count: commentData.likes_count || 0,
    dislikes_count: commentData.dislikes_count || 0,
    is_liked: commentData.is_liked || false,
    is_disliked: commentData.is_disliked || false,
    replies: repliesResult.map((reply: any) => ({
      id: reply.id,
      user_id: reply.user_id,
      comment_id: reply.comment_id,
      parent_reply_id: reply.parent_reply_id || null,
      message: reply.message,
      created_at: reply.created_at,
      updated_at: reply.updated_at,
      user: {
        id: reply.user_id,
        username: reply.username,
        email: reply.email,
        image: reply.user_image,
        is_verified: reply.is_verified,
      },
      likes_count: reply.likes_count || 0,
      dislikes_count: reply.dislikes_count || 0,
      is_liked: reply.is_liked || false,
      is_disliked: reply.is_disliked || false,
      replies: [],
    })),
  };
};

export const getCommentsByPostIdService = async (
  postId: string,
  currentUserId?: string
): Promise<Comment[]> => {
  const comments = await sequelize.query(
    `SELECT 
       c.id,
       c.user_id,
       c.post_id,
       c.message,
       c.created_at,
       c.updated_at,
       u.id as user_id,
       u.username,
       u.email,
       COALESCE(o.image, u.image) as user_image,
       COALESCE(u.is_verified_email, false) as is_verified,
       COALESCE(l.likes_count::INTEGER, 0) as likes_count,
       COALESCE(d.dislikes_count::INTEGER, 0) as dislikes_count,
       CASE WHEN cr_like.user_id IS NOT NULL THEN true ELSE false END as is_liked,
       CASE WHEN cr_dislike.user_id IS NOT NULL THEN true ELSE false END as is_disliked
     FROM comments c
     INNER JOIN users u ON c.user_id = u.id
     LEFT JOIN onboarding o ON u.id = o.user_id AND o.deleted_at IS NULL
     LEFT JOIN (
       SELECT comment_id, COUNT(*)::INTEGER as likes_count
       FROM comment_reaction
       WHERE reaction_type = 'LIKE' AND deleted_at IS NULL
       GROUP BY comment_id
     ) l ON c.id = l.comment_id
     LEFT JOIN (
       SELECT comment_id, COUNT(*)::INTEGER as dislikes_count
       FROM comment_reaction
       WHERE reaction_type = 'DISLIKE' AND deleted_at IS NULL
       GROUP BY comment_id
     ) d ON c.id = d.comment_id
     LEFT JOIN comment_reaction cr_like ON c.id = cr_like.comment_id AND cr_like.user_id = $2 AND cr_like.reaction_type = 'LIKE' AND cr_like.deleted_at IS NULL
     LEFT JOIN comment_reaction cr_dislike ON c.id = cr_dislike.comment_id AND cr_dislike.user_id = $2 AND cr_dislike.reaction_type = 'DISLIKE' AND cr_dislike.deleted_at IS NULL
     WHERE c.post_id = $1 AND c.deleted_at IS NULL
     ORDER BY c.created_at DESC`,
    {
      bind: [postId, currentUserId || null],
      type: QueryTypes.SELECT,
    }
  );

  // Fetch replies for all comments
  const commentIds = comments.map((c: any) => c.id);
  let repliesMap: Map<string, CommentReply[]> = new Map();

  if (commentIds.length > 0) {
    const repliesResult = await sequelize.query(
      `SELECT 
         cr.id,
         cr.user_id,
         cr.comment_id,
         cr.parent_reply_id,
         cr.message,
         cr.created_at,
         cr.updated_at,
         u.id as user_id,
         u.username,
         u.email,
         COALESCE(o.image, u.image) as user_image,
         COALESCE(u.is_verified_email, false) as is_verified,
         COALESCE(l.likes_count::INTEGER, 0) as likes_count,
         COALESCE(d.dislikes_count::INTEGER, 0) as dislikes_count,
         CASE WHEN crr_like.user_id IS NOT NULL THEN true ELSE false END as is_liked,
         CASE WHEN crr_dislike.user_id IS NOT NULL THEN true ELSE false END as is_disliked
       FROM comments_replies cr
       INNER JOIN users u ON cr.user_id = u.id
       LEFT JOIN onboarding o ON u.id = o.user_id AND o.deleted_at IS NULL
       LEFT JOIN (
         SELECT comment_reply_id, COUNT(*)::INTEGER as likes_count
         FROM comment_replies_reaction
         WHERE reaction_type = 'LIKE' AND deleted_at IS NULL
         GROUP BY comment_reply_id
       ) l ON cr.id = l.comment_reply_id
       LEFT JOIN (
         SELECT comment_reply_id, COUNT(*)::INTEGER as dislikes_count
         FROM comment_replies_reaction
         WHERE reaction_type = 'DISLIKE' AND deleted_at IS NULL
         GROUP BY comment_reply_id
       ) d ON cr.id = d.comment_reply_id
       LEFT JOIN comment_replies_reaction crr_like ON cr.id = crr_like.comment_reply_id AND crr_like.user_id = $2 AND crr_like.reaction_type = 'LIKE' AND crr_like.deleted_at IS NULL
       LEFT JOIN comment_replies_reaction crr_dislike ON cr.id = crr_dislike.comment_reply_id AND crr_dislike.user_id = $2 AND crr_dislike.reaction_type = 'DISLIKE' AND crr_dislike.deleted_at IS NULL
       WHERE cr.comment_id = ANY($1) AND cr.deleted_at IS NULL
       ORDER BY cr.created_at ASC`,
      {
        bind: [commentIds, currentUserId || null],
        type: QueryTypes.SELECT,
      }
    );

    const repliesArray = repliesResult as any[];
    
    // Build nested replies structure
    const allReplies: CommentReply[] = repliesArray.map((reply: any) => ({
      id: reply.id,
      user_id: reply.user_id,
      comment_id: reply.comment_id,
      parent_reply_id: reply.parent_reply_id || null,
      message: reply.message,
      created_at: reply.created_at,
      updated_at: reply.updated_at,
      user: {
        id: reply.user_id,
        username: reply.username,
        email: reply.email,
        image: reply.user_image,
        is_verified: reply.is_verified,
      },
      likes_count: reply.likes_count || 0,
      dislikes_count: reply.dislikes_count || 0,
      is_liked: reply.is_liked || false,
      is_disliked: reply.is_disliked || false,
      replies: [], // Will be populated below
    }));

    // Build nested structure: first add top-level replies (no parent)
    allReplies.forEach((reply) => {
      if (!reply.parent_reply_id) {
        if (!repliesMap.has(reply.comment_id)) {
          repliesMap.set(reply.comment_id, []);
        }
        repliesMap.get(reply.comment_id)!.push(reply);
      }
    });

    // Then add nested replies to their parents
    allReplies.forEach((reply) => {
      if (reply.parent_reply_id) {
        // Find parent reply in the map
        const commentReplies = repliesMap.get(reply.comment_id) || [];
        const findAndAddToParent = (replies: CommentReply[]): boolean => {
          for (const parentReply of replies) {
            if (parentReply.id === reply.parent_reply_id) {
              if (!parentReply.replies) {
                parentReply.replies = [];
              }
              parentReply.replies.push(reply);
              return true;
            }
            if (parentReply.replies && findAndAddToParent(parentReply.replies)) {
              return true;
            }
          }
          return false;
        };
        findAndAddToParent(commentReplies);
      }
    });
  }

  return comments.map((commentData: any) => ({
    id: commentData.id,
    user_id: commentData.user_id,
    post_id: commentData.post_id,
    message: commentData.message,
    created_at: commentData.created_at,
    updated_at: commentData.updated_at,
    user: {
      id: commentData.user_id,
      username: commentData.username,
      email: commentData.email,
      image: commentData.user_image,
      is_verified: commentData.is_verified,
    },
    likes_count: commentData.likes_count || 0,
    dislikes_count: commentData.dislikes_count || 0,
    is_liked: commentData.is_liked || false,
    is_disliked: commentData.is_disliked || false,
    replies: repliesMap.get(commentData.id) || [],
  }));
};

export const createCommentReplyService = async (
  payload: CreateCommentReplyPayload
): Promise<CommentReply> => {
  const { userId, commentId, message, parentReplyId } = payload;

  const result = await sequelize.query(
    `INSERT INTO comments_replies (user_id, comment_id, parent_reply_id, message, created_at, updated_at)
     VALUES ($1, $2, $3, $4, NOW(), NOW())
     RETURNING *`,
    {
      bind: [userId, commentId, parentReplyId || null, message],
      type: QueryTypes.SELECT,
    }
  );

  if (!Array.isArray(result) || result.length === 0) {
    throw new Error("Failed to create reply");
  }

  const reply = result[0] as any;

  // Fetch complete reply with user data
  const replies = await sequelize.query(
    `SELECT 
       cr.id,
       cr.user_id,
       cr.comment_id,
       cr.parent_reply_id,
       cr.message,
       cr.created_at,
       cr.updated_at,
       u.id as user_id,
       u.username,
       u.email,
       COALESCE(o.image, u.image) as user_image,
       COALESCE(u.is_verified_email, false) as is_verified,
       COALESCE(l.likes_count::INTEGER, 0) as likes_count,
       COALESCE(d.dislikes_count::INTEGER, 0) as dislikes_count,
       false as is_liked,
       false as is_disliked
     FROM comments_replies cr
     INNER JOIN users u ON cr.user_id = u.id
     LEFT JOIN onboarding o ON u.id = o.user_id AND o.deleted_at IS NULL
     LEFT JOIN (
       SELECT comment_reply_id, COUNT(*)::INTEGER as likes_count
       FROM comment_replies_reaction
       WHERE reaction_type = 'LIKE' AND deleted_at IS NULL
       GROUP BY comment_reply_id
     ) l ON cr.id = l.comment_reply_id
     LEFT JOIN (
       SELECT comment_reply_id, COUNT(*)::INTEGER as dislikes_count
       FROM comment_replies_reaction
       WHERE reaction_type = 'DISLIKE' AND deleted_at IS NULL
       GROUP BY comment_reply_id
     ) d ON cr.id = d.comment_reply_id
     WHERE cr.id = $1 AND cr.deleted_at IS NULL`,
    {
      bind: [reply.id],
      type: QueryTypes.SELECT,
    }
  );

  if (!Array.isArray(replies) || replies.length === 0) {
    throw new Error("Failed to fetch reply");
  }

  const replyData = replies[0] as any;
  return {
    id: replyData.id,
    user_id: replyData.user_id,
    comment_id: replyData.comment_id,
    parent_reply_id: replyData.parent_reply_id || null,
    message: replyData.message,
    created_at: replyData.created_at,
    updated_at: replyData.updated_at,
    user: {
      id: replyData.user_id,
      username: replyData.username,
      email: replyData.email,
      image: replyData.user_image,
      is_verified: replyData.is_verified,
    },
    likes_count: replyData.likes_count || 0,
    dislikes_count: replyData.dislikes_count || 0,
    is_liked: replyData.is_liked || false,
    is_disliked: replyData.is_disliked || false,
    replies: [],
  };
};

export const toggleCommentLikeService = async (
  userId: string,
  commentId: string
): Promise<{ isLiked: boolean; isDisliked: boolean; likesCount: number; dislikesCount: number }> => {
  // Check if reaction exists
  const existing = await sequelize.query(
    `SELECT id, reaction_type FROM comment_reaction 
     WHERE user_id = $1 AND comment_id = $2 AND deleted_at IS NULL`,
    {
      bind: [userId, commentId],
      type: QueryTypes.SELECT,
    }
  );

  if (existing.length > 0) {
    const reaction = existing[0] as any;
    if (reaction.reaction_type === "LIKE") {
      // Unlike - soft delete
      await sequelize.query(
        `UPDATE comment_reaction SET deleted_at = NOW() 
         WHERE user_id = $1 AND comment_id = $2 AND deleted_at IS NULL`,
        {
          bind: [userId, commentId],
          type: QueryTypes.UPDATE,
        }
      );
    } else if (reaction.reaction_type === "DISLIKE") {
      // Convert DISLIKE to LIKE
      await sequelize.query(
        `UPDATE comment_reaction SET reaction_type = 'LIKE', deleted_at = NULL, updated_at = NOW() 
         WHERE user_id = $1 AND comment_id = $2`,
        {
          bind: [userId, commentId],
          type: QueryTypes.UPDATE,
        }
      );
    }
  } else {
    // Create new like
    await sequelize.query(
      `INSERT INTO comment_reaction (user_id, comment_id, reaction_type, created_at, updated_at)
       VALUES ($1, $2, 'LIKE', NOW(), NOW())`,
      {
        bind: [userId, commentId],
        type: QueryTypes.INSERT,
      }
    );
  }

  // Get updated counts
  const likesCountResult = await sequelize.query(
    `SELECT COUNT(*)::INTEGER as count FROM comment_reaction 
     WHERE comment_id = $1 AND reaction_type = 'LIKE' AND deleted_at IS NULL`,
    {
      bind: [commentId],
      type: QueryTypes.SELECT,
    }
  );

  const dislikesCountResult = await sequelize.query(
    `SELECT COUNT(*)::INTEGER as count FROM comment_reaction 
     WHERE comment_id = $1 AND reaction_type = 'DISLIKE' AND deleted_at IS NULL`,
    {
      bind: [commentId],
      type: QueryTypes.SELECT,
    }
  );

  const likesCount = (likesCountResult[0] as any).count || 0;
  const dislikesCount = (dislikesCountResult[0] as any).count || 0;

  // Check current reaction status
  const currentReaction = await sequelize.query(
    `SELECT reaction_type FROM comment_reaction 
     WHERE user_id = $1 AND comment_id = $2 AND deleted_at IS NULL`,
    {
      bind: [userId, commentId],
      type: QueryTypes.SELECT,
    }
  );

  const reactionType = currentReaction.length > 0 ? (currentReaction[0] as any).reaction_type : "NONE";

  return {
    isLiked: reactionType === "LIKE",
    isDisliked: reactionType === "DISLIKE",
    likesCount,
    dislikesCount,
  };
};

export const toggleCommentReplyLikeService = async (
  userId: string,
  replyId: string
): Promise<{ isLiked: boolean; isDisliked: boolean; likesCount: number; dislikesCount: number }> => {
  // Check if reaction exists
  const existing = await sequelize.query(
    `SELECT id, reaction_type FROM comment_replies_reaction 
     WHERE user_id = $1 AND comment_reply_id = $2 AND deleted_at IS NULL`,
    {
      bind: [userId, replyId],
      type: QueryTypes.SELECT,
    }
  );

  if (existing.length > 0) {
    const reaction = existing[0] as any;
    if (reaction.reaction_type === "LIKE") {
      // Unlike - soft delete
      await sequelize.query(
        `UPDATE comment_replies_reaction SET deleted_at = NOW() 
         WHERE user_id = $1 AND comment_reply_id = $2 AND deleted_at IS NULL`,
        {
          bind: [userId, replyId],
          type: QueryTypes.UPDATE,
        }
      );
    } else if (reaction.reaction_type === "DISLIKE") {
      // Convert DISLIKE to LIKE
      await sequelize.query(
        `UPDATE comment_replies_reaction SET reaction_type = 'LIKE', deleted_at = NULL, updated_at = NOW() 
         WHERE user_id = $1 AND comment_reply_id = $2`,
        {
          bind: [userId, replyId],
          type: QueryTypes.UPDATE,
        }
      );
    }
  } else {
    // Create new like
    await sequelize.query(
      `INSERT INTO comment_replies_reaction (user_id, comment_reply_id, reaction_type, created_at, updated_at)
       VALUES ($1, $2, 'LIKE', NOW(), NOW())`,
      {
        bind: [userId, replyId],
        type: QueryTypes.INSERT,
      }
    );
  }

  // Get updated counts
  const likesCountResult = await sequelize.query(
    `SELECT COUNT(*)::INTEGER as count FROM comment_replies_reaction 
     WHERE comment_reply_id = $1 AND reaction_type = 'LIKE' AND deleted_at IS NULL`,
    {
      bind: [replyId],
      type: QueryTypes.SELECT,
    }
  );

  const dislikesCountResult = await sequelize.query(
    `SELECT COUNT(*)::INTEGER as count FROM comment_replies_reaction 
     WHERE comment_reply_id = $1 AND reaction_type = 'DISLIKE' AND deleted_at IS NULL`,
    {
      bind: [replyId],
      type: QueryTypes.SELECT,
    }
  );

  const likesCount = (likesCountResult[0] as any).count || 0;
  const dislikesCount = (dislikesCountResult[0] as any).count || 0;

  // Check current reaction status
  const currentReaction = await sequelize.query(
    `SELECT reaction_type FROM comment_replies_reaction 
     WHERE user_id = $1 AND comment_reply_id = $2 AND deleted_at IS NULL`,
    {
      bind: [userId, replyId],
      type: QueryTypes.SELECT,
    }
  );

  const reactionType = currentReaction.length > 0 ? (currentReaction[0] as any).reaction_type : "NONE";

  return {
    isLiked: reactionType === "LIKE",
    isDisliked: reactionType === "DISLIKE",
    likesCount,
    dislikesCount,
  };
};



export const toggleCommentDislikeService = async (
  userId: string,
  commentId: string
): Promise<{ isLiked: boolean; isDisliked: boolean; likesCount: number; dislikesCount: number }> => {
  const existing = await sequelize.query(
    `SELECT id, reaction_type FROM comment_reaction 
     WHERE user_id = $1 AND comment_id = $2 AND deleted_at IS NULL`,
    { bind: [userId, commentId], type: QueryTypes.SELECT }
  );
  if (existing.length > 0) {
    const reaction = existing[0] as any;
    if (reaction.reaction_type === "DISLIKE") {
      await sequelize.query(
        `UPDATE comment_reaction SET deleted_at = NOW() 
         WHERE user_id = $1 AND comment_id = $2 AND deleted_at IS NULL`,
        { bind: [userId, commentId], type: QueryTypes.UPDATE }
      );
    } else if (reaction.reaction_type === "LIKE") {
      await sequelize.query(
        `UPDATE comment_reaction SET reaction_type = 'DISLIKE', deleted_at = NULL, updated_at = NOW() 
         WHERE user_id = $1 AND comment_id = $2`,
        { bind: [userId, commentId], type: QueryTypes.UPDATE }
      );
    }
  } else {
    await sequelize.query(
      `INSERT INTO comment_reaction (user_id, comment_id, reaction_type, created_at, updated_at)
       VALUES ($1, $2, 'DISLIKE', NOW(), NOW())`,
      { bind: [userId, commentId], type: QueryTypes.INSERT }
    );
  }
  const likesCountResult = await sequelize.query(
    `SELECT COUNT(*)::INTEGER as count FROM comment_reaction 
     WHERE comment_id = $1 AND reaction_type = 'LIKE' AND deleted_at IS NULL`,
    { bind: [commentId], type: QueryTypes.SELECT }
  );
  const dislikesCountResult = await sequelize.query(
    `SELECT COUNT(*)::INTEGER as count FROM comment_reaction 
     WHERE comment_id = $1 AND reaction_type = 'DISLIKE' AND deleted_at IS NULL`,
    { bind: [commentId], type: QueryTypes.SELECT }
  );
  const likesCount = (likesCountResult[0] as any).count || 0;
  const dislikesCount = (dislikesCountResult[0] as any).count || 0;
  const currentReaction = await sequelize.query(
    `SELECT reaction_type FROM comment_reaction 
     WHERE user_id = $1 AND comment_id = $2 AND deleted_at IS NULL`,
    { bind: [userId, commentId], type: QueryTypes.SELECT }
  );
  const reactionType = currentReaction.length > 0 ? (currentReaction[0] as any).reaction_type : "NONE";
  return { isLiked: reactionType === "LIKE", isDisliked: reactionType === "DISLIKE", likesCount, dislikesCount };
};

export const toggleCommentReplyDislikeService = async (
  userId: string,
  replyId: string
): Promise<{ isLiked: boolean; isDisliked: boolean; likesCount: number; dislikesCount: number }> => {
  const existing = await sequelize.query(
    `SELECT id, reaction_type FROM comment_replies_reaction 
     WHERE user_id = $1 AND comment_reply_id = $2 AND deleted_at IS NULL`,
    { bind: [userId, replyId], type: QueryTypes.SELECT }
  );
  if (existing.length > 0) {
    const reaction = existing[0] as any;
    if (reaction.reaction_type === "DISLIKE") {
      await sequelize.query(
        `UPDATE comment_replies_reaction SET deleted_at = NOW() 
         WHERE user_id = $1 AND comment_reply_id = $2 AND deleted_at IS NULL`,
        { bind: [userId, replyId], type: QueryTypes.UPDATE }
      );
    } else if (reaction.reaction_type === "LIKE") {
      await sequelize.query(
        `UPDATE comment_replies_reaction SET reaction_type = 'DISLIKE', deleted_at = NULL, updated_at = NOW() 
         WHERE user_id = $1 AND comment_reply_id = $2`,
        { bind: [userId, replyId], type: QueryTypes.UPDATE }
      );
    }
  } else {
    await sequelize.query(
      `INSERT INTO comment_replies_reaction (user_id, comment_reply_id, reaction_type, created_at, updated_at)
       VALUES ($1, $2, 'DISLIKE', NOW(), NOW())`,
      { bind: [userId, replyId], type: QueryTypes.INSERT }
    );
  }
  const likesCountResult = await sequelize.query(
    `SELECT COUNT(*)::INTEGER as count FROM comment_replies_reaction 
     WHERE comment_reply_id = $1 AND reaction_type = 'LIKE' AND deleted_at IS NULL`,
    { bind: [replyId], type: QueryTypes.SELECT }
  );
  const dislikesCountResult = await sequelize.query(
    `SELECT COUNT(*)::INTEGER as count FROM comment_replies_reaction 
     WHERE comment_reply_id = $1 AND reaction_type = 'DISLIKE' AND deleted_at IS NULL`,
    { bind: [replyId], type: QueryTypes.SELECT }
  );
  const likesCount = (likesCountResult[0] as any).count || 0;
  const dislikesCount = (dislikesCountResult[0] as any).count || 0;
  const currentReaction = await sequelize.query(
    `SELECT reaction_type FROM comment_replies_reaction 
     WHERE user_id = $1 AND comment_reply_id = $2 AND deleted_at IS NULL`,
    { bind: [userId, replyId], type: QueryTypes.SELECT }
  );
  const reactionType = currentReaction.length > 0 ? (currentReaction[0] as any).reaction_type : "NONE";
  return { isLiked: reactionType === "LIKE", isDisliked: reactionType === "DISLIKE", likesCount, dislikesCount };
};
