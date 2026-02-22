import { Server as HTTPServer } from "http";
import { Server as SocketServer, Socket } from "socket.io";
import { verifyToken, TokenPayload } from "@/utils/jwt";
import { QueryTypes } from "sequelize";
import sequelize from "database";

interface AuthenticatedSocket extends Socket {
  userId?: string;
  userEmail?: string;
}

class SocketService {
  private io: SocketServer;
  private onlineUsers: Map<string, string> = new Map(); // userId -> socketId

  constructor(httpServer: HTTPServer) {
    const frontendUrl = process.env.FRONTEND_URL || "http://localhost:5174";

    console.log("🔌 Initializing Socket.io server with CORS:", frontendUrl);

    this.io = new SocketServer(httpServer, {
      cors: {
        origin: (requestOrigin, callback) => {
          // Allow all origins in development/testing to rule out CORS issues
          console.log("🌐 Socket CORS request from origin:", requestOrigin);
          callback(null, true);
        },
        credentials: true,
        methods: ["GET", "POST", "OPTIONS"],
        allowedHeaders: ["Content-Type", "Authorization"],
      },
      transports: ["websocket", "polling"], // Fallback to polling if websocket fails
      allowEIO3: true, // Allow Engine.IO v3 clients
      pingTimeout: 60000, // 60 seconds
      pingInterval: 25000, // 25 seconds
      connectTimeout: 30000, // 30 seconds
    });

    console.log("✅ Socket.io server setup complete");

    this.setupMiddleware();
    this.setupEventHandlers();
  }

  private setupMiddleware() {
    // Authentication middleware
    this.io.use(async (socket: AuthenticatedSocket, next) => {
      try {
        const token = socket.handshake.auth?.token || socket.handshake.headers?.authorization?.split(" ")[1];

        console.log("🔐 Socket authentication attempt:", {
          hasAuthToken: !!socket.handshake.auth?.token,
          hasHeaderToken: !!socket.handshake.headers?.authorization,
          tokenLength: token?.length || 0,
        });

        if (!token) {
          console.error("❌ Authentication token missing");
          return next(new Error("Authentication token missing"));
        }

        const decoded = verifyToken(token);
        socket.userId = decoded.userId;
        socket.userEmail = decoded.email;

        console.log("✅ Socket authenticated:", {
          userId: decoded.userId,
          email: decoded.email,
        });

        next();
      } catch (error: any) {
        console.error("❌ Socket authentication failed:", error.message);
        next(new Error("Authentication failed"));
      }
    });
  }

  private setupEventHandlers() {
    this.io.on("connection", async (socket: AuthenticatedSocket) => {
      const userId = socket.userId!;
      const socketId = socket.id;

      console.log(`✅ User connected: ${userId} (Socket: ${socketId})`);

      // Add user to online users
      this.onlineUsers.set(userId, socketId);

      // Automatically subscribe user to feed-all room on connection (like chat apps)
      socket.join("feed-all");
      socket.join(`notifications-${userId}`);

      const totalSockets = this.io.sockets.sockets.size;
      console.log(`📡 User ${userId} connected. Total connected sockets: ${totalSockets}`);

      // Update user online status in database
      await this.updateUserOnlineStatus(userId, true);

      // Notify other users that this user is now online
      // Use socket.broadcast.emit to notify all EXCEPT the user who just connected
      // Then also emit to all to ensure everyone gets the update
      socket.broadcast.emit("user-online", { userId });
      this.io.emit("user-online", { userId }); // Also emit to all including sender for consistency
      console.log(`📢 Broadcasted user-online event for ${userId} to all connected clients (total: ${this.io.sockets.sockets.size})`);

      // Send current user their online status
      socket.emit("connection-success", {
        userId,
        socketId,
        message: "Connected to socket server",
      });

      // Send list of online users to the newly connected user
      const onlineUserIds = Array.from(this.onlineUsers.keys());
      socket.emit("online-users", { userIds: onlineUserIds });

      // Handle disconnect
      socket.on("disconnect", async () => {
        console.log(`❌ User disconnected: ${userId} (Socket: ${socketId})`);

        // User will automatically leave all rooms on disconnect
        const feedAllRoom = this.io.sockets.adapter.rooms.get("feed-all");
        const connectedUsers = feedAllRoom ? feedAllRoom.size : 0;
        console.log(`📡 User ${userId} disconnected. Remaining users in feed-all room: ${connectedUsers}`);

        this.onlineUsers.delete(userId);
        await this.updateUserOnlineStatus(userId, false);

        // Notify other users that this user is now offline
        // Use socket.broadcast.emit to notify all EXCEPT the user who disconnected
        socket.broadcast.emit("user-offline", { userId });
        this.io.emit("user-offline", { userId }); // Also emit to all for consistency
        console.log(`📢 Broadcasted user-offline event for ${userId} to all connected clients (remaining: ${this.io.sockets.sockets.size})`);
      });

      // Handle chat messages (real-time forwarding only - persistence handled by API)
      socket.on("send-message", async (data: { receiverId: string; message: any }) => {
        const { receiverId, message } = data;

        if (!receiverId || !message) {
          socket.emit("message-error", { error: "Invalid message data" });
          return;
        }

        // Check if receiver is online
        const receiverSocketId = this.onlineUsers.get(receiverId);

        // Forward message to receiver if online
        if (receiverSocketId) {
          this.io.to(receiverSocketId).emit("receive-message", message);
          console.log(`📤 Message forwarded from ${userId} to ${receiverId} via socket`);
        } else {
          console.log(`⚠️ Receiver ${receiverId} is offline, message will be delivered when they come online`);
        }

        // Confirm to sender
        socket.emit("message-sent", { 
          message,
          status: receiverSocketId ? "delivered" : "pending" 
        });
      });

      // Handle typing indicator
      socket.on("typing-start", (data: { receiverId: string }) => {
        const receiverSocketId = this.onlineUsers.get(data.receiverId);
        if (receiverSocketId) {
          this.io.to(receiverSocketId).emit("user-typing", { userId, isTyping: true });
        }
      });

      socket.on("typing-stop", (data: { receiverId: string }) => {
        const receiverSocketId = this.onlineUsers.get(data.receiverId);
        if (receiverSocketId) {
          this.io.to(receiverSocketId).emit("user-typing", { userId, isTyping: false });
        }
      });

      // Handle home feed updates (if needed)
      // Note: Users are auto-subscribed on connection, but this allows re-subscription if needed
      socket.on("subscribe-feed", () => {
        socket.join("feed-all");
        const feedAllRoom = this.io.sockets.adapter.rooms.get("feed-all");
        const connectedUsers = feedAllRoom ? feedAllRoom.size : 0;
        console.log(`📡 User ${userId} manually subscribed to feed. Total users in room: ${connectedUsers}`);
      });

      socket.on("unsubscribe-feed", () => {
        socket.leave("feed-all");
        const feedAllRoom = this.io.sockets.adapter.rooms.get("feed-all");
        const connectedUsers = feedAllRoom ? feedAllRoom.size : 0;
        console.log(`📡 User ${userId} unsubscribed from feed. Remaining users in room: ${connectedUsers}`);
      });

      // Handle notification subscriptions
      // Note: Users are auto-subscribed on connection, but this allows re-subscription if needed
      socket.on("subscribe-notifications", () => {
        socket.join(`notifications-${userId}`);
        console.log(`🔔 User ${userId} subscribed to notifications`);
      });

      socket.on("unsubscribe-notifications", () => {
        socket.leave(`notifications-${userId}`);
        console.log(`🔔 User ${userId} unsubscribed from notifications`);
      });

      // Subscribe to a community room for real-time join/leave updates
      socket.on("subscribe-community", (data: { communityId: string }) => {
        if (data?.communityId) {
          const room = `community-${data.communityId}`;
          socket.join(room);
          console.log(`📡 User ${userId} subscribed to community room: ${room}`);
        }
      });

      socket.on("unsubscribe-community", (data: { communityId: string }) => {
        if (data?.communityId) {
          socket.leave(`community-${data.communityId}`);
        }
      });
    });
  }

  private async updateUserOnlineStatus(userId: string, isOnline: boolean) {
    try {
      // You can add an is_online column to users table or use a separate online_users table
      // For now, we'll just track in memory
      // If you want to persist, uncomment below:
      /*
      await sequelize.query(
        `UPDATE users SET is_online = $1, last_seen = NOW() WHERE id = $2`,
        { bind: [isOnline, userId], type: QueryTypes.UPDATE }
      );
      */
    } catch (error) {
      console.error("Error updating user online status:", error);
    }
  }

  // Public method to emit feed updates to specific user
  public emitFeedUpdate(userId: string, data: any) {
    this.io.to(`feed-${userId}`).emit("feed-update", data);
  }

  // Public method to broadcast feed updates to all users (like chat apps)
  // Simple approach: Just broadcast to all connected sockets
  public broadcastFeedUpdate(data: any) {
    const totalSockets = this.io.sockets.sockets.size;

    console.log(`📢 Broadcasting feed update to all sockets:`, {
      totalConnectedSockets: totalSockets,
      dataType: data.type,
      postId: data.post?.id,
    });

    // Simple approach: Broadcast to ALL connected sockets (like chat apps)
    // No need for rooms - just send to everyone who's connected
    if (totalSockets > 0) {
      this.io.emit("feed-update", data);
      console.log(`✅ Feed update broadcasted to ${totalSockets} connected socket(s)`);
    } else {
      console.warn(`⚠️ No connected sockets to broadcast to`);
    }
  }

  // Public method to emit notifications to specific user
  public emitNotification(userId: string, data: any) {
    this.io.to(`notifications-${userId}`).emit("notification", data);
  }

  // Public method to emit friend request to specific user
  public emitFriendRequest(userId: string, data: any) {
    const room = `notifications-${userId}`;
    const roomSize = this.io.sockets.adapter.rooms.get(room)?.size || 0;
    
    console.log(`📤 Emitting friend request to room: ${room}, users in room: ${roomSize}`, {
      userId,
      dataType: data?.type,
      requestId: data?.request?.id,
      fullData: data,
    });
    
    // Emit to the room
    this.io.to(room).emit("friend-request", data);
    
    // Also emit directly to the user's socket if they're online (backup)
    const userSocketId = this.onlineUsers.get(userId);
    if (userSocketId) {
      this.io.to(userSocketId).emit("friend-request", data);
      console.log(`📤 Also emitted directly to socket: ${userSocketId}`);
    }
    
    // Also check if user is online
    const isOnline = this.isUserOnline(userId);
    console.log(`📡 User ${userId} online status: ${isOnline}, socketId: ${userSocketId}`);
    
    // Log all rooms for debugging
    const allRooms = Array.from(this.io.sockets.adapter.rooms.keys());
    const notificationRooms = allRooms.filter(r => r.startsWith('notifications-'));
    console.log(`📋 All notification rooms: ${notificationRooms.join(', ')}`);
  }

  // Emit to all clients watching this community (join/leave updates)
  public emitCommunityUpdate(communityId: string, data: { type: "member_joined" | "member_left"; communityId: string }) {
    const room = `community-${communityId}`;
    this.io.to(room).emit("community-update", data);
    const roomSize = this.io.sockets.adapter.rooms.get(room)?.size ?? 0;
    console.log(`📢 Community update emitted to room ${room} (${roomSize} listener(s)):`, data.type);
  }

  // Emit when a new post is created in a community so members see it at runtime
  public emitCommunityPostCreated(communityId: string) {
    const room = `community-${communityId}`;
    this.io.to(room).emit("community-post-created", { communityId });
    const roomSize = this.io.sockets.adapter.rooms.get(room)?.size ?? 0;
    console.log(`📢 community-post-created emitted to room ${room} (${roomSize})`);
  }

  // Emit when like/dislike on a community post so other members see updated counts
  public emitCommunityPostReactionUpdated(communityId: string, data: { postId: string; likesCount: number; dislikesCount: number }) {
    const room = `community-${communityId}`;
    this.io.to(room).emit("community-post-reaction-updated", { communityId, ...data });
  }

  // Emit when comment/reply added on a community post so other members see new comments
  public emitCommunityPostCommentAdded(communityId: string, data: { postId: string }) {
    const room = `community-${communityId}`;
    const payload = { communityId, ...data };
    this.io.to(room).emit("community-post-comment-added", payload);
    // Also broadcast to all so members who haven't joined the room yet (e.g. timing/tab) still get updates
    this.io.emit("community-post-comment-added", payload);
  }

  // Emit when like/dislike on a community comment or reply so other members see updated reaction counts
  public emitCommunityPostCommentReactionUpdated(communityId: string, data: { postId: string }) {
    const room = `community-${communityId}`;
    const payload = { communityId, ...data };
    this.io.to(room).emit("community-post-comment-reaction-updated", payload);
    this.io.emit("community-post-comment-reaction-updated", payload);
  }

  // Emit when community profile (name/description/image) is updated so viewers see changes
  public emitCommunityUpdated(communityId: string) {
    const room = `community-${communityId}`;
    this.io.to(room).emit("community-updated", { communityId });
    this.io.emit("community-updated", { communityId });
    const roomSize = this.io.sockets.adapter.rooms.get(room)?.size ?? 0;
    console.log(`📢 community-updated emitted to room ${room} (${roomSize}) and broadcast`);
  }

  // Broadcast when a new community is created so lists update in real time
  public broadcastCommunityCreated(data?: { communityId: string }) {
    const total = this.io.sockets.sockets.size;
    if (total > 0) {
      this.io.emit("community-created", data ?? {});
      console.log(`📢 community-created broadcast to ${total} socket(s)`);
    }
  }

  // Public method to get online users
  public getOnlineUsers(): string[] {
    return Array.from(this.onlineUsers.keys());
  }

  // Public method to check if user is online
  public isUserOnline(userId: string): boolean {
    return this.onlineUsers.has(userId);
  }

  public getIO(): SocketServer {
    return this.io;
  }
}

export default SocketService;






