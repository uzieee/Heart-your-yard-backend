import { QueryTypes } from "sequelize";
import sequelize from "database";

export interface CommunityPostMedia {
  id: string;
  community_post_id: string;
  media_type: "IMAGE" | "VIDEO";
  media_url: string;
  created_at: Date;
}

export interface CommunityPost {
  id: string;
  community_id: string;
  user_id: string;
  description: string | null;
  location: string | null;
  location_coordinates: { lat: number; lng: number } | null;
  planting_schedule_date: Date | null;
  created_at: Date;
  updated_at: Date;
  user: {
    id: string;
    username: string;
    email: string;
    image: string | null;
    is_verified: boolean;
  };
  media: CommunityPostMedia[];
  likes_count: number;
  dislikes_count: number;
  comments_count: number;
  is_liked: boolean;
  is_disliked: boolean;
}

export interface CommunityPostsResponse {
  posts: CommunityPost[];
  hasMore: boolean;
  nextCursor?: string;
}

export interface CreateCommunityPostPayload {
  userId: string;
  communityId: string;
  description?: string;
  location?: string;
  locationCoordinates?: { lat: number; lng: number };
  plantingScheduleDate?: Date;
  media?: Array<{ mediaType: "IMAGE" | "VIDEO"; mediaUrl: string }>;
}

export async function ensureMember(userId: string, communityId: string): Promise<void> {
  const rows = await sequelize.query(
    `SELECT 1 FROM community_members WHERE community_id = $1 AND user_id = $2 AND deleted_at IS NULL LIMIT 1`,
    { bind: [communityId, userId], type: QueryTypes.SELECT }
  );
  if (!Array.isArray(rows) || rows.length === 0) {
    throw { statusCode: 403, message: "Only community members can perform this action" };
  }
}

/** Ensure community post exists and belongs to the given community. */
export async function ensureCommunityPostInCommunity(
  postId: string,
  communityId: string
): Promise<void> {
  const rows = await sequelize.query(
    `SELECT 1 FROM community_posts WHERE id = $1 AND community_id = $2 AND deleted_at IS NULL LIMIT 1`,
    { bind: [postId, communityId], type: QueryTypes.SELECT }
  );
  if (!Array.isArray(rows) || rows.length === 0) {
    throw { statusCode: 404, message: "Community post not found" };
  }
}

export async function createCommunityPostService(
  payload: CreateCommunityPostPayload
): Promise<CommunityPost> {
  const { userId, communityId, description, location, locationCoordinates, plantingScheduleDate, media = [] } = payload;

  await ensureMember(userId, communityId);

  const transaction = await sequelize.transaction();
  try {
    const [postResult] = await sequelize.query(
      `INSERT INTO community_posts (community_id, user_id, description, location, location_coordinates, planting_schedule_date, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, NOW(), NOW())
       RETURNING *`,
      {
        bind: [
          communityId,
          userId,
          description || null,
          location || null,
          locationCoordinates ? JSON.stringify(locationCoordinates) : null,
          plantingScheduleDate || null,
        ],
        type: QueryTypes.INSERT,
        transaction,
      }
    ) as any[];

    const row = Array.isArray(postResult) ? postResult[0] : postResult;
    if (!row) throw new Error("Failed to create community post");
    const postId = row.id;

    for (const m of media) {
      await sequelize.query(
        `INSERT INTO community_post_media (community_post_id, media_type, media_url, created_at, updated_at)
         VALUES ($1, $2, $3, NOW(), NOW())`,
        { bind: [postId, m.mediaType, m.mediaUrl], type: QueryTypes.INSERT, transaction }
      );
    }

    await transaction.commit();
    const full = await getCommunityPostByIdService(postId, userId);
    return full;
  } catch (e) {
    await transaction.rollback();
    throw e;
  }
}

export async function getCommunityPostByIdService(
  postId: string,
  currentUserId?: string
): Promise<CommunityPost> {
  const posts = await sequelize.query(
    `SELECT 
       cp.id, cp.community_id, cp.user_id, cp.description, cp.location, cp.location_coordinates,
       cp.planting_schedule_date, cp.created_at, cp.updated_at,
       u.id as u_id, u.username, u.email,
       COALESCE(o.image, u.image) as user_image,
       COALESCE(u.is_verified_email, false) as is_verified,
       COALESCE(l.likes_count::INTEGER, 0) as likes_count,
       COALESCE(dl.dislikes_count::INTEGER, 0) as dislikes_count,
       COALESCE(cc.cnt::INTEGER, 0) as comments_count,
       CASE WHEN pl.user_id IS NOT NULL AND pl.reaction_type = 'LIKE' THEN true ELSE false END as is_liked,
       CASE WHEN pl.user_id IS NOT NULL AND pl.reaction_type = 'DISLIKE' THEN true ELSE false END as is_disliked
     FROM community_posts cp
     INNER JOIN users u ON cp.user_id = u.id
     LEFT JOIN onboarding o ON u.id = o.user_id AND o.deleted_at IS NULL
     LEFT JOIN (SELECT community_post_id, COUNT(*) FILTER (WHERE reaction_type = 'LIKE')::INTEGER as likes_count
                FROM community_post_likes WHERE deleted_at IS NULL GROUP BY community_post_id) l ON cp.id = l.community_post_id
     LEFT JOIN (SELECT community_post_id, COUNT(*) FILTER (WHERE reaction_type = 'DISLIKE')::INTEGER as dislikes_count
                FROM community_post_likes WHERE deleted_at IS NULL GROUP BY community_post_id) dl ON cp.id = dl.community_post_id
     LEFT JOIN (SELECT community_post_id, COUNT(*)::INTEGER as cnt FROM community_post_comments WHERE deleted_at IS NULL GROUP BY community_post_id) cc ON cp.id = cc.community_post_id
     LEFT JOIN community_post_likes pl ON cp.id = pl.community_post_id AND pl.user_id = $2 AND pl.deleted_at IS NULL
     WHERE cp.id = $1 AND cp.deleted_at IS NULL`,
    { bind: [postId, currentUserId || null], type: QueryTypes.SELECT }
  );

  if (!Array.isArray(posts) || posts.length === 0) throw new Error("Community post not found");
  const p = posts[0] as any;

  const mediaResult = await sequelize.query(
    `SELECT id, community_post_id as post_id, media_type, media_url, created_at
     FROM community_post_media WHERE community_post_id = $1 AND deleted_at IS NULL ORDER BY created_at ASC`,
    { bind: [postId], type: QueryTypes.SELECT }
  );

  return {
    id: p.id,
    community_id: p.community_id,
    user_id: p.user_id,
    description: p.description,
    location: p.location,
    location_coordinates: p.location_coordinates
      ? (typeof p.location_coordinates === "string" ? JSON.parse(p.location_coordinates) : p.location_coordinates)
      : null,
    planting_schedule_date: p.planting_schedule_date,
    created_at: p.created_at,
    updated_at: p.updated_at,
    user: {
      id: p.u_id,
      username: p.username,
      email: p.email,
      image: p.user_image,
      is_verified: p.is_verified,
    },
    media: (mediaResult as any[]).map((m) => ({
      id: m.id,
      community_post_id: m.community_post_id,
      media_type: m.media_type,
      media_url: m.media_url,
      created_at: m.created_at,
    })),
    likes_count: p.likes_count || 0,
    dislikes_count: p.dislikes_count || 0,
    comments_count: p.comments_count || 0,
    is_liked: p.is_liked || false,
    is_disliked: p.is_disliked || false,
  };
}

export async function getCommunityPostsService(
  communityId: string,
  currentUserId: string,
  cursor?: string,
  limit: number = 10
): Promise<CommunityPostsResponse> {
  await ensureMember(currentUserId, communityId);

  const limitVal = Math.min(limit, 50);
  const parsedOffset = cursor ? parseInt(cursor, 10) : 0;
  const offset = Number.isNaN(parsedOffset) ? 0 : parsedOffset;

  const postsResult = await sequelize.query(
    `SELECT 
       cp.id, cp.community_id, cp.user_id, cp.description, cp.location, cp.location_coordinates,
       cp.planting_schedule_date, cp.created_at, cp.updated_at,
       u.id as u_id, u.username, u.email,
       COALESCE(o.image, u.image) as user_image,
       COALESCE(u.is_verified_email, false) as is_verified,
       COALESCE(l.likes_count::INTEGER, 0) as likes_count,
       COALESCE(dl.dislikes_count::INTEGER, 0) as dislikes_count,
       COALESCE(cc.cnt::INTEGER, 0) as comments_count,
       CASE WHEN pl.reaction_type = 'LIKE' THEN true ELSE false END as is_liked,
       CASE WHEN pl.reaction_type = 'DISLIKE' THEN true ELSE false END as is_disliked
     FROM community_posts cp
     INNER JOIN users u ON cp.user_id = u.id
     LEFT JOIN onboarding o ON u.id = o.user_id AND o.deleted_at IS NULL
     LEFT JOIN (SELECT community_post_id, COUNT(*) FILTER (WHERE reaction_type = 'LIKE')::INTEGER as likes_count
                FROM community_post_likes WHERE deleted_at IS NULL GROUP BY community_post_id) l ON cp.id = l.community_post_id
     LEFT JOIN (SELECT community_post_id, COUNT(*) FILTER (WHERE reaction_type = 'DISLIKE')::INTEGER as dislikes_count
                FROM community_post_likes WHERE deleted_at IS NULL GROUP BY community_post_id) dl ON cp.id = dl.community_post_id
     LEFT JOIN (SELECT community_post_id, COUNT(*)::INTEGER as cnt FROM community_post_comments WHERE deleted_at IS NULL GROUP BY community_post_id) cc ON cp.id = cc.community_post_id
     LEFT JOIN community_post_likes pl ON cp.id = pl.community_post_id AND pl.user_id = $1 AND pl.deleted_at IS NULL
     WHERE cp.community_id = $2 AND cp.deleted_at IS NULL
     ORDER BY cp.created_at DESC
     LIMIT $3 OFFSET $4`,
    { bind: [currentUserId, communityId, limitVal, offset], type: QueryTypes.SELECT }
  );

  const posts = (postsResult as any[]) || [];
  const postIds = posts.map((p) => p.id);
  let mediaMap: Map<string, CommunityPostMedia[]> = new Map();
  if (postIds.length > 0) {
    const mediaResult = await sequelize.query(
      `SELECT id, community_post_id, media_type, media_url, created_at
       FROM community_post_media WHERE community_post_id = ANY($1) AND deleted_at IS NULL ORDER BY created_at ASC`,
      { bind: [postIds], type: QueryTypes.SELECT }
    );
    (mediaResult as any[]).forEach((m) => {
      const list = mediaMap.get(m.community_post_id) || [];
      list.push({
        id: m.id,
        community_post_id: m.community_post_id,
        media_type: m.media_type,
        media_url: m.media_url,
        created_at: m.created_at,
      });
      mediaMap.set(m.community_post_id, list);
    });
  }

  const formatted: CommunityPost[] = posts.map((p) => ({
    id: p.id,
    community_id: p.community_id,
    user_id: p.user_id,
    description: p.description,
    location: p.location,
    location_coordinates: p.location_coordinates
      ? (typeof p.location_coordinates === "string" ? JSON.parse(p.location_coordinates) : p.location_coordinates)
      : null,
    planting_schedule_date: p.planting_schedule_date,
    created_at: p.created_at,
    updated_at: p.updated_at,
    user: {
      id: p.u_id,
      username: p.username,
      email: p.email,
      image: p.user_image,
      is_verified: p.is_verified,
    },
    media: mediaMap.get(p.id) || [],
    likes_count: p.likes_count || 0,
    dislikes_count: p.dislikes_count || 0,
    comments_count: p.comments_count || 0,
    is_liked: p.is_liked || false,
    is_disliked: p.is_disliked || false,
  }));

  return {
    posts: formatted,
    hasMore: posts.length === limitVal,
    nextCursor: posts.length === limitVal ? String(offset + limitVal) : undefined,
  };
}

/** Get feed of posts from all communities the user is a member of (for Communities Feed tab). */
export async function getCommunityFeedService(
  currentUserId: string,
  cursor?: string,
  limit: number = 10
): Promise<CommunityPostsResponse> {
  const limitVal = Math.min(limit, 50);
  const parsedOffset = cursor ? parseInt(cursor, 10) : 0;
  const offset = Number.isNaN(parsedOffset) ? 0 : parsedOffset;

  const postsResult = await sequelize.query(
    `SELECT 
       cp.id, cp.community_id, cp.user_id, cp.description, cp.location, cp.location_coordinates,
       cp.planting_schedule_date, cp.created_at, cp.updated_at,
       u.id as u_id, u.username, u.email,
       COALESCE(o.image, u.image) as user_image,
       COALESCE(u.is_verified_email, false) as is_verified,
       COALESCE(l.likes_count::INTEGER, 0) as likes_count,
       COALESCE(dl.dislikes_count::INTEGER, 0) as dislikes_count,
       COALESCE(cc.cnt::INTEGER, 0) as comments_count,
       CASE WHEN pl.reaction_type = 'LIKE' THEN true ELSE false END as is_liked,
       CASE WHEN pl.reaction_type = 'DISLIKE' THEN true ELSE false END as is_disliked
     FROM community_posts cp
     INNER JOIN community_members cm ON cm.community_id = cp.community_id AND cm.user_id = $1 AND cm.deleted_at IS NULL
     INNER JOIN users u ON cp.user_id = u.id
     LEFT JOIN onboarding o ON u.id = o.user_id AND o.deleted_at IS NULL
     LEFT JOIN (SELECT community_post_id, COUNT(*) FILTER (WHERE reaction_type = 'LIKE')::INTEGER as likes_count
                FROM community_post_likes WHERE deleted_at IS NULL GROUP BY community_post_id) l ON cp.id = l.community_post_id
     LEFT JOIN (SELECT community_post_id, COUNT(*) FILTER (WHERE reaction_type = 'DISLIKE')::INTEGER as dislikes_count
                FROM community_post_likes WHERE deleted_at IS NULL GROUP BY community_post_id) dl ON cp.id = dl.community_post_id
     LEFT JOIN (SELECT community_post_id, COUNT(*)::INTEGER as cnt FROM community_post_comments WHERE deleted_at IS NULL GROUP BY community_post_id) cc ON cp.id = cc.community_post_id
     LEFT JOIN community_post_likes pl ON cp.id = pl.community_post_id AND pl.user_id = $1 AND pl.deleted_at IS NULL
     WHERE cp.deleted_at IS NULL
     ORDER BY cp.created_at DESC
     LIMIT $2 OFFSET $3`,
    { bind: [currentUserId, limitVal, offset], type: QueryTypes.SELECT }
  );

  const posts = (postsResult as any[]) || [];
  const postIds = posts.map((p) => p.id);
  let mediaMap: Map<string, CommunityPostMedia[]> = new Map();
  if (postIds.length > 0) {
    const mediaResult = await sequelize.query(
      `SELECT id, community_post_id, media_type, media_url, created_at
       FROM community_post_media WHERE community_post_id = ANY($1) AND deleted_at IS NULL ORDER BY created_at ASC`,
      { bind: [postIds], type: QueryTypes.SELECT }
    );
    (mediaResult as any[]).forEach((m) => {
      const list = mediaMap.get(m.community_post_id) || [];
      list.push({
        id: m.id,
        community_post_id: m.community_post_id,
        media_type: m.media_type,
        media_url: m.media_url,
        created_at: m.created_at,
      });
      mediaMap.set(m.community_post_id, list);
    });
  }

  const formatted: CommunityPost[] = posts.map((p) => ({
    id: p.id,
    community_id: p.community_id,
    user_id: p.user_id,
    description: p.description,
    location: p.location,
    location_coordinates: p.location_coordinates
      ? (typeof p.location_coordinates === "string" ? JSON.parse(p.location_coordinates) : p.location_coordinates)
      : null,
    planting_schedule_date: p.planting_schedule_date,
    created_at: p.created_at,
    updated_at: p.updated_at,
    user: {
      id: p.u_id,
      username: p.username,
      email: p.email,
      image: p.user_image,
      is_verified: p.is_verified,
    },
    media: mediaMap.get(p.id) || [],
    likes_count: p.likes_count || 0,
    dislikes_count: p.dislikes_count || 0,
    comments_count: p.comments_count || 0,
    is_liked: p.is_liked || false,
    is_disliked: p.is_disliked || false,
  }));

  return {
    posts: formatted,
    hasMore: posts.length === limitVal,
    nextCursor: posts.length === limitVal ? String(offset + limitVal) : undefined,
  };
}

/** Public feed: latest posts from ALL communities. Optional currentUserId for is_liked/is_disliked. */
export async function getPublicCommunityFeedService(
  currentUserId: string | null,
  cursor?: string,
  limit: number = 10
): Promise<CommunityPostsResponse> {
  const limitVal = Math.min(limit, 50);
  const parsedOffset = cursor ? parseInt(cursor, 10) : 0;
  const offset = Number.isNaN(parsedOffset) ? 0 : parsedOffset;

  const postsResult = await sequelize.query(
    `SELECT 
       cp.id, cp.community_id, cp.user_id, cp.description, cp.location, cp.location_coordinates,
       cp.planting_schedule_date, cp.created_at, cp.updated_at,
       u.id as u_id, u.username, u.email,
       COALESCE(o.image, u.image) as user_image,
       COALESCE(u.is_verified_email, false) as is_verified,
       COALESCE(l.likes_count::INTEGER, 0) as likes_count,
       COALESCE(dl.dislikes_count::INTEGER, 0) as dislikes_count,
       COALESCE(cc.cnt::INTEGER, 0) as comments_count,
       CASE WHEN pl.reaction_type = 'LIKE' THEN true ELSE false END as is_liked,
       CASE WHEN pl.reaction_type = 'DISLIKE' THEN true ELSE false END as is_disliked
     FROM community_posts cp
     INNER JOIN users u ON cp.user_id = u.id
     LEFT JOIN onboarding o ON u.id = o.user_id AND o.deleted_at IS NULL
     LEFT JOIN (SELECT community_post_id, COUNT(*) FILTER (WHERE reaction_type = 'LIKE')::INTEGER as likes_count
                FROM community_post_likes WHERE deleted_at IS NULL GROUP BY community_post_id) l ON cp.id = l.community_post_id
     LEFT JOIN (SELECT community_post_id, COUNT(*) FILTER (WHERE reaction_type = 'DISLIKE')::INTEGER as dislikes_count
                FROM community_post_likes WHERE deleted_at IS NULL GROUP BY community_post_id) dl ON cp.id = dl.community_post_id
     LEFT JOIN (SELECT community_post_id, COUNT(*)::INTEGER as cnt FROM community_post_comments WHERE deleted_at IS NULL GROUP BY community_post_id) cc ON cp.id = cc.community_post_id
     LEFT JOIN community_post_likes pl ON cp.id = pl.community_post_id AND pl.user_id = $1 AND pl.deleted_at IS NULL
     WHERE cp.deleted_at IS NULL
     ORDER BY cp.created_at DESC
     LIMIT $2 OFFSET $3`,
    { bind: [currentUserId || null, limitVal, offset], type: QueryTypes.SELECT }
  );

  const posts = (postsResult as any[]) || [];
  const postIds = posts.map((p) => p.id);
  let mediaMap: Map<string, CommunityPostMedia[]> = new Map();
  if (postIds.length > 0) {
    const mediaResult = await sequelize.query(
      `SELECT id, community_post_id, media_type, media_url, created_at
       FROM community_post_media WHERE community_post_id = ANY($1) AND deleted_at IS NULL ORDER BY created_at ASC`,
      { bind: [postIds], type: QueryTypes.SELECT }
    );
    (mediaResult as any[]).forEach((m) => {
      const list = mediaMap.get(m.community_post_id) || [];
      list.push({
        id: m.id,
        community_post_id: m.community_post_id,
        media_type: m.media_type,
        media_url: m.media_url,
        created_at: m.created_at,
      });
      mediaMap.set(m.community_post_id, list);
    });
  }

  const formatted: CommunityPost[] = posts.map((p) => ({
    id: p.id,
    community_id: p.community_id,
    user_id: p.user_id,
    description: p.description,
    location: p.location,
    location_coordinates: p.location_coordinates
      ? (typeof p.location_coordinates === "string" ? JSON.parse(p.location_coordinates) : p.location_coordinates)
      : null,
    planting_schedule_date: p.planting_schedule_date,
    created_at: p.created_at,
    updated_at: p.updated_at,
    user: {
      id: p.u_id,
      username: p.username,
      email: p.email,
      image: p.user_image,
      is_verified: p.is_verified,
    },
    media: mediaMap.get(p.id) || [],
    likes_count: p.likes_count || 0,
    dislikes_count: p.dislikes_count || 0,
    comments_count: p.comments_count || 0,
    is_liked: p.is_liked || false,
    is_disliked: p.is_disliked || false,
  }));

  return {
    posts: formatted,
    hasMore: posts.length === limitVal,
    nextCursor: posts.length === limitVal ? String(offset + limitVal) : undefined,
  };
}
