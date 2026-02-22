import { QueryTypes } from "sequelize";
import sequelize from "database";

export const followUserService = async (
  followerId: string,
  followingId: string
) => {
  // Check if already following
  const [existing] = await sequelize.query(
    `SELECT id FROM follows 
     WHERE follower_id = $1 AND following_id = $2 AND deleted_at IS NULL 
     LIMIT 1`,
    { bind: [followerId, followingId], type: QueryTypes.SELECT }
  ) as any[];

  if (existing) {
    throw { statusCode: 409, message: "Already following this user" };
  }

  // Create follow relationship
  const [result] = await sequelize.query(
    `INSERT INTO follows (follower_id, following_id)
     VALUES ($1, $2)
     RETURNING id`,
    { bind: [followerId, followingId], type: QueryTypes.INSERT }
  ) as any[];

  return {
    followId: result.id || result[0]?.id,
    message: "User followed successfully",
  };
};

export const unfollowUserService = async (
  followerId: string,
  followingId: string
) => {
  // Soft delete the follow relationship
  const [result] = await sequelize.query(
    `UPDATE follows 
     SET deleted_at = NOW()
     WHERE follower_id = $1 AND following_id = $2 AND deleted_at IS NULL
     RETURNING id`,
    { bind: [followerId, followingId], type: QueryTypes.UPDATE }
  ) as any[];

  if (!result || (Array.isArray(result) && result.length === 0)) {
    throw { statusCode: 404, message: "Follow relationship not found" };
  }
};

export const getFollowingsCountService = async (
  userId: string
): Promise<number> => {
  const [result] = await sequelize.query(
    `SELECT COUNT(*) as count 
     FROM follows 
     WHERE follower_id = $1 AND deleted_at IS NULL`,
    { bind: [userId], type: QueryTypes.SELECT }
  ) as any[];

  return parseInt(result?.count || "0", 10);
};

export interface FollowedUser {
  id: string;
  username: string;
  image: string;
  is_verified: boolean;
}

export const getFollowedUsersService = async (
  userId: string
): Promise<FollowedUser[]> => {
  const users = await sequelize.query(
    `SELECT 
       u.id,
       u.username,
       COALESCE(o.image, u.image) as image,
       COALESCE(u.is_verified_email, false) as is_verified
     FROM follows f
     INNER JOIN users u ON f.following_id = u.id
     LEFT JOIN onboarding o ON u.id = o.user_id AND o.deleted_at IS NULL
     WHERE f.follower_id = $1 AND f.deleted_at IS NULL AND u.deleted_at IS NULL
     ORDER BY f.created_at DESC
     LIMIT 10`,
    { bind: [userId], type: QueryTypes.SELECT }
  ) as FollowedUser[];

  return users;
};

/** Users who follow me (my followers). For "follower screen" - who is following the current user. */
export const getFollowersService = async (
  userId: string,
  limit = 10
): Promise<FollowedUser[]> => {
  const users = await sequelize.query(
    `SELECT 
       u.id,
       u.username,
       COALESCE(o.image, u.image) as image,
       COALESCE(u.is_verified_email, false) as is_verified
     FROM follows f
     INNER JOIN users u ON f.follower_id = u.id
     LEFT JOIN onboarding o ON u.id = o.user_id AND o.deleted_at IS NULL
     WHERE f.following_id = $1 AND f.deleted_at IS NULL AND u.deleted_at IS NULL
     ORDER BY f.created_at DESC
     LIMIT $2`,
    { bind: [userId, limit], type: QueryTypes.SELECT }
  ) as FollowedUser[];

  return users;
};

export const checkFollowStatusService = async (
  userId: string,
  targetUserIds: string[]
): Promise<string[]> => {
  if (targetUserIds.length === 0) return [];

  const placeholders = targetUserIds.map((_, i) => `$${i + 2}`).join(", ");

  const followed = await sequelize.query(
    `SELECT following_id 
     FROM follows 
     WHERE follower_id = $1 
       AND following_id IN (${placeholders})
       AND deleted_at IS NULL`,
    { bind: [userId, ...targetUserIds], type: QueryTypes.SELECT }
  ) as any[];

  return followed.map((f) => f.following_id);
};

