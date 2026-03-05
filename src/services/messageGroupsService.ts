import { QueryTypes } from "sequelize";
import sequelize from "database";
import { randomUUID } from "crypto";
import { assertPremiumUser } from "@/services/subscriptionService";

export interface MessageGroupSummary {
  group_id: string;
  name: string;
  description: string | null;
  members_count: number;
  last_message: string | null;
  last_message_at: Date | null;
  unread_count: number;
}

export interface MessageGroupMessage {
  id: string;
  group_id: string;
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

export interface MessageGroupMessagesPage {
  messages: MessageGroupMessage[];
  hasMore: boolean;
  nextCursor?: string;
}

const ensureGroupMember = async (userId: string, groupId: string): Promise<void> => {
  const rows = await sequelize.query(
    `SELECT 1
     FROM message_group_members
     WHERE group_id = $1 AND user_id = $2 AND deleted_at IS NULL
     LIMIT 1`,
    { bind: [groupId, userId], type: QueryTypes.SELECT }
  );
  if (!Array.isArray(rows) || rows.length === 0) {
    throw { statusCode: 403, message: "Only group members can access this group" };
  }
};

const ensureGroupAdmin = async (userId: string, groupId: string): Promise<void> => {
  const rows = await sequelize.query(
    `SELECT role
     FROM message_group_members
     WHERE group_id = $1 AND user_id = $2 AND deleted_at IS NULL
     LIMIT 1`,
    { bind: [groupId, userId], type: QueryTypes.SELECT }
  ) as Array<{ role: "ADMIN" | "MEMBER" }>;
  if (!rows[0] || rows[0].role !== "ADMIN") {
    throw { statusCode: 403, message: "Only group admins can add members" };
  }
};

export const createMessageGroupService = async (
  creatorId: string,
  payload: { name: string; description?: string | null; memberIds?: string[] }
): Promise<{ id: string; name: string; description: string | null }> => {
  await assertPremiumUser(creatorId);
  const trx = await sequelize.transaction();
  try {
    const groupRows = await sequelize.query(
      `INSERT INTO message_groups (id, name, description, created_by, created_at, updated_at)
       VALUES ($1, $2, $3, $4, NOW(), NOW())
       RETURNING id, name, description`,
      {
        bind: [randomUUID(), payload.name.trim(), payload.description?.trim() || null, creatorId],
        type: QueryTypes.SELECT,
        transaction: trx,
      }
    ) as Array<{ id: string; name: string; description: string | null }>;

    const group = groupRows[0];
    if (!group) throw { statusCode: 500, message: "Failed to create group" };

    await sequelize.query(
      `INSERT INTO message_group_members (id, group_id, user_id, role, joined_at, created_at, updated_at)
       VALUES ($1, $2, $3, 'ADMIN', NOW(), NOW(), NOW())`,
      { bind: [randomUUID(), group.id, creatorId], type: QueryTypes.INSERT, transaction: trx }
    );

    const uniqueMembers = Array.from(new Set(payload.memberIds || [])).filter((id) => id !== creatorId);
    for (const memberId of uniqueMembers) {
      await sequelize.query(
        `INSERT INTO message_group_members (id, group_id, user_id, role, joined_at, created_at, updated_at)
         VALUES ($1, $2, $3, 'MEMBER', NOW(), NOW(), NOW())
         ON CONFLICT (group_id, user_id) DO NOTHING`,
        { bind: [randomUUID(), group.id, memberId], type: QueryTypes.INSERT, transaction: trx }
      );
    }

    await trx.commit();
    return group;
  } catch (error) {
    await trx.rollback();
    throw error;
  }
};

export const addMessageGroupMembersService = async (
  adminUserId: string,
  groupId: string,
  memberIds: string[]
): Promise<void> => {
  await assertPremiumUser(adminUserId);
  await ensureGroupAdmin(adminUserId, groupId);
  const uniqueMemberIds = Array.from(new Set(memberIds)).filter((id) => id !== adminUserId);
  for (const memberId of uniqueMemberIds) {
    await sequelize.query(
      `INSERT INTO message_group_members (id, group_id, user_id, role, joined_at, created_at, updated_at)
       VALUES ($1, $2, $3, 'MEMBER', NOW(), NOW(), NOW())
       ON CONFLICT (group_id, user_id) DO NOTHING`,
      { bind: [randomUUID(), groupId, memberId], type: QueryTypes.INSERT }
    );
  }
};

export const listMyMessageGroupsService = async (
  userId: string,
  search?: string
): Promise<MessageGroupSummary[]> => {
  await assertPremiumUser(userId);
  const bind: (string | null)[] = [userId];
  let whereSearch = "";
  if (search?.trim()) {
    bind.push(`%${search.trim()}%`);
    whereSearch = " AND g.name ILIKE $2";
  }

  const rows = await sequelize.query(
    `SELECT
       g.id AS group_id,
       g.name,
       g.description,
       COALESCE(member_counts.members_count, 0)::INTEGER AS members_count,
       lm.content AS last_message,
       lm.created_at AS last_message_at,
       COALESCE(unread_counts.unread_count, 0)::INTEGER AS unread_count
     FROM message_group_members gm
     INNER JOIN message_groups g ON g.id = gm.group_id AND g.deleted_at IS NULL
     LEFT JOIN (
       SELECT group_id, COUNT(*)::INTEGER AS members_count
       FROM message_group_members
       WHERE deleted_at IS NULL
       GROUP BY group_id
     ) member_counts ON member_counts.group_id = g.id
     LEFT JOIN LATERAL (
       SELECT m.content, m.created_at
       FROM message_group_messages m
       WHERE m.group_id = g.id AND m.deleted_at IS NULL
       ORDER BY m.created_at DESC
       LIMIT 1
     ) lm ON TRUE
     LEFT JOIN LATERAL (
       SELECT COUNT(*)::INTEGER AS unread_count
       FROM message_group_messages m
       LEFT JOIN message_group_message_reads mr
         ON mr.message_id = m.id AND mr.user_id = $1
       WHERE m.group_id = g.id
         AND m.deleted_at IS NULL
         AND m.sender_id <> $1
         AND mr.id IS NULL
     ) unread_counts ON TRUE
     WHERE gm.user_id = $1 AND gm.deleted_at IS NULL${whereSearch}
     ORDER BY lm.created_at DESC NULLS LAST, gm.joined_at DESC`,
    { bind, type: QueryTypes.SELECT }
  ) as Array<Record<string, unknown>>;

  return rows.map((row) => ({
    group_id: String(row.group_id),
    name: String(row.name || ""),
    description: (row.description as string | null) ?? null,
    members_count: Number(row.members_count || 0),
    last_message: (row.last_message as string | null) ?? null,
    last_message_at: (row.last_message_at as Date | null) ?? null,
    unread_count: Number(row.unread_count || 0),
  }));
};

export const getMessageGroupByIdService = async (
  userId: string,
  groupId: string
): Promise<{ id: string; name: string; description: string | null }> => {
  await assertPremiumUser(userId);
  await ensureGroupMember(userId, groupId);
  const rows = await sequelize.query(
    `SELECT id, name, description
     FROM message_groups
     WHERE id = $1 AND deleted_at IS NULL
     LIMIT 1`,
    { bind: [groupId], type: QueryTypes.SELECT }
  ) as Array<{ id: string; name: string; description: string | null }>;
  if (!rows[0]) throw { statusCode: 404, message: "Group not found" };
  return rows[0];
};

export const getMessageGroupMessagesService = async (
  userId: string,
  groupId: string,
  limit: number = 20,
  cursor?: string
): Promise<MessageGroupMessagesPage> => {
  await assertPremiumUser(userId);
  await ensureGroupMember(userId, groupId);
  const limitVal = Math.min(Math.max(1, limit), 50);

  const bind: (string | number)[] = [groupId, userId, limitVal + 1];
  let cursorSql = "";
  if (cursor) {
    bind.push(cursor);
    cursorSql = ` AND m.created_at < $4`;
  }

  const rows = await sequelize.query(
    `SELECT
       m.id,
       m.group_id,
       m.sender_id,
       m.content,
       m.created_at,
       m.updated_at,
       CASE WHEN mr.id IS NOT NULL THEN true ELSE false END AS is_read,
       u.id AS user_id,
       u.username,
       COALESCE(o.image, u.image) AS user_image
     FROM message_group_messages m
     INNER JOIN users u ON u.id = m.sender_id
     LEFT JOIN onboarding o ON o.user_id = u.id AND o.deleted_at IS NULL
     LEFT JOIN message_group_message_reads mr
       ON mr.message_id = m.id AND mr.user_id = $2
     WHERE m.group_id = $1 AND m.deleted_at IS NULL${cursorSql}
     ORDER BY m.created_at DESC
     LIMIT $3`,
    { bind, type: QueryTypes.SELECT }
  ) as Array<Record<string, unknown>>;

  const hasMore = rows.length > limitVal;
  const pageRows = hasMore ? rows.slice(0, limitVal) : rows;
  const messages = pageRows
    .map((row) => ({
      id: String(row.id),
      group_id: String(row.group_id),
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

export const sendMessageGroupMessageService = async (
  userId: string,
  groupId: string,
  content: string
): Promise<MessageGroupMessage> => {
  await assertPremiumUser(userId);
  await ensureGroupMember(userId, groupId);
  const inserted = await sequelize.query(
    `INSERT INTO message_group_messages (id, group_id, sender_id, content, created_at, updated_at)
     VALUES ($1, $2, $3, $4, NOW(), NOW())
     RETURNING id`,
    { bind: [randomUUID(), groupId, userId, content.trim()], type: QueryTypes.SELECT }
  ) as Array<{ id: string }>;

  if (!inserted[0]?.id) throw { statusCode: 500, message: "Failed to send group message" };

  const rows = await sequelize.query(
    `SELECT
       m.id,
       m.group_id,
       m.sender_id,
       m.content,
       m.created_at,
       m.updated_at,
       true AS is_read,
       u.id AS user_id,
       u.username,
       COALESCE(o.image, u.image) AS user_image
     FROM message_group_messages m
     INNER JOIN users u ON u.id = m.sender_id
     LEFT JOIN onboarding o ON o.user_id = u.id AND o.deleted_at IS NULL
     WHERE m.id = $1
     LIMIT 1`,
    { bind: [inserted[0].id], type: QueryTypes.SELECT }
  ) as Array<Record<string, unknown>>;

  const row = rows[0];
  if (!row) throw { statusCode: 404, message: "Message not found" };
  return {
    id: String(row.id),
    group_id: String(row.group_id),
    sender_id: String(row.sender_id),
    content: String(row.content || ""),
    created_at: row.created_at as Date,
    updated_at: row.updated_at as Date,
    is_read: true,
    sender: {
      id: String(row.user_id),
      username: String(row.username || "User"),
      image: (row.user_image as string | null) ?? null,
    },
  };
};

export const markMessageGroupMessagesReadService = async (
  userId: string,
  groupId: string
): Promise<{ count: number }> => {
  await assertPremiumUser(userId);
  await ensureGroupMember(userId, groupId);
  const rows = await sequelize.query(
    `SELECT m.id
     FROM message_group_messages m
     LEFT JOIN message_group_message_reads mr
       ON mr.message_id = m.id AND mr.user_id = $1
     WHERE m.group_id = $2
       AND m.deleted_at IS NULL
       AND m.sender_id <> $1
       AND mr.id IS NULL`,
    { bind: [userId, groupId], type: QueryTypes.SELECT }
  ) as Array<{ id: string }>;

  if (rows.length === 0) return { count: 0 };

  for (const row of rows) {
    await sequelize.query(
      `INSERT INTO message_group_message_reads (id, message_id, user_id, read_at)
       VALUES ($1, $2, $3, NOW())
       ON CONFLICT (message_id, user_id) DO NOTHING`,
      { bind: [randomUUID(), row.id, userId], type: QueryTypes.INSERT }
    );
  }

  return { count: rows.length };
};


