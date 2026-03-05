require("tsconfig-paths/register");
import express from "express";
import cookieParser from "cookie-parser";
import dotenv from "dotenv";
import cors from "cors";
import bodyParser from "body-parser";
import path from "path";
import { createServer } from "http";
import { checkDBConnection } from "database";
import router from "@/routes";
import SocketService from "@/socket/socketServer";
import { startPlantingTaskStatusWatcher } from "@/services/plantingTaskStatusWatcher";

dotenv.config();
const app = express();
const PORT = process.env.PORT || 4269;

// Create HTTP server for Socket.io
const httpServer = createServer(app);

app.use(cors({
  origin: (origin, callback) => {
    // Allow all origins in development
    const allowedOrigins = [
      process.env.FRONTEND_URL || "http://localhost:5174",
      "http://localhost:3000",
      "http://localhost:5173",
      "http://localhost:5174",
    ];
    
    // In development, allow all origins
    if (!origin || process.env.NODE_ENV === "development") {
      callback(null, true);
    } else if (allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      callback(new Error("Not allowed by CORS"));
    }
  },
  credentials: true,
  methods: ["GET", "POST", "PUT", "DELETE", "PATCH", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization"],
}));
app.use(express.json());
app.use(bodyParser.urlencoded({ extended: true }));
app.use(cookieParser());

// Serve uploaded files statically
app.use("/uploads", express.static(path.join(__dirname, "../uploads")));
app.use("/uploads/images", express.static(path.join(__dirname, "../uploads/images")));
app.use("/uploads/videos", express.static(path.join(__dirname, "../uploads/videos")));

app.use("/api", router);

// Initialize Socket.io immediately with httpServer
// This ensures socketService is available when controllers import it
export const socketService = new SocketService(httpServer);

checkDBConnection()
  .then(() => {
    const stopPlantingTaskStatusWatcher = startPlantingTaskStatusWatcher(socketService);
    process.on("SIGINT", stopPlantingTaskStatusWatcher);
    process.on("SIGTERM", stopPlantingTaskStatusWatcher);

    httpServer.listen(PORT, () => {
      console.log(`✅ Server is running at http://localhost:${PORT}`);
      console.log(`✅ Socket.io server initialized`);
      console.log(`✅ Planting task status watcher started`);
    });
  })
  .catch((err) => {
    console.error("Failed to connect to the database:", err);
  });
