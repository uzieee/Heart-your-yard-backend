import { Request, Response } from "express";
import { z } from "zod";
import { sendSuccess, sendError } from "@/utils/apiResponse";
import {
  registerUserService,
  checkUsernameAvailable,
  loginUserService,
} from "@/services/authService";
import { requestOTP, verifyOTP } from "@/services/otpService";
import { generateToken } from "@/utils/jwt";

// Validation schemas
const registerSchema = z.object({
  username: z
    .string()
    .min(3, "Username must be at least 3 characters")
    .max(30, "Username must be at most 30 characters")
    .regex(
      /^[a-zA-Z0-9_]+$/,
      "Username can only contain letters, numbers, and underscores"
    ),
  email: z.string().email("Invalid email address"),
  password: z
    .string()
    .min(8, "Password must be at least 8 characters")
    .regex(/[A-Z]/, "Password must contain at least one uppercase letter")
    .regex(/[a-z]/, "Password must contain at least one lowercase letter")
    .regex(/[0-9]/, "Password must contain at least one number"),
  image: z.string().optional(),
});

const checkUsernameSchema = z.object({
  username: z
    .string()
    .min(3, "Username must be at least 3 characters")
    .max(30, "Username must be at most 30 characters"),
});

export const registerUser = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    // Validate request body
    const parsed = registerSchema.safeParse(req.body);
    if (!parsed.success) {
      const fieldErrors: Record<string, string[]> = {};
      parsed.error.errors.forEach((err) => {
        const field = err.path.join(".");
        if (!fieldErrors[field]) fieldErrors[field] = [];
        fieldErrors[field].push(err.message);
      });
      sendError(res, 422, "Validation failed", fieldErrors);
      return;
    }

    const result = await registerUserService(parsed.data);
    sendSuccess(res, 200, "User registered successfully", result);
  } catch (error: unknown) {
    const err = error as { statusCode?: number; message?: string };
    if (err.statusCode) {
      sendError(res, err.statusCode, err.message || "Something went wrong");
      return;
    }
    console.error("Register error:", error);
    sendError(res, 500, "Internal server error");
  }
};

export const checkUsername = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    const parsed = checkUsernameSchema.safeParse(req.query);
    if (!parsed.success) {
      sendError(res, 422, "Invalid username provided");
      return;
    }

    const { username } = parsed.data;
    const available = await checkUsernameAvailable(username);

    sendSuccess(res, 200, available ? "Username is available" : "Username is already taken", {
      username,
      available,
    });
  } catch (error) {
    console.error("Check username error:", error);
    sendError(res, 500, "Internal server error");
  }
};

// OTP Validation schemas
const requestOTPSchema = z.object({
  email: z.string().email("Invalid email address"),
});

const verifyOTPSchema = z.object({
  email: z.string().email("Invalid email address"),
  otp: z.string().length(6, "OTP must be 6 digits").regex(/^\d+$/, "OTP must contain only numbers"),
});

export const requestOTPController = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    const parsed = requestOTPSchema.safeParse(req.body);
    if (!parsed.success) {
      const fieldErrors: Record<string, string[]> = {};
      parsed.error.errors.forEach((err) => {
        const field = err.path.join(".");
        if (!fieldErrors[field]) fieldErrors[field] = [];
        fieldErrors[field].push(err.message);
      });
      sendError(res, 422, "Validation failed", fieldErrors);
      return;
    }

    await requestOTP(parsed.data.email);
    sendSuccess(res, 200, "OTP sent successfully to your email");
  } catch (error: unknown) {
    const err = error as { statusCode?: number; message?: string };
    if (err.statusCode) {
      sendError(res, err.statusCode, err.message || "Something went wrong");
      return;
    }
    console.error("Request OTP error:", error);
    sendError(res, 500, "Internal server error");
  }
};

export const verifyOTPController = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    const parsed = verifyOTPSchema.safeParse(req.body);
    if (!parsed.success) {
      const fieldErrors: Record<string, string[]> = {};
      parsed.error.errors.forEach((err) => {
        const field = err.path.join(".");
        if (!fieldErrors[field]) fieldErrors[field] = [];
        fieldErrors[field].push(err.message);
      });
      sendError(res, 422, "Validation failed", fieldErrors);
      return;
    }

    const result = await verifyOTP(parsed.data.email, parsed.data.otp);
    sendSuccess(res, 200, result.message, { verified: result.verified });
  } catch (error: unknown) {
    const err = error as { statusCode?: number; message?: string };
    if (err.statusCode) {
      sendError(res, err.statusCode, err.message || "Something went wrong");
      return;
    }
    console.error("Verify OTP error:", error);
    sendError(res, 500, "Internal server error");
  }
};

// Login Validation schema
const loginSchema = z.object({
  email: z.string().email("Invalid email address"),
  password: z.string().min(1, "Password is required"),
});

export const loginUser = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    // Validate request body
    const parsed = loginSchema.safeParse(req.body);
    if (!parsed.success) {
      const fieldErrors: Record<string, string[]> = {};
      parsed.error.errors.forEach((err) => {
        const field = err.path.join(".");
        if (!fieldErrors[field]) fieldErrors[field] = [];
        fieldErrors[field].push(err.message);
      });
      sendError(res, 422, "Validation failed", fieldErrors);
      return;
    }

    const result = await loginUserService(parsed.data);

    // Generate JWT token
    const token = generateToken({
      userId: result.user.id,
      email: result.user.email,
      isOnboarded: result.user.is_onboarded,
    });

    // Set token in HTTP-only cookie
    res.cookie("access_token", token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
      path: "/",
    });

    sendSuccess(res, 200, "Login successful", {
      user: result.user,
      isOnboarded: result.user.is_onboarded,
      token, // Return token for client-side socket authentication
    });
  } catch (error: unknown) {
    const err = error as { statusCode?: number; message?: string };
    if (err.statusCode) {
      sendError(res, err.statusCode, err.message || "Something went wrong");
      return;
    }
    console.error("Login error:", error);
    sendError(res, 500, "Internal server error");
  }
};

export const logoutUser = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    // Clear the access_token cookie
    res.clearCookie("access_token", {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
    });

    sendSuccess(res, 200, "Logout successful");
  } catch (error: unknown) {
    console.error("Logout error:", error);
    sendError(res, 500, "Internal server error");
  }
};
