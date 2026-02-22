import jwt from "jsonwebtoken";
import dotenv from "dotenv";

dotenv.config();

const JWT_SECRET: string = process.env.JWT_SECRET || "your-secret-key-change-in-production";

export interface TokenPayload {
  userId: string;
  email: string;
  isOnboarded: boolean;
}

export const generateToken = (payload: TokenPayload): string => {
  if (!JWT_SECRET) {
    throw new Error("JWT_SECRET is not defined");
  }
  
  const expiresIn = process.env.JWT_EXPIRES_IN || "7d";
  
  // Type assertion to bypass StringValue type restriction
  return jwt.sign(payload, JWT_SECRET, {
    expiresIn: expiresIn as string | number,
  } as jwt.SignOptions);
};

export const verifyToken = (token: string): TokenPayload => {
  if (!JWT_SECRET) {
    throw { statusCode: 500, message: "JWT_SECRET is not configured" };
  }
  
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    return decoded as TokenPayload;
  } catch (error) {
    throw { statusCode: 401, message: "Invalid or expired token" };
  }
};

