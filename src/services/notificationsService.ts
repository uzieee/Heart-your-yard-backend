import { QueryTypes } from "sequelize";
import sequelize from "database";

export type NotificationType =
  | "POST_CREATED"
  | "POST_LIKED"
  | "COMMENT_ADDED"
  | "COMMENT_LIKED"
  | "REPLY_ADDED"
  | "REPLY_LIKED"
  | "USER_FOLLOWED"
  | "FRIEND_REQUEST_SENT"
  | "FRIEND_REQUEST_ACCEPTED";

export type ReferenceType = "POST" | "COMMENT" | "REPLY" | "USER";

export interface Notification {
  id: string;
  user_id: string;
  actor_id: string;
  type: NotificationType;
  reference_id: string | null;
  reference_type: ReferenceType;
  message: string | null;
  is_read: boolean;
  created_at: Date;
  updated_at: Date;
  actor: {
    id: string;
    username: string;
    image: string | null;
  };
}

export interface CreateNotificationPayload {
  userId: string; // Receiver
  actorId: string; // Sender
  type: NotificationType;
  referenceId?: string | null;
  referenceType: ReferenceType;
  message?: string | null;
}

const getNotificationMessage = (
  type: NotificationType,
  actorUsername: string
): string => {
  switch (type) {
    case "POST_CREATED":
      return `${actorUsername} created a new post`;
    case "POST_LIKED":
      return `${actorUsername} liked your post`;
    case "COMMENT_ADDED":
      return `${actorUsername} commented on your post`;
    case "COMMENT_LIKED":
      return `${actorUsername} liked your comment`;
    case "REPLY_ADDED":
      return `${actorUsername} replied to your comment`;
    case "REPLY_LIKED":
      return `${actorUsername} liked your reply`;
    case "USER_FOLLOWED":
      return `${actorUsername} started following you`;
    case "FRIEND_REQUEST_SENT":
      return `${actorUsername} sent you a friend request`;
    case "FRIEND_REQUEST_ACCEPTED":
      return `${actorUsername} accepted your friend request`;
    default:
      return `${actorUsername} performed an action`;
  }
};

export const createNotificationService = async (
  payload: CreateNotificationPayload
): Promise<Notification> => {
  const { userId, actorId, type, referenceId, referenceType, message } = payload;

  // Get actor username for message
  const actorResult = await sequelize.query(
    `SELECT u.username, COALESCE(o.image, u.image) as image
     FROM users u
     LEFT JOIN onboarding o ON u.id = o.user_id AND o.deleted_at IS NULL
     WHERE u.id = $1 AND u.deleted_at IS NULL`,
    {
      bind: [actorId],
      type: QueryTypes.SELECT,
    }
  );

  if (actorResult.length === 0) {
    throw new Error("Actor user not found");
  }

  const actor = actorResult[0] as { username: string; image: string | null };
  const notificationMessage = message || getNotificationMessage(type, actor.username);

  // Don't create notification if user is notifying themselves
  if (userId === actorId) {
    throw new Error("Cannot create notification for self");
  }

  // Use raw query with explicit type casting to the correct enum type
  // Column uses enum_notifications_type (created by Sequelize), not notification_type_enum
  const result = await sequelize.query(
    `INSERT INTO notifications (
       user_id, actor_id, type, reference_id, reference_type, message, is_read, created_at, updated_at
     )
     VALUES ($1, $2, $3::enum_notifications_type, $4, $5::enum_notifications_reference_type, $6, false, NOW(), NOW())
     RETURNING *`,
    {
      bind: [userId, actorId, type, referenceId || null, referenceType, notificationMessage],
      type: QueryTypes.SELECT,
    }
  );

  if (!Array.isArray(result) || result.length === 0) {
    throw new Error("Failed to create notification");
  }

  const notification = result[0] as any;

  return {
    id: notification.id,
    user_id: notification.user_id,
    actor_id: notification.actor_id,
    type: notification.type,
    reference_id: notification.reference_id,
    reference_type: notification.reference_type,
    message: notification.message,
    is_read: notification.is_read,
    created_at: notification.created_at,
    updated_at: notification.updated_at,
    actor: {
      id: actorId,
      username: actor.username,
      image: actor.image,
    },
  };
};

export const getNotificationsService = async (
  userId: string,
  limit: number = 20,
  offset: number = 0
): Promise<{ notifications: Notification[]; unreadCount: number }> => {
  // Get notifications
  const notificationsResult = await sequelize.query(
    `SELECT 
       n.id,
       n.user_id,
       n.actor_id,
       n.type,
       n.reference_id,
       n.reference_type,
       n.message,
       n.is_read,
       n.created_at,
       n.updated_at,
       u.id as actor_user_id,
       u.username as actor_username,
       COALESCE(o.image, u.image) as actor_image
     FROM notifications n
     INNER JOIN users u ON n.actor_id = u.id
     LEFT JOIN onboarding o ON u.id = o.user_id AND o.deleted_at IS NULL
     WHERE n.user_id = $1 AND n.deleted_at IS NULL
     ORDER BY n.created_at DESC
     LIMIT $2 OFFSET $3`,
    {
      bind: [userId, limit, offset],
      type: QueryTypes.SELECT,
    }
  );

  console.log(`📋 Fetched ${notificationsResult.length} notifications for user ${userId}`, {
    types: notificationsResult.map((n: any) => n.type),
    friendRequestCount: notificationsResult.filter((n: any) => n.type === 'FRIEND_REQUEST_SENT' || n.type === 'FRIEND_REQUEST_ACCEPTED').length,
  });

  // Get unread count
  const unreadResult = await sequelize.query(
    `SELECT COUNT(*)::INTEGER as count
     FROM notifications
     WHERE user_id = $1 AND is_read = false AND deleted_at IS NULL`,
    {
      bind: [userId],
      type: QueryTypes.SELECT,
    }
  );

  const unreadCount = (unreadResult[0] as any).count || 0;

  const notifications: Notification[] = notificationsResult.map((notif: any) => ({
    id: notif.id,
    user_id: notif.user_id,
    actor_id: notif.actor_id,
    type: notif.type,
    reference_id: notif.reference_id,
    reference_type: notif.reference_type,
    message: notif.message,
    is_read: notif.is_read,
    created_at: notif.created_at,
    updated_at: notif.updated_at,
    actor: {
      id: notif.actor_user_id,
      username: notif.actor_username,
      image: notif.actor_image,
    },
  }));

  return { notifications, unreadCount };
};

export const markNotificationAsReadService = async (
  notificationId: string,
  userId: string
): Promise<void> => {
  await sequelize.query(
    `UPDATE notifications 
     SET is_read = true, updated_at = NOW()
     WHERE id = $1 AND user_id = $2 AND deleted_at IS NULL`,
    {
      bind: [notificationId, userId],
      type: QueryTypes.UPDATE,
    }
  );
};

export const markAllNotificationsAsReadService = async (
  userId: string
): Promise<void> => {
  await sequelize.query(
    `UPDATE notifications 
     SET is_read = true, updated_at = NOW()
     WHERE user_id = $1 AND is_read = false AND deleted_at IS NULL`,
    {
      bind: [userId],
      type: QueryTypes.UPDATE,
    }
  );
};


