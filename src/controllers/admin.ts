import { Request, Response } from "express";
import { z } from "zod";
import { sendSuccess, sendError } from "@/utils/apiResponse";
import { updateUserPremiumService } from "@/services/adminService";

// Validation schema
const updateUserPremiumSchema = z.object({
  email: z.string().email("Invalid email address"),
  is_premium: z.boolean(),
});

export const updateUserPremium = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    const parsed = updateUserPremiumSchema.safeParse(req.body);
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

    await updateUserPremiumService({
      email: parsed.data.email,
      isPremium: parsed.data.is_premium,
    });

    sendSuccess(
      res,
      200,
      `User premium status updated successfully. User is now ${parsed.data.is_premium ? "PREMIUM" : "FREE"}.`
    );
  } catch (error: unknown) {
    const err = error as { statusCode?: number; message?: string };
    if (err.statusCode) {
      sendError(res, err.statusCode, err.message || "Something went wrong");
      return;
    }
    console.error("Update user premium error:", error);
    sendError(res, 500, "Internal server error");
  }
};

