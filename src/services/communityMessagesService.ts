import { QueryTypes } from "sequelize";
import sequelize from "database";
import { assertPremiumUser } from "@/services/subscriptionService";

export interface CommunityChatSummary {
  community_id: string;
  name: string;
  image: string | null;
  member_count: number;
  last_message: string | null;
  last_message_at: Date | null;
  unread_count: number;
}

export interface CommunityChatMessage {
  id: string;
  community_id: string;
  sender_id: string;
  content: string;
  created_at: Date;
  updated_at: Date;
  is_read: boolean;
  sender: {
    id: string;
    username: string;
    image: string | null;
  };
}

export interface CommunityMessagesPage {
  messages: CommunityChatMessage[];
  hasMore: boolean;
  nextCursor?: string;
}

const ensureCommunityMember = async (userId: string, communityId: string): Promise<void> => {
  const rows = await sequelize.query(
    `SELECT 1
     FROM community_members
     WHERE community_id = $1 AND user_id = $2 AND deleted_at IS NULL
     LIMIT 1`,
    { bind: [communityId, userId], type: QueryTypes.SELECT }
  );
  if (!Array.isArray(rows) || rows.length === 0) {
    throw { statusCode: 403, message: "Only community members can access this chat" };
  }
};

export const listCommunityChatsService = async (
  userId: string,
  search?: string
): Promise<CommunityChatSummary[]> => {
  await assertPremiumUser(userId);
  const bind: (string | null)[] = [userId];
  let where = "";
  if (search?.trim()) {
    bind.push(`%${search.trim()}%`);
    where = " AND c.name ILIKE $2";
  }

  const rows = await sequelize.query(
    `SELECT
       c.id AS community_id,
       c.name,
       c.image,
       COALESCE(member_counts.member_count, 0)::INTEGER AS member_count,
       lm.content AS last_message,
       lm.created_at AS last_message_at,
       COALESCE(unread_counts.unread_count, 0)::INTEGER AS unread_count
     FROM community_members cm
     INNER JOIN communities c ON c.id = cm.community_id AND c.deleted_at IS NULL
     LEFT JOIN (
       SELECT community_id, COUNT(*)::INTEGER AS member_count
       FROM community_members
       WHERE deleted_at IS NULL
       GROUP BY community_id
     ) member_counts ON member_counts.community_id = c.id
     LEFT JOIN LATERAL (
       SELECT m.content, m.created_at
       FROM community_messages m
       WHERE m.community_id = c.id AND m.deleted_at IS NULL
       ORDER BY m.created_at DESC
       LIMIT 1
     ) lm ON TRUE
     LEFT JOIN LATERAL (
       SELECT COUNT(*)::INTEGER AS unread_count
       FROM community_messages m
       LEFT JOIN community_message_reads r
         ON r.message_id = m.id AND r.user_id = $1
       WHERE m.community_id = c.id
         AND m.deleted_at IS NULL
         AND m.sender_id <> $1
         AND r.id IS NULL
     ) unread_counts ON TRUE
     WHERE cm.user_id = $1 AND cm.deleted_at IS NULL${where}
     ORDER BY lm.created_at DESC NULLS LAST, cm.joined_at DESC`,
    { bind, type: QueryTypes.SELECT }
  ) as Array<Record<string, unknown>>;

  return rows.map((row) => ({
    community_id: String(row.community_id),
    name: String(row.name || ""),
    image: (row.image as string | null) ?? null,
    member_count: Number(row.member_count || 0),
    last_message: (row.last_message as string | null) ?? null,
    last_message_at: (row.last_message_at as Date | null) ?? null,
    unread_count: Number(row.unread_count || 0),
  }));
};

export const getCommunityMessageByIdService = async (
  messageId: string,
  currentUserId: string
): Promise<CommunityChatMessage> => {
  await assertPremiumUser(currentUserId);
  const rows = await sequelize.query(
    `SELECT
       m.id,
       m.community_id,
       m.sender_id,
       m.content,
       m.created_at,
       m.updated_at,
       CASE WHEN r.id IS NOT NULL THEN true ELSE false END AS is_read,
       u.id AS user_id,
       u.username,
       COALESCE(o.image, u.image) AS user_image
     FROM community_messages m
     INNER JOIN users u ON u.id = m.sender_id
     LEFT JOIN onboarding o ON o.user_id = u.id AND o.deleted_at IS NULL
     LEFT JOIN community_message_reads r
       ON r.message_id = m.id AND r.user_id = $2
     WHERE m.id = $1 AND m.deleted_at IS NULL
     LIMIT 1`,
    { bind: [messageId, currentUserId], type: QueryTypes.SELECT }
  ) as Array<Record<string, unknown>>;

  const row = rows[0];
  if (!row) throw { statusCode: 404, message: "Message not found" };

  return {
    id: String(row.id),
    community_id: String(row.community_id),
    sender_id: String(row.sender_id),
    content: String(row.content || ""),
    created_at: row.created_at as Date,
    updated_at: row.updated_at as Date,
    is_read: Boolean(row.is_read),
    sender: {
      id: String(row.user_id),
      username: String(row.username || "User"),
      image: (row.user_image as string | null) ?? null,
    },
  };
};

export const sendCommunityMessageService = async (
  userId: string,
  communityId: string,
  content: string
): Promise<CommunityChatMessage> => {
  await assertPremiumUser(userId);
  await ensureCommunityMember(userId, communityId);

  const rows = await sequelize.query(
    `INSERT INTO community_messages (community_id, sender_id, content, created_at, updated_at)
     VALUES ($1, $2, $3, NOW(), NOW())
     RETURNING id`,
    { bind: [communityId, userId, content.trim()], type: QueryTypes.SELECT }
  ) as Array<{ id: string }>;

  if (!rows[0]?.id) {
    throw { statusCode: 500, message: "Failed to send community message" };
  }

  return getCommunityMessageByIdService(rows[0].id, userId);
};

export const getCommunityMessagesService = async (
  userId: string,
  communityId: string,
  limit: number = 20,
  cursor?: string
): Promise<CommunityMessagesPage> => {
  await assertPremiumUser(userId);
  await ensureCommunityMember(userId, communityId);

  const limitVal = Math.min(Math.max(1, limit), 50);
  const bind: (string | number)[] = [communityId, userId, limitVal + 1];
  let cursorFilter = "";
  if (cursor) {
    bind.push(cursor);
    cursorFilter = ` AND m.created_at < $4`;
  }

  const rows = await sequelize.query(
    `SELECT
       m.id,
       m.community_id,
       m.sender_id,
       m.content,
       m.created_at,
       m.updated_at,
       CASE WHEN r.id IS NOT NULL THEN true ELSE false END AS is_read,
       u.id AS user_id,
       u.username,
       COALESCE(o.image, u.image) AS user_image
     FROM community_messages m
     INNER JOIN users u ON u.id = m.sender_id
     LEFT JOIN onboarding o ON o.user_id = u.id AND o.deleted_at IS NULL
     LEFT JOIN community_message_reads r
       ON r.message_id = m.id AND r.user_id = $2
     WHERE m.community_id = $1 AND m.deleted_at IS NULL${cursorFilter}
     ORDER BY m.created_at DESC
     LIMIT $3`,
    { bind, type: QueryTypes.SELECT }
  ) as Array<Record<string, unknown>>;

  const hasMore = rows.length > limitVal;
  const pageRows = hasMore ? rows.slice(0, limitVal) : rows;
  const messages = pageRows
    .map((row) => ({
      id: String(row.id),
      community_id: String(row.community_id),
      sender_id: String(row.sender_id),
      content: String(row.content || ""),
      created_at: row.created_at as Date,
      updated_at: row.updated_at as Date,
      is_read: Boolean(row.is_read),
      sender: {
        id: String(row.user_id),
        username: String(row.username || "User"),
        image: (row.user_image as string | null) ?? null,
      },
    }))
    .reverse();

  const nextCursor = hasMore ? (pageRows[pageRows.length - 1]?.created_at as Date).toISOString() : undefined;

  return { messages, hasMore, nextCursor };
};

export const markCommunityMessagesAsReadService = async (
  userId: string,
  communityId: string
): Promise<{ count: number }> => {
  await assertPremiumUser(userId);
  await ensureCommunityMember(userId, communityId);

  const unreadRows = await sequelize.query(
    `SELECT m.id
     FROM community_messages m
     LEFT JOIN community_message_reads r
       ON r.message_id = m.id AND r.user_id = $1
     WHERE m.community_id = $2
       AND m.deleted_at IS NULL
       AND m.sender_id <> $1
       AND r.id IS NULL`,
    { bind: [userId, communityId], type: QueryTypes.SELECT }
  ) as Array<{ id: string }>;

  if (unreadRows.length === 0) return { count: 0 };

  for (const row of unreadRows) {
    await sequelize.query(
      `INSERT INTO community_message_reads (message_id, user_id, read_at)
       VALUES ($1, $2, NOW())
       ON CONFLICT (message_id, user_id) DO NOTHING`,
      { bind: [row.id, userId], type: QueryTypes.INSERT }
    );
  }

  return { count: unreadRows.length };
};


