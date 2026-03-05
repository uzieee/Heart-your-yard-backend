import { QueryTypes } from "sequelize";
import sequelize from "database";

/**
 * Follow a user (one-way relationship)
 * ⚠️ IMPORTANT: This function ONLY creates an entry in the 'follows' table
 * It does NOT create any entry in the 'friend_requests' table
 * Friend requests should be handled separately by sendFriendRequestService
 */
export const followUserService = async (
  followerId: string,
  followingId: string
) => {
  console.log(`[followUserService] Starting follow: ${followerId} -> ${followingId}`);
  console.log(`[followUserService] ⚠️ This function ONLY modifies 'follows' table, NOT 'friend_requests' table`);
  
  // Check if already following
  const [existing] = await sequelize.query(
    `SELECT id FROM follows 
     WHERE follower_id = $1 AND following_id = $2 AND deleted_at IS NULL 
     LIMIT 1`,
    { bind: [followerId, followingId], type: QueryTypes.SELECT }
  ) as any[];

  if (existing) {
    console.log(`[followUserService] Already following: ${followerId} -> ${followingId}`);
    throw { statusCode: 409, message: "Already following this user" };
  }

  // Create follow relationship - ONLY in follows table, NOT in friend_requests
  console.log(`[followUserService] Creating follow relationship in follows table only`);
  console.log(`[followUserService] ⚠️ IMPORTANT: This should NOT create any entry in friend_requests table`);
  
  // Use transaction to ensure atomicity and prevent any triggers from creating friend requests
  const transaction = await sequelize.transaction();
  let transactionCommitted = false;
  
  try {
    // Verify no friend request exists before creating follow
    const [existingFriendRequest] = await sequelize.query(
      `SELECT id FROM friend_requests 
       WHERE ((requester_id = $1 AND receiver_id = $2) OR (requester_id = $2 AND receiver_id = $1))
       AND deleted_at IS NULL 
       LIMIT 1`,
      { bind: [followerId, followingId], type: QueryTypes.SELECT, transaction }
    ) as any[];
    
    if (existingFriendRequest) {
      console.log(`[followUserService] ⚠️ WARNING: Friend request already exists, but continuing with follow`);
    } else {
      console.log(`[followUserService] ✅ No existing friend request found - safe to create follow`);
    }
    
    // Create follow relationship - ONLY in follows table
    const [result] = await sequelize.query(
      `INSERT INTO follows (follower_id, following_id)
       VALUES ($1, $2)
       RETURNING id`,
      { bind: [followerId, followingId], type: QueryTypes.INSERT, transaction }
    ) as any[];

    const followId = result.id || result[0]?.id;
    console.log(`[followUserService] ✅ Follow created successfully with id: ${followId}`);
    
    // Commit transaction first
    await transaction.commit();
    transactionCommitted = true;
    console.log(`[followUserService] Transaction committed successfully`);
    
    // CRITICAL CHECK: Verify friend request was NOT created by any trigger or other mechanism
    // Check AFTER commit to catch triggers that fire after transaction commit
    const [checkFriendRequest] = await sequelize.query(
      `SELECT id, requester_id, receiver_id, status, created_at FROM friend_requests 
       WHERE ((requester_id = $1 AND receiver_id = $2) OR (requester_id = $2 AND receiver_id = $1))
       AND deleted_at IS NULL 
       AND created_at > NOW() - INTERVAL '10 seconds'
       ORDER BY created_at DESC
       LIMIT 1`,
      { bind: [followerId, followingId], type: QueryTypes.SELECT }
    ) as any[];
    
    if (checkFriendRequest && checkFriendRequest.length > 0) {
      const fr = Array.isArray(checkFriendRequest) ? checkFriendRequest[0] : checkFriendRequest;
      console.error(`[followUserService] ❌❌❌ CRITICAL ERROR: Friend request was created! ❌❌❌`);
      console.error(`[followUserService] Friend request details:`, JSON.stringify(fr, null, 2));
      console.error(`[followUserService] This indicates a DATABASE TRIGGER or other automatic mechanism!`);
      
      // DELETE the friend request that was incorrectly created
      try {
        await sequelize.query(
          `UPDATE friend_requests 
           SET deleted_at = NOW() 
           WHERE id = $1 AND deleted_at IS NULL`,
          { bind: [fr.id], type: QueryTypes.UPDATE }
        );
        console.log(`[followUserService] ✅ Deleted incorrectly created friend request with ID: ${fr.id}`);
      } catch (deleteError) {
        console.error(`[followUserService] Error deleting friend request:`, deleteError);
      }
    } else {
      console.log(`[followUserService] ✅ Verified: No friend request was created (as expected)`);
    }
    
    return {
      followId: followId,
      message: "User followed successfully",
    };
  } catch (error) {
    // Rollback transaction only if it hasn't been committed yet
    if (!transactionCommitted) {
      try {
        await transaction.rollback();
      } catch (rollbackError) {
        console.error(`[followUserService] Error rolling back transaction:`, rollbackError);
      }
    }
    throw error;
  }
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

/** Count of users who follow me (my followers). */
export const getFollowersCountService = async (
  userId: string
): Promise<number> => {
  const [result] = await sequelize.query(
    `SELECT COUNT(*) as count 
     FROM follows 
     WHERE following_id = $1 AND deleted_at IS NULL`,
    { bind: [userId], type: QueryTypes.SELECT }
  ) as any[];

  return parseInt(result?.count || "0", 10);
};

export interface FollowedUser {
  id: string;
  username: string;
  image: string;
  is_verified: boolean;
  followed_at?: string | null;
}

export interface FollowersFollowingPageResult {
  users: FollowedUser[];
  nextCursor: string | null;
  hasMore: boolean;
}

/** My following (users I follow). Cursor-based pagination for infinite scroll. Optional search by username. */
export const getFollowedUsersPaginatedService = async (
  userId: string,
  limit = 10,
  cursor?: string | null,
  search?: string | null
): Promise<FollowersFollowingPageResult> => {
  const limitNum = Math.min(Math.max(1, limit), 50);
  let whereClause = "f.follower_id = $1 AND f.deleted_at IS NULL AND u.deleted_at IS NULL";
  const bind: (string | number)[] = [userId];
  let paramIndex = 2;
  if (search && search.trim()) {
    whereClause += ` AND u.username ILIKE $${paramIndex}`;
    bind.push(`%${search.trim()}%`);
    paramIndex++;
  }
  if (cursor) {
    const [cursorTs, cursorId] = cursor.split("_");
    if (cursorTs && cursorId) {
      whereClause += ` AND (f.created_at, f.id) < ($${paramIndex}::timestamptz, $${paramIndex + 1}::uuid)`;
      bind.push(cursorTs, cursorId);
      paramIndex += 2;
    }
  }
  bind.push(limitNum + 1);
  const rows = await sequelize.query(
    `SELECT 
       u.id,
       u.username,
       COALESCE(o.image, u.image) as image,
       COALESCE(u.is_verified_email, false) as is_verified,
       to_char(f.created_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') as followed_at,
       f.id as follow_id
     FROM follows f
     INNER JOIN users u ON f.following_id = u.id
     LEFT JOIN onboarding o ON u.id = o.user_id AND o.deleted_at IS NULL
     WHERE ${whereClause}
     ORDER BY f.created_at DESC, f.id DESC
     LIMIT $${paramIndex}`,
    { bind, type: QueryTypes.SELECT }
  ) as Record<string, unknown>[];
  const hasMore = rows.length > limitNum;
  const slice = hasMore ? rows.slice(0, limitNum) : rows;

  const users: FollowedUser[] = slice.map((r) => {
    const row = r as Record<string, unknown>;
    let followedAt: string | null = null;
    const raw = row.followed_at ?? row.created_at;
    if (raw != null && String(raw).trim() !== "") {
      followedAt = typeof raw === "string" ? raw : new Date(raw as Date).toISOString();
    }
    return {
      id: String(row.id),
      username: String(row.username),
      image: row.image != null ? String(row.image) : "",
      is_verified: Boolean(row.is_verified),
      followed_at: followedAt,
    };
  });
  const last = slice[slice.length - 1] as Record<string, unknown> | undefined;
  const lastRaw = last ? (last.followed_at ?? last.created_at) : null;
  const lastDate =
    lastRaw != null && String(lastRaw).trim() !== ""
      ? typeof lastRaw === "string"
        ? lastRaw
        : new Date(lastRaw as Date).toISOString()
      : null;
  const nextCursor =
    hasMore && last && lastDate ? `${lastDate}_${last.follow_id}` : null;
  return { users, nextCursor, hasMore };
};

/** Users who follow me (my followers). Cursor-based pagination for infinite scroll. Optional search by username. */
export const getFollowersPaginatedService = async (
  userId: string,
  limit = 10,
  cursor?: string | null,
  search?: string | null
): Promise<FollowersFollowingPageResult> => {
  const limitNum = Math.min(Math.max(1, limit), 50);
  let whereClause = "f.following_id = $1 AND f.deleted_at IS NULL AND u.deleted_at IS NULL";
  const bind: (string | number)[] = [userId];
  let paramIndex = 2;
  if (search && search.trim()) {
    whereClause += ` AND u.username ILIKE $${paramIndex}`;
    bind.push(`%${search.trim()}%`);
    paramIndex++;
  }
  if (cursor) {
    const [cursorTs, cursorId] = cursor.split("_");
    if (cursorTs && cursorId) {
      whereClause += ` AND (f.created_at, f.id) < ($${paramIndex}::timestamptz, $${paramIndex + 1}::uuid)`;
      bind.push(cursorTs, cursorId);
      paramIndex += 2;
    }
  }
  bind.push(limitNum + 1);
  const rows = await sequelize.query(
    `SELECT 
       u.id,
       u.username,
       COALESCE(o.image, u.image) as image,
       COALESCE(u.is_verified_email, false) as is_verified,
       to_char(f.created_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') as followed_at,
       f.id as follow_id
     FROM follows f
     INNER JOIN users u ON f.follower_id = u.id
     LEFT JOIN onboarding o ON u.id = o.user_id AND o.deleted_at IS NULL
     WHERE ${whereClause}
     ORDER BY f.created_at DESC, f.id DESC
     LIMIT $${paramIndex}`,
    { bind, type: QueryTypes.SELECT }
  ) as Record<string, unknown>[];
  const hasMore = rows.length > limitNum;
  const slice = hasMore ? rows.slice(0, limitNum) : rows;

  const users: FollowedUser[] = slice.map((r) => {
    const row = r as Record<string, unknown>;
    let followedAt: string | null = null;
    const raw = row.followed_at ?? row.created_at;
    if (raw != null && String(raw).trim() !== "") {
      followedAt = typeof raw === "string" ? raw : new Date(raw as Date).toISOString();
    }
    return {
      id: String(row.id),
      username: String(row.username),
      image: row.image != null ? String(row.image) : "",
      is_verified: Boolean(row.is_verified),
      followed_at: followedAt,
    };
  });
  const last = slice[slice.length - 1] as Record<string, unknown> | undefined;
  const lastRaw = last ? (last.followed_at ?? last.created_at) : null;
  const lastDate =
    lastRaw != null && String(lastRaw).trim() !== ""
      ? typeof lastRaw === "string"
        ? lastRaw
        : new Date(lastRaw as Date).toISOString()
      : null;
  const nextCursor =
    hasMore && last && lastDate ? `${lastDate}_${last.follow_id}` : null;
  return { users, nextCursor, hasMore };
};

/** @deprecated Use getFollowedUsersPaginatedService. */
export const getFollowedUsersService = async (
  userId: string
): Promise<FollowedUser[]> => {
  const result = await getFollowedUsersPaginatedService(userId, 10);
  return result.users;
};

/** @deprecated Use getFollowersPaginatedService. */
export const getFollowersService = async (
  userId: string,
  limit = 10
): Promise<FollowedUser[]> => {
  const result = await getFollowersPaginatedService(userId, limit);
  return result.users;
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

/** Check if current user and target user are mutual followers (friends). */
export const isFriendService = async (
  userId: string,
  targetUserId: string
): Promise<boolean> => {
  const [row] = await sequelize.query(
    `SELECT 1
     FROM follows a
     INNER JOIN follows b
       ON a.follower_id = b.following_id AND a.following_id = b.follower_id
     WHERE a.follower_id = $1 AND a.following_id = $2
       AND a.deleted_at IS NULL AND b.deleted_at IS NULL
     LIMIT 1`,
    { bind: [userId, targetUserId], type: QueryTypes.SELECT }
  ) as any[];

  return !!row;
};

