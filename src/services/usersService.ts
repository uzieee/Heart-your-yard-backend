import { QueryTypes } from "sequelize";
import sequelize from "database";
import { getPrimaryImageUrl } from "@/services/userImagesService";

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
  subscription_plan: "FREE" | "PREMIUM";
}

export const getUsersService = async (
  currentUserId: string,
  cursor?: string,
  limit: number = 10,
  search?: string
): Promise<UsersResponse> => {
  const limitValue = Math.min(limit, 50); // Max 50 per page
  const offset = cursor ? parseInt(cursor) : 0;
  
  // Build WHERE clause with optional search
  let whereClause = "u.id != $1 AND u.deleted_at IS NULL";
  const bindParams: (string | number)[] = [currentUserId];
  let paramIndex = 2;
  
  if (search && search.trim()) {
    whereClause += ` AND u.username ILIKE $${paramIndex}`;
    bindParams.push(`%${search.trim()}%`);
    paramIndex++;
  }

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
     WHERE ${whereClause}
     ORDER BY u.created_at DESC
     LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`,
    {
      bind: [...bindParams, limitValue + 1, offset],
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
       COALESCE(u.is_verified_email, false) as is_verified,
       u.subscription_plan
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

export interface ProfileHeaderData {
  username: string;
  profileImageUrl: string | null;
  bannerImageUrl: string | null;
  followersCount: number;
  followingCount: number;
  followerPreviewUrls: string[];
}

export const getProfileHeaderService = async (
  userId: string
): Promise<ProfileHeaderData> => {
  const [profileImageUrl, bannerImageUrl] = await Promise.all([
    getPrimaryImageUrl(userId, "profile"),
    getPrimaryImageUrl(userId, "banner"),
  ]);

  const [countsResult, userResult, followerResult] = await Promise.all([
    sequelize.query(
      `SELECT
         (SELECT COUNT(*) FROM follows WHERE following_id = $1 AND deleted_at IS NULL) as followers_count,
         (SELECT COUNT(*) FROM follows WHERE follower_id = $1 AND deleted_at IS NULL) as following_count`,
      { bind: [userId], type: QueryTypes.SELECT }
    ),
    sequelize.query(
      `SELECT username FROM users WHERE id = $1 AND deleted_at IS NULL LIMIT 1`,
      { bind: [userId], type: QueryTypes.SELECT }
    ),
    sequelize.query(
      `SELECT COALESCE(
         (SELECT ui.image_url FROM user_images ui WHERE ui.user_id = u.id AND ui.type = 'profile' AND ui.is_primary = true AND ui.deleted_at IS NULL LIMIT 1),
         o.image,
         u.image
       ) as img
       FROM follows f
       INNER JOIN users u ON f.follower_id = u.id AND u.deleted_at IS NULL
       LEFT JOIN onboarding o ON u.id = o.user_id AND o.deleted_at IS NULL
       WHERE f.following_id = $1 AND f.deleted_at IS NULL
       ORDER BY f.created_at DESC
       LIMIT 6`,
      { bind: [userId], type: QueryTypes.SELECT }
    ),
  ]);

  const countsRow = countsResult as { followers_count: string; following_count: string }[];
  const userRow = userResult as { username: string }[];
  const followerPreviews = followerResult as { img: string | null }[];

  const username = userRow?.[0]?.username ?? "";
  const followersCount = parseInt(countsRow?.[0]?.followers_count ?? "0", 10);
  const followingCount = parseInt(countsRow?.[0]?.following_count ?? "0", 10);
  const followerPreviewUrls = (followerPreviews ?? [])
    .map((r) => r.img)
    .filter((url): url is string => url != null && url !== "");

  return {
    username,
    profileImageUrl,
    bannerImageUrl,
    followersCount,
    followingCount,
    followerPreviewUrls,
  };
};

export interface ProfileAbout {
  gender: string | null;
  dateOfBirth: string | null;
  location: string | null;
  email: string;
  phone: string | null;
  joinDate: string;
}

export const getProfileAboutService = async (
  userId: string
): Promise<ProfileAbout> => {
  const rows = await sequelize.query(
    `SELECT 
       u.email,
       u.created_at,
       o.gender,
       o.date_of_birth,
       o.address,
       o.phone
     FROM users u
     LEFT JOIN onboarding o ON u.id = o.user_id AND o.deleted_at IS NULL
     WHERE u.id = $1 AND u.deleted_at IS NULL
     LIMIT 1`,
    { bind: [userId], type: QueryTypes.SELECT }
  ) as Record<string, unknown>[];

  if (!rows || rows.length === 0) {
    throw { statusCode: 404, message: "User not found" };
  }

  const r = rows[0];
  const createdAt = r.created_at as Date | string | null;
  const joinDate =
    createdAt != null
      ? `Joined ${new Date(createdAt).toLocaleDateString("en-GB", {
          day: "numeric",
          month: "short",
          year: "numeric",
        })}`
      : "—";

  const dob = r.date_of_birth as Date | string | null;
  const dateOfBirthRaw =
    dob != null ? new Date(dob).toISOString().slice(0, 10) : null;

  return {
    gender: (r.gender as string) ?? null,
    dateOfBirth: dateOfBirthRaw,
    location: (r.address as string) ?? null,
    email: (r.email as string) ?? "",
    phone: (r.phone as string) ?? null,
    joinDate,
  };
};

export const updateProfileAboutService = async (
  userId: string,
  data: {
    gender?: string | null;
    dateOfBirth?: string | null;
    location?: string | null;
    email?: string | null;
    phone?: string | null;
  }
): Promise<void> => {
  const { gender, location, email, phone } = data;
  let dateOfBirth: Date | null | undefined;
  if (data.dateOfBirth !== undefined) {
    const s = data.dateOfBirth?.trim();
    dateOfBirth = s ? new Date(s) : null;
  }

  if (email !== undefined && email != null && String(email).trim() !== "") {
    await sequelize.query(
      `UPDATE users SET email = $1, updated_at = NOW() WHERE id = $2 AND deleted_at IS NULL`,
      { bind: [String(email).trim(), userId], type: QueryTypes.UPDATE }
    );
  }

  const existing = await sequelize.query(
    `SELECT id FROM onboarding WHERE user_id = $1 AND deleted_at IS NULL LIMIT 1`,
    { bind: [userId], type: QueryTypes.SELECT }
  ) as { id: string }[];

  if (existing.length > 0) {
    const sets: string[] = [];
    const vals: unknown[] = [];
    let n = 1;
    if (gender !== undefined) {
      sets.push(`gender = $${n++}`);
      vals.push(gender || null);
    }
    if (dateOfBirth !== undefined) {
      sets.push(`date_of_birth = $${n++}`);
      vals.push(dateOfBirth);
    }
    if (location !== undefined) {
      sets.push(`address = $${n++}`);
      vals.push(location || null);
    }
    if (phone !== undefined) {
      sets.push(`phone = $${n++}`);
      vals.push(phone || null);
    }
    if (sets.length > 0) {
      sets.push("updated_at = NOW()");
      vals.push(userId);
      await sequelize.query(
        `UPDATE onboarding SET ${sets.join(", ")} WHERE user_id = $${n}`,
        { bind: vals, type: QueryTypes.UPDATE }
      );
    }
  } else {
    await sequelize.query(
      `INSERT INTO onboarding (user_id, gender, date_of_birth, address, phone, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, NOW(), NOW())`,
      {
        bind: [
          userId,
          gender || null,
          dateOfBirth ?? null,
          location || null,
          phone || null,
        ],
        type: QueryTypes.INSERT,
      }
    );
  }
};

