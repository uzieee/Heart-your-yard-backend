import { QueryTypes } from "sequelize";
import sequelize from "database";

export interface FriendRequest {
  id: string;
  requester_id: string;
  receiver_id: string;
  status: "PENDING" | "ACCEPTED" | "DECLINED";
  created_at: Date;
  updated_at: Date;
  requester: {
    id: string;
    username: string;
    image: string | null;
    is_verified: boolean;
  };
}

export const sendFriendRequestService = async (
  requesterId: string,
  receiverId: string
) => {
  // Prevent self-request
  if (requesterId === receiverId) {
    throw { statusCode: 400, message: "Cannot send friend request to yourself" };
  }

  // Check if already following (one way - requester following receiver)
  const [existingFollow] = await sequelize.query(
    `SELECT id FROM follows 
     WHERE follower_id = $1 AND following_id = $2 AND deleted_at IS NULL 
     LIMIT 1`,
    { bind: [requesterId, receiverId], type: QueryTypes.SELECT }
  ) as any[];

  // Don't throw error if already following - we'll just add friend request
  // This allows friend request even if already following

  // Check if there's already a pending request (either direction)
  const [existingRequest] = await sequelize.query(
    `SELECT id, status FROM friend_requests 
     WHERE ((requester_id = $1 AND receiver_id = $2) OR (requester_id = $2 AND receiver_id = $1))
     AND deleted_at IS NULL 
     LIMIT 1`,
    { bind: [requesterId, receiverId], type: QueryTypes.SELECT }
  ) as any[];

  if (existingRequest) {
    if (existingRequest.status === "PENDING") {
      throw { statusCode: 409, message: "Friend request already exists" };
    }
    if (existingRequest.status === "ACCEPTED") {
      throw { statusCode: 409, message: "Already friends with this user" };
    }
    // If declined, allow sending a new request
  }

  // Create friend request
  const [result] = await sequelize.query(
    `INSERT INTO friend_requests (requester_id, receiver_id, status)
     VALUES ($1, $2, 'PENDING')
     RETURNING id`,
    { bind: [requesterId, receiverId], type: QueryTypes.INSERT }
  ) as any[];

  const requestId = result.id || result[0]?.id;

  // Also add to follows table (requester follows receiver) - like before
  // Only if not already following
  if (!existingFollow) {
    try {
      await sequelize.query(
        `INSERT INTO follows (follower_id, following_id)
         VALUES ($1, $2)
         RETURNING id`,
        { bind: [requesterId, receiverId], type: QueryTypes.INSERT }
      );
      console.log(`✅ Added follow relationship: ${requesterId} follows ${receiverId}`);
    } catch (followError: any) {
      // If follow insert fails due to unique constraint, that's okay - might already exist
      // Log but don't fail the friend request
      if (followError?.code === '23505' || followError?.parent?.code === '23505') {
        console.log(`ℹ️ Follow relationship already exists: ${requesterId} follows ${receiverId}`);
      } else {
        console.error("Error adding follow relationship:", followError);
      }
    }
  } else {
    console.log(`ℹ️ Already following: ${requesterId} follows ${receiverId}`);
  }

  return {
    requestId: requestId,
    message: "Friend request sent successfully",
  };
};

export const acceptFriendRequestService = async (
  requestId: string,
  userId: string
) => {
  // Get the friend request
  const [request] = await sequelize.query(
    `SELECT * FROM friend_requests 
     WHERE id = $1 AND receiver_id = $2 AND status = 'PENDING' AND deleted_at IS NULL
     LIMIT 1`,
    { bind: [requestId, userId], type: QueryTypes.SELECT }
  ) as any[];

  if (!request) {
    throw { statusCode: 404, message: "Friend request not found" };
  }

  const requesterId = request.requester_id;
  const receiverId = request.receiver_id;

  // Update request status to ACCEPTED
  await sequelize.query(
    `UPDATE friend_requests 
     SET status = 'ACCEPTED', updated_at = NOW()
     WHERE id = $1`,
    { bind: [requestId], type: QueryTypes.UPDATE }
  );

  // Create bidirectional friendship in follows table
  // requester follows receiver
  const [existingFollow1] = await sequelize.query(
    `SELECT id FROM follows 
     WHERE follower_id = $1 AND following_id = $2 AND deleted_at IS NULL 
     LIMIT 1`,
    { bind: [requesterId, receiverId], type: QueryTypes.SELECT }
  ) as any[];

  if (!existingFollow1) {
    await sequelize.query(
      `INSERT INTO follows (follower_id, following_id)
       VALUES ($1, $2)`,
      { bind: [requesterId, receiverId], type: QueryTypes.INSERT }
    );
  }

  // receiver follows requester (bidirectional friendship)
  const [existingFollow2] = await sequelize.query(
    `SELECT id FROM follows 
     WHERE follower_id = $1 AND following_id = $2 AND deleted_at IS NULL 
     LIMIT 1`,
    { bind: [receiverId, requesterId], type: QueryTypes.SELECT }
  ) as any[];

  if (!existingFollow2) {
    await sequelize.query(
      `INSERT INTO follows (follower_id, following_id)
       VALUES ($1, $2)`,
      { bind: [receiverId, requesterId], type: QueryTypes.INSERT }
    );
  }

  return {
    message: "Friend request accepted successfully",
    requesterId,
  };
};

export const declineFriendRequestService = async (
  requestId: string,
  userId: string
) => {
  // Get the friend request
  const [request] = await sequelize.query(
    `SELECT * FROM friend_requests 
     WHERE id = $1 AND receiver_id = $2 AND status = 'PENDING' AND deleted_at IS NULL
     LIMIT 1`,
    { bind: [requestId, userId], type: QueryTypes.SELECT }
  ) as any[];

  if (!request) {
    throw { statusCode: 404, message: "Friend request not found" };
  }

  // Update request status to DECLINED
  await sequelize.query(
    `UPDATE friend_requests 
     SET status = 'DECLINED', updated_at = NOW()
     WHERE id = $1`,
    { bind: [requestId], type: QueryTypes.UPDATE }
  );

  return {
    message: "Friend request declined successfully",
  };
};

export const getSentFriendRequestsCountService = async (
  userId: string
): Promise<number> => {
  const [result] = await sequelize.query(
    `SELECT COUNT(*) as count 
     FROM friend_requests 
     WHERE requester_id = $1 AND status = 'PENDING' AND deleted_at IS NULL`,
    { bind: [userId], type: QueryTypes.SELECT }
  ) as any[];

  return parseInt(result?.count || "0", 10);
};

export const getFriendRequestsService = async (
  userId: string,
  limit: number = 10,
  cursor?: string
): Promise<{ requests: FriendRequest[]; nextCursor?: string; hasMore: boolean }> => {
  let query = `
    SELECT 
      fr.id,
      fr.requester_id,
      fr.receiver_id,
      fr.status,
      fr.created_at,
      fr.updated_at,
      u.id as requester_user_id,
      u.username as requester_username,
      COALESCE(o.image, u.image) as requester_image,
      COALESCE(u.is_verified_email, false) as requester_is_verified
    FROM friend_requests fr
    INNER JOIN users u ON fr.requester_id = u.id
    LEFT JOIN onboarding o ON u.id = o.user_id AND o.deleted_at IS NULL
    WHERE fr.receiver_id = $1 
      AND fr.status = 'PENDING' 
      AND fr.deleted_at IS NULL 
      AND u.deleted_at IS NULL
  `;

  const bindParams: any[] = [userId];

  if (cursor) {
    query += ` AND fr.created_at < $2`;
    bindParams.push(cursor);
  }

  query += ` ORDER BY fr.created_at DESC LIMIT $${bindParams.length + 1}`;
  bindParams.push(limit + 1); // Fetch one extra to check if there's more

  const requests = await sequelize.query(query, {
    bind: bindParams,
    type: QueryTypes.SELECT,
  }) as any[];

  const hasMore = requests.length > limit;
  const requestsToReturn = hasMore ? requests.slice(0, limit) : requests;

  const nextCursor = hasMore && requestsToReturn.length > 0
    ? requestsToReturn[requestsToReturn.length - 1].created_at.toISOString()
    : undefined;

  const formattedRequests: FriendRequest[] = requestsToReturn.map((req: any) => ({
    id: req.id,
    requester_id: req.requester_id,
    receiver_id: req.receiver_id,
    status: req.status,
    created_at: req.created_at,
    updated_at: req.updated_at,
    requester: {
      id: req.requester_user_id,
      username: req.requester_username,
      image: req.requester_image,
      is_verified: req.requester_is_verified,
    },
  }));

  return {
    requests: formattedRequests,
    nextCursor,
    hasMore,
  };
};

export interface Friend {
  id: string;
  username: string;
  image: string | null;
  is_verified: boolean;
  lastMessage?: string;
  lastSeen?: string;
  isOnline?: boolean;
}

export const getFriendsService = async (
  userId: string,
  limit: number = 10,
  cursor?: string,
  searchQuery?: string,
  onlineUserIds?: string[]
): Promise<{ friends: Friend[]; nextCursor?: string; hasMore: boolean }> => {
  let query = `
    SELECT DISTINCT
      u.id,
      u.username,
      COALESCE(o.image, u.image) as image,
      COALESCE(u.is_verified_email, false) as is_verified,
      fr.updated_at as friendship_updated_at,
      (
        SELECT m.content 
        FROM messages m 
        WHERE (m.sender_id = u.id AND m.receiver_id = $1) 
           OR (m.sender_id = $1 AND m.receiver_id = u.id)
        ORDER BY m.created_at DESC 
        LIMIT 1
      ) as last_message,
      (
        SELECT m.message_type 
        FROM messages m 
        WHERE (m.sender_id = u.id AND m.receiver_id = $1) 
           OR (m.sender_id = $1 AND m.receiver_id = u.id)
        ORDER BY m.created_at DESC 
        LIMIT 1
      ) as last_message_type,
      (
        SELECT m.sender_id 
        FROM messages m 
        WHERE (m.sender_id = u.id AND m.receiver_id = $1) 
           OR (m.sender_id = $1 AND m.receiver_id = u.id)
        ORDER BY m.created_at DESC 
        LIMIT 1
      ) as last_message_sender_id
    FROM friend_requests fr
    INNER JOIN users u ON (
      (fr.requester_id = $1 AND fr.receiver_id = u.id) OR
      (fr.receiver_id = $1 AND fr.requester_id = u.id)
    )
    LEFT JOIN onboarding o ON u.id = o.user_id AND o.deleted_at IS NULL
    WHERE fr.status = 'ACCEPTED' 
      AND fr.deleted_at IS NULL 
      AND u.deleted_at IS NULL
  `;

  const bindParams: any[] = [userId];

  // Add search filter if provided
  if (searchQuery && searchQuery.trim()) {
    query += ` AND LOWER(u.username) LIKE LOWER($${bindParams.length + 1})`;
    bindParams.push(`%${searchQuery.trim()}%`);
  }

  // Add cursor for pagination
  if (cursor) {
    query += ` AND fr.updated_at < $${bindParams.length + 1}`;
    bindParams.push(cursor);
  }

  query += ` ORDER BY fr.updated_at DESC LIMIT $${bindParams.length + 1}`;
  bindParams.push(limit + 1); // Fetch one extra to check if there's more

  const friends = await sequelize.query(query, {
    bind: bindParams,
    type: QueryTypes.SELECT,
  }) as any[];

  const hasMore = friends.length > limit;
  const friendsToReturn = hasMore ? friends.slice(0, limit) : friends;

  const nextCursor = hasMore && friendsToReturn.length > 0
    ? friendsToReturn[friendsToReturn.length - 1].friendship_updated_at.toISOString()
    : undefined;

  const formattedFriends: Friend[] = friendsToReturn.map((friend: any) => {
    // Format last message (WhatsApp style)
    let lastMessage: string | undefined = undefined;
    if (friend.last_message || friend.last_message_type) {
      const isFromCurrentUser = friend.last_message_sender_id === userId;
      const prefix = isFromCurrentUser ? 'You: ' : '';
      
      if (friend.last_message_type === 'text' && friend.last_message) {
        lastMessage = `${prefix}${friend.last_message}`;
      } else if (friend.last_message_type === 'image') {
        lastMessage = `${prefix}📷 Image`;
      } else if (friend.last_message_type === 'video') {
        lastMessage = `${prefix}🎥 Video`;
      }
    }

    return {
      id: friend.id,
      username: friend.username,
      image: friend.image,
      is_verified: friend.is_verified,
      isOnline: onlineUserIds ? onlineUserIds.includes(friend.id) : false,
      lastMessage,
    };
  });

  return {
    friends: formattedFriends,
    nextCursor,
    hasMore,
  };
};
