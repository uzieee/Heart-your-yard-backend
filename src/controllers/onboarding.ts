import { Response } from "express";
import { z } from "zod";
import { sendSuccess, sendError } from "@/utils/apiResponse";
import {
  createOrUpdateOnboarding,
  completeOnboarding,
} from "@/services/onboardingService";
import { AuthRequest } from "@/middleware/authMiddleware";

// Validation schema
const onboardingSchema = z.object({
  dateOfBirth: z.string().optional().nullable(),
  address: z.string().optional().nullable(),
  pinLocation: z
    .object({
      lat: z.number(),
      lng: z.number(),
    })
    .optional()
    .nullable(),
  gardenType: z.string().optional().nullable(),
  experienceLevel: z.string().optional().nullable(),
  gardenSpace: z.string().optional().nullable(),
  plantsMaintain: z.number().optional().nullable(),
  sharingPreference: z.string().optional().nullable(),
  safetyDeclaration: z.boolean().optional().nullable(),
  image: z.string().optional().nullable(),
});

export const saveOnboarding = async (
  req: AuthRequest,
  res: Response
): Promise<void> => {
  try {
    if (!req.user) {
      sendError(res, 401, "Authentication required");
      return;
    }

    const parsed = onboardingSchema.safeParse(req.body);
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

    const result = await createOrUpdateOnboarding({
      userId: req.user.userId,
      ...parsed.data,
    });

    sendSuccess(res, 200, "Onboarding data saved successfully", result);
  } catch (error: unknown) {
    const err = error as { statusCode?: number; message?: string };
    if (err.statusCode) {
      sendError(res, err.statusCode, err.message || "Something went wrong");
      return;
    }
    console.error("Save onboarding error:", error);
    sendError(res, 500, "Internal server error");
  }
};

export const completeOnboardingController = async (
  req: AuthRequest,
  res: Response
): Promise<void> => {
  try {
    if (!req.user) {
      sendError(res, 401, "Authentication required");
      return;
    }

    const result = await completeOnboarding(req.user.userId);

    // Set new token in cookie
    res.cookie("access_token", result.token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
      path: "/",
    });

    sendSuccess(res, 200, "Onboarding completed successfully", {
      user: result.user,
      isOnboarded: true,
    });
  } catch (error: unknown) {
    const err = error as { statusCode?: number; message?: string };
    if (err.statusCode) {
      sendError(res, err.statusCode, err.message || "Something went wrong");
      return;
    }
    console.error("Complete onboarding error:", error);
    sendError(res, 500, "Internal server error");
  }
};







