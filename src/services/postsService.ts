import { QueryTypes } from "sequelize";
import sequelize from "database";
import { getPostTagsByPostIds, syncPostTags, type PostTag } from "@/services/tagsService";

export interface PostMedia {
  id: string;
  post_id: string;
  media_type: "IMAGE" | "VIDEO";
  media_url: string;
  created_at: Date;
}

export interface Post {
  id: string;
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
  media: PostMedia[];
  tags: PostTag[];
  likes_count: number;
  dislikes_count: number;
  comments_count: number;
  is_liked: boolean;
  is_disliked: boolean;
}

export interface PostsResponse {
  posts: Post[];
  hasMore: boolean;
  nextCursor?: string;
}

export interface CreatePostPayload {
  userId: string;
  description?: string;
  location?: string;
  locationCoordinates?: { lat: number; lng: number };
  plantingScheduleDate?: Date;
  media?: Array<{
    mediaType: "IMAGE" | "VIDEO";
    mediaUrl: string;
  }>;
}

export const createPostService = async (
  payload: CreatePostPayload
): Promise<Post> => {
  const {
    userId,
    description,
    location,
    locationCoordinates,
    plantingScheduleDate,
    media = [],
  } = payload;

  // Start transaction
  const transaction = await sequelize.transaction();

  try {
    // Insert post
    const postResult = await sequelize.query(
      `INSERT INTO posts (user_id, description, location, location_coordinates, planting_schedule_date, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, NOW(), NOW())
       RETURNING *`,
      {
        bind: [
          userId,
          description || null,
          location || null,
          locationCoordinates ? JSON.stringify(locationCoordinates) : null,
          plantingScheduleDate || null,
        ],
        type: QueryTypes.SELECT,
        transaction,
      }
    );

    if (!Array.isArray(postResult) || postResult.length === 0) {
      throw new Error("Failed to create post");
    }

    const post = postResult[0] as any;
    const postId = post.id;

    // Insert media if provided
    if (media.length > 0) {
      for (const mediaItem of media) {
        await sequelize.query(
          `INSERT INTO post_media (post_id, media_type, media_url, created_at, updated_at)
           VALUES ($1, $2, $3, NOW(), NOW())`,
          {
            bind: [postId, mediaItem.mediaType, mediaItem.mediaUrl],
            type: QueryTypes.INSERT,
            transaction,
          }
        );
      }
    }

    await syncPostTags(postId, description || null, transaction);

    // Commit transaction
    await transaction.commit();

    // Fetch complete post with user and media
    const completePost = await getPostByIdService(postId, userId);

    return completePost;
  } catch (error) {
    await transaction.rollback();
    throw error;
  }
};

export const getPostByIdService = async (
  postId: string,
  currentUserId?: string
): Promise<Post> => {
  const posts = await sequelize.query(
    `SELECT 
       p.id,
       p.user_id,
       p.description,
       p.location,
       p.location_coordinates,
       p.planting_schedule_date,
       p.created_at,
       p.updated_at,
       u.id as user_id,
       u.username,
       u.email,
       o.image as user_image,
       COALESCE(u.is_verified_email, false) as is_verified,
       COALESCE(l.likes_count::INTEGER, 0) as likes_count,
       COALESCE(l.dislikes_count::INTEGER, 0) as dislikes_count,
       COALESCE(c.comments_count::INTEGER, 0) as comments_count,
       CASE WHEN pl.user_id IS NOT NULL AND pl.reaction_type = 'LIKE' THEN true ELSE false END as is_liked,
       CASE WHEN pl.user_id IS NOT NULL AND pl.reaction_type = 'DISLIKE' THEN true ELSE false END as is_disliked
     FROM posts p
     INNER JOIN users u ON p.user_id = u.id
     LEFT JOIN onboarding o ON u.id = o.user_id AND o.deleted_at IS NULL
     LEFT JOIN (
       SELECT post_id, 
              COUNT(*) FILTER (WHERE reaction_type = 'LIKE')::INTEGER as likes_count,
              COUNT(*) FILTER (WHERE reaction_type = 'DISLIKE')::INTEGER as dislikes_count
       FROM post_likes
       WHERE deleted_at IS NULL
       GROUP BY post_id
     ) l ON p.id = l.post_id
     LEFT JOIN (
       SELECT post_id, COUNT(*)::INTEGER as comments_count
       FROM comments
       WHERE deleted_at IS NULL
       GROUP BY post_id
     ) c ON p.id = c.post_id
     LEFT JOIN post_likes pl ON p.id = pl.post_id AND pl.user_id = $2 AND pl.deleted_at IS NULL
     WHERE p.id = $1 AND p.deleted_at IS NULL`,
    {
      bind: [postId, currentUserId || null],
      type: QueryTypes.SELECT,
    }
  );

  if (posts.length === 0) {
    throw new Error("Post not found");
  }

  const postData = posts[0] as any;

  // Fetch media
  const mediaResult = await sequelize.query(
    `SELECT id, post_id, media_type, media_url, created_at
     FROM post_media
     WHERE post_id = $1 AND deleted_at IS NULL
     ORDER BY created_at ASC`,
    {
      bind: [postId],
      type: QueryTypes.SELECT,
    }
  );

  const tagsMap = await getPostTagsByPostIds([postId]);

  return {
    id: postData.id,
    user_id: postData.user_id,
    description: postData.description,
    location: postData.location,
    location_coordinates: postData.location_coordinates
      ? (typeof postData.location_coordinates === 'string'
        ? JSON.parse(postData.location_coordinates)
        : postData.location_coordinates)
      : null,
    planting_schedule_date: postData.planting_schedule_date,
    created_at: postData.created_at,
    updated_at: postData.updated_at,
    user: {
      id: postData.user_id,
      username: postData.username,
      email: postData.email,
      image: postData.user_image,
      is_verified: postData.is_verified,
    },
    media: mediaResult as PostMedia[],
    tags: tagsMap.get(postId) || [],
    likes_count: postData.likes_count || 0,
    dislikes_count: postData.dislikes_count || 0,
    comments_count: postData.comments_count || 0,
    is_liked: postData.is_liked || false,
    is_disliked: postData.is_disliked || false,
  };
};

export const getPostsService = async (
  currentUserId: string,
  cursor?: string,
  limit: number = 10,
  authorUserId?: string,
  search?: string | null
): Promise<PostsResponse> => {
  const limitValue = Math.min(limit, 50); // Max 50 per page
  const offset = cursor ? parseInt(cursor) : 0;

  const conditions: string[] = ["p.deleted_at IS NULL"];
  const bindParams: (string | number)[] = [currentUserId, limitValue, offset];
  let paramIndex = 4;
  if (authorUserId) {
    conditions.push(`p.user_id = $${paramIndex}`);
    bindParams.push(authorUserId);
    paramIndex++;
  }
  if (search && search.trim()) {
    conditions.push(`(
      p.description ILIKE $${paramIndex}
      OR EXISTS (
        SELECT 1
        FROM post_tags pt
        INNER JOIN tags t ON t.id = pt.tag_id
        WHERE pt.post_id = p.id
          AND pt.deleted_at IS NULL
          AND t.deleted_at IS NULL
          AND t.name ILIKE $${paramIndex + 1}
      )
    )`);
    bindParams.push(`%${search.trim()}%`);
    const normalizedTag = search.trim().replace(/^#/, "");
    bindParams.push(`%${normalizedTag}%`);
    paramIndex++;
    paramIndex++;
  }
  const whereClause = "WHERE " + conditions.join(" AND ");

  // Get posts (all users or single user when authorUserId provided)
  const postsResult = await sequelize.query(
    `SELECT 
       p.id,
       p.user_id,
       p.description,
       p.location,
       p.location_coordinates,
       p.planting_schedule_date,
       p.created_at,
       p.updated_at,
       u.id as user_id,
       u.username,
       u.email,
       o.image as user_image,
       COALESCE(u.is_verified_email, false) as is_verified,
       COALESCE(l.likes_count::INTEGER, 0) as likes_count,
       COALESCE(dl.dislikes_count::INTEGER, 0) as dislikes_count,
       COALESCE(c.comments_count::INTEGER, 0) as comments_count,
       CASE WHEN pl.reaction_type = 'LIKE' THEN true ELSE false END as is_liked,
       CASE WHEN pl.reaction_type = 'DISLIKE' THEN true ELSE false END as is_disliked
     FROM posts p
     INNER JOIN users u ON p.user_id = u.id
     LEFT JOIN onboarding o ON u.id = o.user_id AND o.deleted_at IS NULL
     LEFT JOIN (
       SELECT post_id, COUNT(*)::INTEGER as likes_count
       FROM post_likes
       WHERE reaction_type = 'LIKE' AND deleted_at IS NULL
       GROUP BY post_id
     ) l ON p.id = l.post_id
     LEFT JOIN (
       SELECT post_id, COUNT(*)::INTEGER as dislikes_count
       FROM post_likes
       WHERE reaction_type = 'DISLIKE' AND deleted_at IS NULL
       GROUP BY post_id
     ) dl ON p.id = dl.post_id
     LEFT JOIN (
       SELECT post_id, COUNT(*)::INTEGER as comments_count
       FROM comments
       WHERE deleted_at IS NULL
       GROUP BY post_id
     ) c ON p.id = c.post_id
     LEFT JOIN post_likes pl ON p.id = pl.post_id AND pl.user_id = $1 AND pl.deleted_at IS NULL
     ${whereClause}
     ORDER BY p.created_at DESC
     LIMIT $2 OFFSET $3`,
    {
      bind: bindParams,
      type: QueryTypes.SELECT,
    }
  );

  const posts = postsResult as any[];

  // Fetch media for all posts
  const postIds = posts.map((p) => p.id);
  let mediaMap: Map<string, PostMedia[]> = new Map();

  if (postIds.length > 0) {
    const mediaResult = await sequelize.query(
      `SELECT id, post_id, media_type, media_url, created_at
       FROM post_media
       WHERE post_id = ANY($1) AND deleted_at IS NULL
       ORDER BY created_at ASC`,
      {
        bind: [postIds],
        type: QueryTypes.SELECT,
      }
    );

    const mediaArray = mediaResult as PostMedia[];
    mediaArray.forEach((media) => {
      if (!mediaMap.has(media.post_id)) {
        mediaMap.set(media.post_id, []);
      }
      mediaMap.get(media.post_id)!.push(media);
    });
  }

  const tagsMap = await getPostTagsByPostIds(postIds);

  // Format posts
  const formattedPosts: Post[] = posts.map((postData) => ({
    id: postData.id,
    user_id: postData.user_id,
    description: postData.description,
    location: postData.location,
    location_coordinates: postData.location_coordinates
      ? (typeof postData.location_coordinates === 'string'
        ? JSON.parse(postData.location_coordinates)
        : postData.location_coordinates)
      : null,
    planting_schedule_date: postData.planting_schedule_date,
    created_at: postData.created_at,
    updated_at: postData.updated_at,
    user: {
      id: postData.user_id,
      username: postData.username,
      email: postData.email,
      image: postData.user_image,
      is_verified: postData.is_verified,
    },
    media: mediaMap.get(postData.id) || [],
    tags: tagsMap.get(postData.id) || [],
    likes_count: postData.likes_count || 0,
    dislikes_count: postData.dislikes_count || 0,
    comments_count: postData.comments_count || 0,
    is_liked: postData.is_liked || false,
    is_disliked: postData.is_disliked || false,
  }));

  const hasMore = posts.length === limitValue;
  const nextCursor = hasMore ? String(offset + limitValue) : undefined;

  return {
    posts: formattedPosts,
    hasMore,
    nextCursor,
  };
};

