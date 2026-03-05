import { Response } from "express";
import { sendSuccess, sendError } from "@/utils/apiResponse";
import { AuthRequest } from "@/middleware/authMiddleware";
import {
  addUserImage,
  listUserImages,
  listUserImagesPaginated,
  type UserImageType,
} from "@/services/userImagesService";

const allowedTypes: UserImageType[] = ["profile", "banner", "gallery"];

function getImageUrlFromFile(filename: string): string {
  return `/uploads/images/${filename}`;
}

/** POST /users/me/images/upload - single file; type in body (profile | banner | gallery). For profile/banner sets as primary. */
export const uploadUserImage = async (
  req: AuthRequest,
  res: Response
): Promise<void> => {
  try {
    if (!req.user) {
      sendError(res, 401, "Authentication required");
      return;
    }
    const type = (req.body?.type as string) || "gallery";
    if (!allowedTypes.includes(type as UserImageType)) {
      sendError(res, 400, "Invalid type. Use profile, banner, or gallery");
      return;
    }
    if (!req.file) {
      sendError(res, 400, "No file uploaded");
      return;
    }
    const imageUrl = getImageUrlFromFile(req.file.filename);
    const isPrimary = type === "profile" || type === "banner";
    const record = await addUserImage(
      req.user.userId,
      type as UserImageType,
      imageUrl,
      isPrimary
    );
    sendSuccess(res, 200, "Image uploaded successfully", {
      id: record.id,
      type: record.type,
      imageUrl: record.image_url,
      isPrimary: record.is_primary,
    });
  } catch (error: unknown) {
    const err = error as { statusCode?: number; message?: string };
    if (err.statusCode) sendError(res, err.statusCode, err.message || "Error");
    else {
      console.error("Upload user image error:", error);
      sendError(res, 500, "Internal server error");
    }
  }
};

/** POST /users/me/images/upload-multiple - multiple files; type in body (gallery only or all). */
export const uploadUserImagesMultiple = async (
  req: AuthRequest,
  res: Response
): Promise<void> => {
  try {
    if (!req.user) {
      sendError(res, 401, "Authentication required");
      return;
    }
    const type = ((req.body?.type as string) || "gallery") as UserImageType;
    if (!allowedTypes.includes(type)) {
      sendError(res, 400, "Invalid type. Use profile, banner, or gallery");
      return;
    }
    const files = (req.files as Express.Multer.File[]) || [];
    if (files.length === 0) {
      sendError(res, 400, "No files uploaded");
      return;
    }
    const results: { id: string; imageUrl: string; isPrimary: boolean }[] = [];
    const isPrimary = type !== "gallery" && files.length > 0;
    for (let i = 0; i < files.length; i++) {
      const imageUrl = getImageUrlFromFile(files[i].filename);
      const record = await addUserImage(
        req.user.userId,
        type,
        imageUrl,
        isPrimary && i === 0
      );
      results.push({
        id: record.id,
        imageUrl: record.image_url,
        isPrimary: record.is_primary,
      });
    }
    sendSuccess(res, 200, "Images uploaded successfully", { images: results });
  } catch (error: unknown) {
    const err = error as { statusCode?: number; message?: string };
    if (err.statusCode) sendError(res, err.statusCode, err.message || "Error");
    else {
      console.error("Upload user images error:", error);
      sendError(res, 500, "Internal server error");
    }
  }
};

/** GET /users/me/images?type=profile|banner|gallery&limit=10&cursor=0 - list current user's images. Pagination for gallery. */
export const getMyImages = async (
  req: AuthRequest,
  res: Response
): Promise<void> => {
  try {
    if (!req.user) {
      sendError(res, 401, "Authentication required");
      return;
    }
    const type = req.query.type as UserImageType | undefined;
    if (type != null && !allowedTypes.includes(type)) {
      sendError(res, 400, "Invalid type. Use profile, banner, or gallery");
      return;
    }
    const limitStr = req.query.limit as string | undefined;
    const cursor = (req.query.cursor as string) || null;
    const limit = limitStr != null ? parseInt(limitStr, 10) : null;
    const usePaginated = type === "gallery" && limit != null && !Number.isNaN(limit) && limit > 0;

    if (usePaginated) {
      const pageSize = Math.min(limit, 50);
      const result = await listUserImagesPaginated(req.user.userId, type, pageSize, cursor);
      sendSuccess(res, 200, "Images fetched successfully", {
        images: result.images.map((img) => ({
          id: img.id,
          type: img.type,
          imageUrl: img.image_url,
          isPrimary: img.is_primary,
          createdAt: img.created_at,
        })),
        nextCursor: result.nextCursor,
        hasMore: result.hasMore,
      });
      return;
    }

    const images = await listUserImages(req.user.userId, type);
    sendSuccess(res, 200, "Images fetched successfully", {
      images: images.map((img) => ({
        id: img.id,
        type: img.type,
        imageUrl: img.image_url,
        isPrimary: img.is_primary,
        createdAt: img.created_at,
      })),
      nextCursor: null,
      hasMore: false,
    });
  } catch (error: unknown) {
    const err = error as { statusCode?: number; message?: string };
    if (err.statusCode) sendError(res, err.statusCode, err.message || "Error");
    else {
      console.error("Get my images error:", error);
      sendError(res, 500, "Internal server error");
    }
  }
};

