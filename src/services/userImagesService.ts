import { QueryTypes } from "sequelize";
import sequelize from "database";

export type UserImageType = "profile" | "banner" | "gallery";

export interface UserImageRecord {
  id: string;
  user_id: string;
  type: string;
  image_url: string;
  is_primary: boolean;
  created_at: Date;
}

/** Get primary image URL for a user and type (profile or banner). Falls back to onboarding.image for profile if none. */
export const getPrimaryImageUrl = async (
  userId: string,
  type: "profile" | "banner"
): Promise<string | null> => {
  const rows = await sequelize.query(
    `SELECT image_url FROM user_images
     WHERE user_id = $1 AND type = $2 AND is_primary = true AND deleted_at IS NULL
     LIMIT 1`,
    { bind: [userId, type], type: QueryTypes.SELECT }
  ) as { image_url: string }[];

  if (rows.length > 0) return rows[0].image_url;
  if (type === "profile") {
    const onboardingRow = await sequelize.query(
      `SELECT image as image_url FROM onboarding WHERE user_id = $1 AND deleted_at IS NULL LIMIT 1`,
      { bind: [userId], type: QueryTypes.SELECT }
    ) as { image_url: string | null }[];
    if (onboardingRow.length > 0 && onboardingRow[0].image_url)
      return onboardingRow[0].image_url;
    const userRow = await sequelize.query(
      `SELECT image as image_url FROM users WHERE id = $1 AND deleted_at IS NULL LIMIT 1`,
      { bind: [userId], type: QueryTypes.SELECT }
    ) as { image_url: string | null }[];
    if (userRow.length > 0 && userRow[0].image_url) return userRow[0].image_url;
  }
  return null;
};

/** Add image and optionally set as primary (for profile/banner). Unsets other primary of same type. */
export const addUserImage = async (
  userId: string,
  type: UserImageType,
  imageUrl: string,
  isPrimary: boolean = false
): Promise<UserImageRecord> => {
  if ((type === "profile" || type === "banner") && isPrimary) {
    await sequelize.query(
      `UPDATE user_images SET is_primary = false, updated_at = NOW()
       WHERE user_id = $1 AND type = $2 AND deleted_at IS NULL`,
      { bind: [userId, type], type: QueryTypes.UPDATE }
    );
  }

  const rows = await sequelize.query(
    `INSERT INTO user_images (user_id, type, image_url, is_primary, created_at, updated_at)
     VALUES ($1, $2, $3, $4, NOW(), NOW())
     RETURNING id, user_id, type, image_url, is_primary, created_at, updated_at`,
    {
      bind: [userId, type, imageUrl, type === "gallery" ? false : isPrimary],
      type: QueryTypes.SELECT,
    }
  ) as UserImageRecord[];

  const row = rows?.[0];
  if (!row) throw { statusCode: 500, message: "Failed to insert user image" };
  return row;
};

/** List images for user, optionally by type. */
export const listUserImages = async (
  userId: string,
  type?: UserImageType
): Promise<UserImageRecord[]> => {
  const query =
    type == null
      ? `SELECT id, user_id, type, image_url, is_primary, created_at FROM user_images
         WHERE user_id = $1 AND deleted_at IS NULL ORDER BY is_primary DESC, created_at DESC`
      : `SELECT id, user_id, type, image_url, is_primary, created_at FROM user_images
         WHERE user_id = $1 AND type = $2 AND deleted_at IS NULL ORDER BY is_primary DESC, created_at DESC`;
  const bind = type == null ? [userId] : [userId, type];
  const rows = await sequelize.query(query, {
    bind,
    type: QueryTypes.SELECT,
  }) as UserImageRecord[];
  return rows;
};

export interface ListUserImagesPageResult {
  images: UserImageRecord[];
  nextCursor: string | null;
  hasMore: boolean;
}

/** List images with pagination (cursor = offset as string). For gallery use type=gallery, order by created_at DESC. */
export const listUserImagesPaginated = async (
  userId: string,
  type: UserImageType,
  limit: number,
  cursor?: string | null
): Promise<ListUserImagesPageResult> => {
  const limitNum = Math.min(Math.max(1, limit), 50);
  const offset = cursor != null ? parseInt(cursor, 10) : 0;
  const safeOffset = Number.isNaN(offset) || offset < 0 ? 0 : offset;

  const baseSql = `SELECT id, user_id, type, image_url, is_primary, created_at FROM user_images
    WHERE user_id = $1 AND type = $2 AND deleted_at IS NULL
    ORDER BY created_at DESC, id DESC`;
  const rows = await sequelize.query(
    `${baseSql} LIMIT ${limitNum + 1} OFFSET ${safeOffset}`,
    {
      bind: [userId, type],
      type: QueryTypes.SELECT,
    }
  ) as UserImageRecord[];

  const hasMore = rows.length > limitNum;
  const images = hasMore ? rows.slice(0, limitNum) : rows;
  const nextCursor = hasMore ? String(safeOffset + limitNum) : null;

  return { images, nextCursor, hasMore };
};

/** Set an existing image as primary for profile or banner. */
export const setPrimaryUserImage = async (
  userId: string,
  imageId: string,
  type: "profile" | "banner"
): Promise<void> => {
  await sequelize.query(
    `UPDATE user_images SET is_primary = false, updated_at = NOW()
     WHERE user_id = $1 AND type = $2 AND deleted_at IS NULL`,
    { bind: [userId, type], type: QueryTypes.UPDATE }
  );
  const [updated] = await sequelize.query(
    `UPDATE user_images SET is_primary = true, updated_at = NOW()
     WHERE id = $1 AND user_id = $2 AND type = $3 AND deleted_at IS NULL
     RETURNING id`,
    { bind: [imageId, userId, type], type: QueryTypes.UPDATE }
  );
  if (!updated) throw { statusCode: 404, message: "Image not found" };
};

