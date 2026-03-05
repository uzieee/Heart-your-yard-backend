import { QueryTypes, Transaction } from "sequelize";
import sequelize from "database";

export interface PostTag {
  id: string;
  name: string;
}

export interface TrendingTagItem {
  id: string;
  name: string;
  posts_count: number;
}

export interface TrendingTagsPage {
  tags: TrendingTagItem[];
  hasMore: boolean;
  nextCursor: string | null;
}

export const extractHashtags = (text?: string | null): string[] => {
  if (!text) return [];
  const regex = /(^|\s)#([a-zA-Z0-9_]{1,50})\b/g;
  const set = new Set<string>();
  let match: RegExpExecArray | null;
  while ((match = regex.exec(text)) !== null) {
    const raw = (match[2] || "").trim().toLowerCase();
    if (raw) set.add(raw);
  }
  return Array.from(set);
};

export const syncPostTags = async (
  postId: string,
  description?: string | null,
  transaction?: Transaction
): Promise<void> => {
  const tags = extractHashtags(description);

  await sequelize.query(
    `UPDATE post_tags SET deleted_at = NOW(), updated_at = NOW()
     WHERE post_id = $1 AND deleted_at IS NULL`,
    {
      bind: [postId],
      type: QueryTypes.UPDATE,
      transaction,
    }
  );

  if (!tags.length) return;

  for (const name of tags) {
    const inserted = (await sequelize.query(
      `INSERT INTO tags (name, created_at, updated_at)
       VALUES ($1, NOW(), NOW())
       ON CONFLICT (name) DO UPDATE SET updated_at = NOW()
       RETURNING id`,
      {
        bind: [name],
        type: QueryTypes.SELECT,
        transaction,
      }
    )) as Array<{ id: string }>;

    const tagId = inserted[0]?.id;
    if (!tagId) continue;

    await sequelize.query(
      `INSERT INTO post_tags (post_id, tag_id, created_at, updated_at)
       VALUES ($1, $2, NOW(), NOW())
       ON CONFLICT (post_id, tag_id)
       DO UPDATE SET deleted_at = NULL, updated_at = NOW()`,
      {
        bind: [postId, tagId],
        type: QueryTypes.INSERT,
        transaction,
      }
    );
  }
};

export const getPostTagsByPostIds = async (
  postIds: string[]
): Promise<Map<string, PostTag[]>> => {
  const map = new Map<string, PostTag[]>();
  if (!postIds.length) return map;

  const rows = (await sequelize.query(
    `SELECT pt.post_id, t.id, t.name
     FROM post_tags pt
     INNER JOIN tags t ON pt.tag_id = t.id
     WHERE pt.post_id = ANY($1) AND pt.deleted_at IS NULL AND t.deleted_at IS NULL
     ORDER BY t.name ASC`,
    {
      bind: [postIds],
      type: QueryTypes.SELECT,
    }
  )) as Array<{ post_id: string; id: string; name: string }>;

  rows.forEach((row) => {
    if (!map.has(row.post_id)) map.set(row.post_id, []);
    map.get(row.post_id)!.push({ id: row.id, name: row.name });
  });

  return map;
};

export const listTrendingTags = async (
  limit: number = 10,
  cursor?: string | null
): Promise<TrendingTagsPage> => {
  const limitNum = Math.min(Math.max(1, limit), 50);
  const offset = cursor != null ? parseInt(cursor, 10) : 0;
  const safeOffset = Number.isNaN(offset) || offset < 0 ? 0 : offset;

  const rows = (await sequelize.query(
    `SELECT
      t.id,
      t.name,
      COUNT(DISTINCT pt.post_id)::INTEGER AS posts_count
     FROM tags t
     INNER JOIN post_tags pt ON pt.tag_id = t.id AND pt.deleted_at IS NULL
     INNER JOIN posts p ON p.id = pt.post_id AND p.deleted_at IS NULL
     WHERE t.deleted_at IS NULL
     GROUP BY t.id, t.name
     ORDER BY posts_count DESC, t.name ASC
     LIMIT ${limitNum + 1} OFFSET ${safeOffset}`,
    {
      type: QueryTypes.SELECT,
    }
  )) as TrendingTagItem[];

  const hasMore = rows.length > limitNum;
  const tags = hasMore ? rows.slice(0, limitNum) : rows;
  const nextCursor = hasMore ? String(safeOffset + limitNum) : null;

  return { tags, hasMore, nextCursor };
};

