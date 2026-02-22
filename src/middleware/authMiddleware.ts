import { Request, Response, NextFunction } from "express";
import { verifyToken } from "@/utils/jwt";
import { sendError } from "@/utils/apiResponse";

export interface AuthRequest extends Request {
  user?: {
    userId: string;
    email: string;
    isOnboarded: boolean;
  };
  file?: Express.Multer.File;
  files?: {
    [fieldname: string]: Express.Multer.File[];
  } | Express.Multer.File[];
}

export const authenticateToken = (
  req: AuthRequest,
  res: Response,
  next: NextFunction
): void => {
  try {
    // Get token from cookie
    const token = req.cookies?.access_token;

    if (!token) {
      sendError(res, 401, "Authentication required");
      return;
    }

    // Verify token
    const decoded = verifyToken(token);
    req.user = decoded;

    next();
  } catch (error: unknown) {
    const err = error as { statusCode?: number; message?: string };
    if (err.statusCode) {
      sendError(res, err.statusCode, err.message || "Invalid token");
      return;
    }
    sendError(res, 401, "Authentication failed");
  }
};

/** Optional auth: set req.user if valid token present, otherwise continue without user. */
export const optionalAuth = (
  req: AuthRequest,
  res: Response,
  next: NextFunction
): void => {
  try {
    const token = req.cookies?.access_token;
    if (!token) {
      next();
      return;
    }
    const decoded = verifyToken(token);
    req.user = decoded;
    next();
  } catch {
    next();
  }
};

