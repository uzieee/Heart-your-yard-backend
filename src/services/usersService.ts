import { QueryTypes } from "sequelize";
import sequelize from "database";

export interface User {
  id: string;
  username: string;
  email: string;
  image: string;
  created_at: Date;
  follower_count: number;
  is_verified: boolean;
}

export interface UsersResponse {
  users: User[];
  hasMore: boolean;
  nextCursor?: string;
}

export interface CurrentUser {
  id: string;
  username: string;
  email: string;
  image: string | null;
  created_at: Date;
  is_verified: boolean;
}

export const getUsersService = async (
  currentUserId: string,
  cursor?: string,
  limit: number = 10
): Promise<UsersResponse> => {
  const limitValue = Math.min(limit, 50); // Max 50 per page
  const offset = cursor ? parseInt(cursor) : 0;

  // Get users excluding current user with follower count and verification status
  // Image comes from onboarding table, fallback to users table if not available
  // follower_count counts how many users THIS user is following (follower_id = user.id)
  const users = await sequelize.query(
    `SELECT 
       u.id, 
       u.username, 
       u.email, 
       COALESCE(o.image, u.image) as image, 
       u.created_at,
       COALESCE(u.is_verified_email, false) as is_verified,
       COALESCE(f.follower_count::INTEGER, 0) as follower_count
     FROM users u
     LEFT JOIN onboarding o ON u.id = o.user_id AND o.deleted_at IS NULL
     LEFT JOIN (
       SELECT follower_id, COUNT(*)::INTEGER as follower_count
       FROM follows
       WHERE deleted_at IS NULL
       GROUP BY follower_id
     ) f ON u.id = f.follower_id
     WHERE u.id != $1 AND u.deleted_at IS NULL
     ORDER BY u.created_at DESC
     LIMIT $2 OFFSET $3`,
    {
      bind: [currentUserId, limitValue + 1, offset],
      type: QueryTypes.SELECT,
    }
  ) as User[];

  const hasMore = users.length > limitValue;
  const usersToReturn = hasMore ? users.slice(0, limitValue) : users;

  // Next cursor is the offset for the next page
  const nextCursor = hasMore
    ? (offset + limitValue).toString()
    : undefined;

  return {
    users: usersToReturn,
    hasMore,
    nextCursor,
  };
};

export const getCurrentUserService = async (
  userId: string
): Promise<CurrentUser> => {
  // Get current user with image from onboarding table only (no fallback)
  const users = await sequelize.query(
    `SELECT 
       u.id, 
       u.username, 
       u.email, 
       o.image as image,
       u.created_at,
       COALESCE(u.is_verified_email, false) as is_verified
     FROM users u
     LEFT JOIN onboarding o ON u.id = o.user_id AND o.deleted_at IS NULL
     WHERE u.id = $1 AND u.deleted_at IS NULL`,
    {
      bind: [userId],
      type: QueryTypes.SELECT,
    }
  ) as CurrentUser[];

  if (users.length === 0) {
    throw { statusCode: 404, message: "User not found" };
  }

  return users[0];
};

