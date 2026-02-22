import { QueryTypes } from "sequelize";
import sequelize from "database";

export interface ToggleLikeResult {
  isLiked: boolean;
  isDisliked: boolean;
  likesCount: number;
  dislikesCount: number;
}

export const toggleCommunityPostLikeService = async (
  userId: string,
  communityPostId: string
): Promise<ToggleLikeResult> => {
  const existing = await sequelize.query(
    `SELECT id, reaction_type FROM community_post_likes 
     WHERE user_id = $1 AND community_post_id = $2 AND deleted_at IS NULL`,
    { bind: [userId, communityPostId], type: QueryTypes.SELECT }
  );

  if (existing.length > 0) {
    const reaction = existing[0] as any;
    if (reaction.reaction_type === "LIKE") {
      await sequelize.query(
        `UPDATE community_post_likes SET deleted_at = NOW(), reaction_type = 'NONE' 
         WHERE user_id = $1 AND community_post_id = $2 AND deleted_at IS NULL`,
        { bind: [userId, communityPostId], type: QueryTypes.UPDATE }
      );
    } else {
      await sequelize.query(
        `UPDATE community_post_likes SET reaction_type = 'LIKE', updated_at = NOW()
         WHERE user_id = $1 AND community_post_id = $2 AND deleted_at IS NULL`,
        { bind: [userId, communityPostId], type: QueryTypes.UPDATE }
      );
    }
  } else {
    await sequelize.query(
      `INSERT INTO community_post_likes (user_id, community_post_id, reaction_type, created_at, updated_at)
       VALUES ($1, $2, 'LIKE', NOW(), NOW())`,
      { bind: [userId, communityPostId], type: QueryTypes.INSERT }
    );
  }

  return getCommunityPostReactionStats(communityPostId, userId);
};

export const toggleCommunityPostDislikeService = async (
  userId: string,
  communityPostId: string
): Promise<ToggleLikeResult> => {
  const existing = await sequelize.query(
    `SELECT id, reaction_type FROM community_post_likes 
     WHERE user_id = $1 AND community_post_id = $2 AND deleted_at IS NULL`,
    { bind: [userId, communityPostId], type: QueryTypes.SELECT }
  );

  if (existing.length > 0) {
    const reaction = existing[0] as any;
    if (reaction.reaction_type === "DISLIKE") {
      await sequelize.query(
        `UPDATE community_post_likes SET deleted_at = NOW(), reaction_type = 'NONE' 
         WHERE user_id = $1 AND community_post_id = $2 AND deleted_at IS NULL`,
        { bind: [userId, communityPostId], type: QueryTypes.UPDATE }
      );
    } else {
      await sequelize.query(
        `UPDATE community_post_likes SET reaction_type = 'DISLIKE', updated_at = NOW()
         WHERE user_id = $1 AND community_post_id = $2 AND deleted_at IS NULL`,
        { bind: [userId, communityPostId], type: QueryTypes.UPDATE }
      );
    }
  } else {
    await sequelize.query(
      `INSERT INTO community_post_likes (user_id, community_post_id, reaction_type, created_at, updated_at)
       VALUES ($1, $2, 'DISLIKE', NOW(), NOW())`,
      { bind: [userId, communityPostId], type: QueryTypes.INSERT }
    );
  }

  return getCommunityPostReactionStats(communityPostId, userId);
};

function getCommunityPostReactionStats(
  communityPostId: string,
  userId: string
): Promise<ToggleLikeResult> {
  return sequelize
    .query(
      `SELECT 
        (SELECT COUNT(*)::INTEGER FROM community_post_likes WHERE community_post_id = $1 AND reaction_type = 'LIKE' AND deleted_at IS NULL) as likes_count,
        (SELECT COUNT(*)::INTEGER FROM community_post_likes WHERE community_post_id = $1 AND reaction_type = 'DISLIKE' AND deleted_at IS NULL) as dislikes_count,
        (SELECT reaction_type FROM community_post_likes WHERE user_id = $2 AND community_post_id = $1 AND deleted_at IS NULL LIMIT 1) as user_reaction`,
      { bind: [communityPostId, userId], type: QueryTypes.SELECT }
    )
    .then((rows: any) => {
      const r = (Array.isArray(rows) ? rows[0] : rows) as any;
      const userReaction = r?.user_reaction || "NONE";
      return {
        isLiked: userReaction === "LIKE",
        isDisliked: userReaction === "DISLIKE",
        likesCount: r?.likes_count || 0,
        dislikesCount: r?.dislikes_count || 0,
      };
    });
}

