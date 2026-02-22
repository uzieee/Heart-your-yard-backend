import multer from "multer";
import path from "path";
import fs from "fs";
import { Request } from "express";

// Ensure uploads directories exist
const uploadsDir = path.join(process.cwd(), "uploads");
const imagesDir = path.join(uploadsDir, "images");
const videosDir = path.join(uploadsDir, "videos");

[uploadsDir, imagesDir, videosDir].forEach((dir) => {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
});

// Storage for images
const imageStorage = multer.diskStorage({
  destination: (req: Request, file: Express.Multer.File, cb) => {
    cb(null, imagesDir);
  },
  filename: (req: Request, file: Express.Multer.File, cb) => {
    const uniqueSuffix = Date.now() + "-" + Math.round(Math.random() * 1e9);
    cb(
      null,
      "image-" + uniqueSuffix + path.extname(file.originalname)
    );
  },
});

// Storage for videos
const videoStorage = multer.diskStorage({
  destination: (req: Request, file: Express.Multer.File, cb) => {
    cb(null, videosDir);
  },
  filename: (req: Request, file: Express.Multer.File, cb) => {
    const uniqueSuffix = Date.now() + "-" + Math.round(Math.random() * 1e9);
    cb(
      null,
      "video-" + uniqueSuffix + path.extname(file.originalname)
    );
  },
});

// File filter for images
const imageFilter = (
  req: Request,
  file: Express.Multer.File,
  cb: multer.FileFilterCallback
) => {
  const allowedTypes = /jpeg|jpg|png|gif|webp/;
  const extname = allowedTypes.test(
    path.extname(file.originalname).toLowerCase()
  );
  const mimetype = allowedTypes.test(file.mimetype);

  if (mimetype && extname) {
    return cb(null, true);
  } else {
    cb(new Error("Only image files are allowed!"));
  }
};

// File filter for videos
const videoFilter = (
  req: Request,
  file: Express.Multer.File,
  cb: multer.FileFilterCallback
) => {
  const allowedTypes = /mp4|mov|avi|mkv|webm/;
  const extname = allowedTypes.test(
    path.extname(file.originalname).toLowerCase()
  );
  const mimetype = /video\//.test(file.mimetype);

  if (mimetype && extname) {
    return cb(null, true);
  } else {
    cb(new Error("Only video files are allowed!"));
  }
};

// Multer instances
export const uploadImage = multer({
  storage: imageStorage,
  limits: {
    fileSize: 20 * 1024 * 1024, // 20MB for images
  },
  fileFilter: imageFilter,
});

export const uploadVideo = multer({
  storage: videoStorage,
  limits: {
    fileSize: 200 * 1024 * 1024, // 200MB for videos
  },
  fileFilter: videoFilter,
});

// Combined upload for posts (can handle both images and videos)
export const uploadPostMedia = multer({
  storage: multer.diskStorage({
    destination: (req: Request, file: Express.Multer.File, cb) => {
      if (file.mimetype.startsWith('image/')) {
        cb(null, imagesDir);
      } else if (file.mimetype.startsWith('video/')) {
        cb(null, videosDir);
      } else {
        // Fallback to imagesDir if type is unknown (fileFilter will reject it anyway)
        cb(null, imagesDir);
      }
    },
    filename: (req: Request, file: Express.Multer.File, cb) => {
      const uniqueSuffix = Date.now() + "-" + Math.round(Math.random() * 1e9);
      const prefix = file.mimetype.startsWith('image/') ? 'image' : 'video';
      cb(
        null,
        prefix + "-" + uniqueSuffix + path.extname(file.originalname)
      );
    },
  }),
  limits: {
    fileSize: 200 * 1024 * 1024, // 200MB max for post media (images and videos)
  },
  fileFilter: (req: Request, file: Express.Multer.File, cb: multer.FileFilterCallback) => {
    if (file.mimetype.startsWith('image/')) {
      const allowedTypes = /jpeg|jpg|png|gif|webp/;
      const extname = allowedTypes.test(
        path.extname(file.originalname).toLowerCase()
      );
      if (extname) {
        return cb(null, true);
      }
    } else if (file.mimetype.startsWith('video/')) {
      const allowedTypes = /mp4|mov|avi|mkv|webm/;
      const extname = allowedTypes.test(
        path.extname(file.originalname).toLowerCase()
      );
      if (extname) {
        return cb(null, true);
      }
    }
    cb(new Error("Only image and video files are allowed!"));
  },
});

// Keep the old upload for backward compatibility (onboarding images)
export const upload = uploadImage;
