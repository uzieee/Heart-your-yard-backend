import { QueryTypes, Op } from "sequelize";
import sequelize from "database";
import Message from "@/models/Message";
import MessageMedia from "@/models/MessageMedia";
import MessageRead from "@/models/MessageRead";
import { assertPremiumUser } from "@/services/subscriptionService";

export interface MessageWithMedia {
  id: string;
  sender_id: string;
  receiver_id: string;
  content: string | null;
  message_type: "text" | "image" | "video";
  created_at: Date;
  updated_at: Date;
  media?: {
    id: string;
    media_url: string;
    media_type: "image" | "video";
    file_name: string | null;
    file_size: number | null;
    mime_type: string | null;
  }[];
  is_read: boolean;
  read_at: Date | null;
  sender: {
    id: string;
    username: string;
    image: string | null;
  };
  receiver: {
    id: string;
    username: string;
    image: string | null;
  };
}

export interface SendMessagePayload {
  receiver_id: string;
  content?: string;
  message_type: "text" | "image" | "video";
  media?: {
    media_url: string;
    media_type: "image" | "video";
    file_name?: string;
    file_size?: number;
    mime_type?: string;
  }[];
}

export interface MessagesResponse {
  messages: MessageWithMedia[];
  nextCursor?: string;
  hasMore: boolean;
}

// Send a message
export const sendMessageService = async (
  senderId: string,
  payload: SendMessagePayload
): Promise<MessageWithMedia> => {
  await assertPremiumUser(senderId);
  // Verify that sender and receiver are friends
  const [friendship] = await sequelize.query(
    `SELECT id FROM friend_requests 
     WHERE status = 'ACCEPTED' 
     AND ((requester_id = :senderId AND receiver_id = :receiverId) 
          OR (requester_id = :receiverId AND receiver_id = :senderId))`,
    {
      replacements: { senderId, receiverId: payload.receiver_id },
      type: QueryTypes.SELECT,
    }
  );

  if (!friendship) {
    throw { statusCode: 403, message: "You can only message your friends" };
  }

  // Create message
  const message = await Message.create({
    sender_id: senderId,
    receiver_id: payload.receiver_id,
    content: payload.content || null,
    message_type: payload.message_type,
  });

  // Create media entries if provided
  if (payload.media && payload.media.length > 0) {
    await MessageMedia.bulkCreate(
      payload.media.map((media) => ({
        message_id: message.id,
        media_url: media.media_url,
        media_type: media.media_type,
        file_name: media.file_name || null,
        file_size: media.file_size || null,
        mime_type: media.mime_type || null,
      }))
    );
  }

  // Fetch the complete message with media and user info
  const completeMessage = await getMessageByIdService(message.id, senderId);

  return completeMessage;
};

// Get message by ID
export const getMessageByIdService = async (
  messageId: string,
  currentUserId: string
): Promise<MessageWithMedia> => {
  const query = `
    SELECT 
      m.id,
      m.sender_id,
      m.receiver_id,
      m.content,
      m.message_type,
      m.created_at,
      m.updated_at,
      s.id as sender_id_full,
      s.username as sender_username,
      s.image as sender_image,
      r.id as receiver_id_full,
      r.username as receiver_username,
      r.image as receiver_image,
      CASE WHEN mr.id IS NOT NULL THEN true ELSE false END as is_read,
      mr.read_at
    FROM messages m
    INNER JOIN users s ON m.sender_id = s.id
    INNER JOIN users r ON m.receiver_id = r.id
    LEFT JOIN message_reads mr ON m.id = mr.message_id AND mr.user_id = :currentUserId
    WHERE m.id = :messageId
  `;

  const [message] = await sequelize.query(query, {
    replacements: { messageId, currentUserId },
    type: QueryTypes.SELECT,
  }) as any[];

  if (!message) {
    throw { statusCode: 404, message: "Message not found" };
  }

  // Fetch media
  const media = await MessageMedia.findAll({
    where: { message_id: messageId },
    attributes: ["id", "media_url", "media_type", "file_name", "file_size", "mime_type"],
  });

  return {
    id: message.id,
    sender_id: message.sender_id,
    receiver_id: message.receiver_id,
    content: message.content,
    message_type: message.message_type,
    created_at: message.created_at,
    updated_at: message.updated_at,
    media: media.map((m) => ({
      id: m.id,
      media_url: m.media_url,
      media_type: m.media_type,
      file_name: m.file_name,
      file_size: m.file_size,
      mime_type: m.mime_type,
    })),
    is_read: message.is_read,
    read_at: message.read_at,
    sender: {
      id: message.sender_id_full,
      username: message.sender_username,
      image: message.sender_image,
    },
    receiver: {
      id: message.receiver_id_full,
      username: message.receiver_username,
      image: message.receiver_image,
    },
  };
};

// Get messages between two users with infinite scroll
export const getMessagesService = async (
  currentUserId: string,
  otherUserId: string,
  limit: number = 20,
  cursor?: string
): Promise<MessagesResponse> => {
  await assertPremiumUser(currentUserId);
  // Verify friendship
  const [friendship] = await sequelize.query(
    `SELECT id FROM friend_requests 
     WHERE status = 'ACCEPTED' 
     AND ((requester_id = :currentUserId AND receiver_id = :otherUserId) 
          OR (requester_id = :otherUserId AND receiver_id = :currentUserId))`,
    {
      replacements: { currentUserId, otherUserId },
      type: QueryTypes.SELECT,
    }
  );

  if (!friendship) {
    throw { statusCode: 403, message: "You can only view messages with your friends" };
  }

  // Build query with cursor-based pagination
  let query = `
    SELECT 
      m.id,
      m.sender_id,
      m.receiver_id,
      m.content,
      m.message_type,
      m.created_at,
      m.updated_at,
      s.id as sender_id_full,
      s.username as sender_username,
      s.image as sender_image,
      r.id as receiver_id_full,
      r.username as receiver_username,
      r.image as receiver_image,
      CASE WHEN mr.id IS NOT NULL THEN true ELSE false END as is_read,
      mr.read_at
    FROM messages m
    INNER JOIN users s ON m.sender_id = s.id
    INNER JOIN users r ON m.receiver_id = r.id
    LEFT JOIN message_reads mr ON m.id = mr.message_id AND mr.user_id = :currentUserId
    WHERE (m.sender_id = :currentUserId AND m.receiver_id = :otherUserId)
       OR (m.sender_id = :otherUserId AND m.receiver_id = :currentUserId)
  `;

  const replacements: any = {
    currentUserId,
    otherUserId,
    limit: limit + 1, // Fetch one extra to check if there are more
  };

  if (cursor) {
    query += ` AND m.created_at < :cursor`;
    replacements.cursor = cursor;
  }

  query += ` ORDER BY m.created_at DESC LIMIT :limit`;

  const messages = await sequelize.query(query, {
    replacements,
    type: QueryTypes.SELECT,
  }) as any[];

  // Check if there are more messages
  const hasMore = messages.length > limit;
  const messagesToReturn = hasMore ? messages.slice(0, limit) : messages;

  // Get media for all messages
  const messageIds = messagesToReturn.map((m) => m.id);
  const mediaMap = new Map<string, any[]>();

  if (messageIds.length > 0) {
    const allMedia = await MessageMedia.findAll({
      where: { message_id: { [Op.in]: messageIds } },
      attributes: ["id", "message_id", "media_url", "media_type", "file_name", "file_size", "mime_type"],
    });

    allMedia.forEach((media) => {
      if (!mediaMap.has(media.message_id)) {
        mediaMap.set(media.message_id, []);
      }
      mediaMap.get(media.message_id)!.push({
        id: media.id,
        media_url: media.media_url,
        media_type: media.media_type,
        file_name: media.file_name,
        file_size: media.file_size,
        mime_type: media.mime_type,
      });
    });
  }

  // Format messages
  const formattedMessages: MessageWithMedia[] = messagesToReturn.map((msg) => ({
    id: msg.id,
    sender_id: msg.sender_id,
    receiver_id: msg.receiver_id,
    content: msg.content,
    message_type: msg.message_type,
    created_at: msg.created_at,
    updated_at: msg.updated_at,
    media: mediaMap.get(msg.id) || [],
    is_read: msg.is_read,
    read_at: msg.read_at,
    sender: {
      id: msg.sender_id_full,
      username: msg.sender_username,
      image: msg.sender_image,
    },
    receiver: {
      id: msg.receiver_id_full,
      username: msg.receiver_username,
      image: msg.receiver_image,
    },
  }));

  // Get next cursor (oldest message's created_at)
  const nextCursor = formattedMessages.length > 0
    ? formattedMessages[formattedMessages.length - 1].created_at.toISOString()
    : undefined;

  return {
    messages: formattedMessages.reverse(), // Reverse to show oldest first
    nextCursor,
    hasMore,
  };
};

// Mark messages as read
export const markMessagesAsReadService = async (
  currentUserId: string,
  otherUserId: string
): Promise<{ count: number }> => {
  await assertPremiumUser(currentUserId);
  // Get all unread messages from otherUserId to currentUserId
  const unreadMessages = await sequelize.query(
    `SELECT m.id 
     FROM messages m
     LEFT JOIN message_reads mr ON m.id = mr.message_id AND mr.user_id = :currentUserId
     WHERE m.sender_id = :otherUserId 
       AND m.receiver_id = :currentUserId
       AND mr.id IS NULL`,
    {
      replacements: { currentUserId, otherUserId },
      type: QueryTypes.SELECT,
    }
  ) as any[];

  if (unreadMessages.length === 0) {
    return { count: 0 };
  }

  // Bulk insert read records
  const readRecords = unreadMessages.map((msg) => ({
    message_id: msg.id,
    user_id: currentUserId,
    read_at: new Date(),
  }));

  await MessageRead.bulkCreate(readRecords, {
    ignoreDuplicates: true,
  });

  return { count: unreadMessages.length };
};

// Get unread message count for a conversation
export const getUnreadCountService = async (
  currentUserId: string,
  otherUserId: string
): Promise<{ count: number }> => {
  await assertPremiumUser(currentUserId);
  const [result] = await sequelize.query(
    `SELECT COUNT(*) as count
     FROM messages m
     LEFT JOIN message_reads mr ON m.id = mr.message_id AND mr.user_id = :currentUserId
     WHERE m.sender_id = :otherUserId 
       AND m.receiver_id = :currentUserId
       AND mr.id IS NULL`,
    {
      replacements: { currentUserId, otherUserId },
      type: QueryTypes.SELECT,
    }
  ) as any[];

  return { count: parseInt(result.count) || 0 };
};

// Get all unread counts for all conversations
export const getAllUnreadCountsService = async (
  currentUserId: string
): Promise<Record<string, number>> => {
  await assertPremiumUser(currentUserId);
  const results = await sequelize.query(
    `SELECT 
       m.sender_id as other_user_id,
       COUNT(*) as count
     FROM messages m
     LEFT JOIN message_reads mr ON m.id = mr.message_id AND mr.user_id = :currentUserId
     WHERE m.receiver_id = :currentUserId
       AND m.sender_id != :currentUserId
       AND mr.id IS NULL
     GROUP BY m.sender_id`,
    {
      replacements: { currentUserId },
      type: QueryTypes.SELECT,
    }
  ) as any[];

  const counts: Record<string, number> = {};
  results.forEach((result) => {
    counts[result.other_user_id] = parseInt(result.count) || 0;
  });

  return counts;
};

