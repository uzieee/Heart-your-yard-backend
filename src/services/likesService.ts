import { QueryTypes } from "sequelize";
import sequelize from "database";

export interface ToggleLikeResult {
  isLiked: boolean;
  isDisliked: boolean;
  likesCount: number;
  dislikesCount: number;
}

export const togglePostLikeService = async (
  userId: string,
  postId: string
): Promise<ToggleLikeResult> => {
  // Check if reaction exists
  const existing = await sequelize.query(
    `SELECT id, reaction_type FROM post_likes 
     WHERE user_id = $1 AND post_id = $2 AND deleted_at IS NULL`,
    {
      bind: [userId, postId],
      type: QueryTypes.SELECT,
    }
  );

  if (existing.length > 0) {
    const reaction = existing[0] as any;
    if (reaction.reaction_type === 'LIKE') {
      // Already liked, so unlike (remove reaction)
      await sequelize.query(
        `UPDATE post_likes SET deleted_at = NOW(), reaction_type = 'NONE' 
         WHERE user_id = $1 AND post_id = $2 AND deleted_at IS NULL`,
        {
          bind: [userId, postId],
          type: QueryTypes.UPDATE,
        }
      );
    } else {
      // Was disliked or NONE, switch to LIKE
      await sequelize.query(
        `UPDATE post_likes SET reaction_type = 'LIKE', updated_at = NOW()
         WHERE user_id = $1 AND post_id = $2 AND deleted_at IS NULL`,
        {
          bind: [userId, postId],
          type: QueryTypes.UPDATE,
        }
      );
    }
  } else {
    // Create new like
    await sequelize.query(
      `INSERT INTO post_likes (user_id, post_id, reaction_type, created_at, updated_at)
       VALUES ($1, $2, 'LIKE', NOW(), NOW())`,
      {
        bind: [userId, postId],
        type: QueryTypes.INSERT,
      }
    );
  }

  return getPostReactionStats(postId, userId);
};

export const togglePostDislikeService = async (
  userId: string,
  postId: string
): Promise<ToggleLikeResult> => {
  // Check if reaction exists
  const existing = await sequelize.query(
    `SELECT id, reaction_type FROM post_likes 
     WHERE user_id = $1 AND post_id = $2 AND deleted_at IS NULL`,
    {
      bind: [userId, postId],
      type: QueryTypes.SELECT,
    }
  );

  if (existing.length > 0) {
    const reaction = existing[0] as any;
    if (reaction.reaction_type === 'DISLIKE') {
      // Already disliked, so remove reaction
      await sequelize.query(
        `UPDATE post_likes SET deleted_at = NOW(), reaction_type = 'NONE' 
         WHERE user_id = $1 AND post_id = $2 AND deleted_at IS NULL`,
        {
          bind: [userId, postId],
          type: QueryTypes.UPDATE,
        }
      );
    } else {
      // Was liked or NONE, switch to DISLIKE
      await sequelize.query(
        `UPDATE post_likes SET reaction_type = 'DISLIKE', updated_at = NOW()
         WHERE user_id = $1 AND post_id = $2 AND deleted_at IS NULL`,
        {
          bind: [userId, postId],
          type: QueryTypes.UPDATE,
        }
      );
    }
  } else {
    // Create new dislike
    await sequelize.query(
      `INSERT INTO post_likes (user_id, post_id, reaction_type, created_at, updated_at)
       VALUES ($1, $2, 'DISLIKE', NOW(), NOW())`,
      {
        bind: [userId, postId],
        type: QueryTypes.INSERT,
      }
    );
  }

  return getPostReactionStats(postId, userId);
};

const getPostReactionStats = async (postId: string, userId: string): Promise<ToggleLikeResult> => {
  // Get likes count
  const likesCountResult = await sequelize.query(
    `SELECT COUNT(*)::INTEGER as count FROM post_likes 
     WHERE post_id = $1 AND reaction_type = 'LIKE' AND deleted_at IS NULL`,
    {
      bind: [postId],
      type: QueryTypes.SELECT,
    }
  );
  const likesCount = (likesCountResult[0] as any).count || 0;

  // Get dislikes count
  const dislikesCountResult = await sequelize.query(
    `SELECT COUNT(*)::INTEGER as count FROM post_likes 
     WHERE post_id = $1 AND reaction_type = 'DISLIKE' AND deleted_at IS NULL`,
    {
      bind: [postId],
      type: QueryTypes.SELECT,
    }
  );
  const dislikesCount = (dislikesCountResult[0] as any).count || 0;

  // Check current user reaction
  const userReactionResult = await sequelize.query(
    `SELECT reaction_type FROM post_likes 
     WHERE user_id = $1 AND post_id = $2 AND deleted_at IS NULL`,
    {
      bind: [userId, postId],
      type: QueryTypes.SELECT,
    }
  );

  const userReaction = userReactionResult.length > 0 ? (userReactionResult[0] as any).reaction_type : 'NONE';

  return {
    isLiked: userReaction === 'LIKE',
    isDisliked: userReaction === 'DISLIKE',
    likesCount,
    dislikesCount
  };
};


