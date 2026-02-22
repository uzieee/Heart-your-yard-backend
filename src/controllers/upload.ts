import { Response } from "express";
import { sendSuccess, sendError } from "@/utils/apiResponse";
import { AuthRequest } from "@/middleware/authMiddleware";
import { upload } from "@/utils/upload";

export const uploadImage = async (
  req: AuthRequest,
  res: Response
): Promise<void> => {
  try {
    if (!req.user) {
      sendError(res, 401, "Authentication required");
      return;
    }

    if (!req.file) {
      sendError(res, 400, "No file uploaded");
      return;
    }

    // Return the path where Multer saved the file (uploads/images/) so retrieval works from same location
    const filePath = `/uploads/images/${req.file.filename}`;

    sendSuccess(res, 200, "Image uploaded successfully", {
      imageUrl: filePath,
      filename: req.file.filename,
    });
  } catch (error: unknown) {
    console.error("Upload error:", error);
    sendError(res, 500, "Internal server error");
  }
};

// Middleware wrapper for multer
export const uploadMiddleware = upload.single("image");







