import { Router } from "express";
import { authenticateToken } from "@/middleware/authMiddleware";
import {
  getUsers,
  getCurrentUser,
  getProfileHeader,
  getProfileAbout,
  updateProfileAbout,
} from "@/controllers/users";
import { uploadUserImage, uploadUserImagesMultiple, getMyImages } from "@/controllers/userImages";
import { upload } from "@/utils/upload";

const usersRouter = Router();

usersRouter.use(authenticateToken); // All routes require authentication

usersRouter.get("/", getUsers);
usersRouter.get("/me", getCurrentUser);
usersRouter.get("/me/profile-header", getProfileHeader);
usersRouter.get("/me/profile-about", getProfileAbout);
usersRouter.patch("/me/profile-about", updateProfileAbout);

usersRouter.get("/me/images", getMyImages);
usersRouter.post("/me/images/upload", upload.single("image"), uploadUserImage);
usersRouter.post("/me/images/upload-multiple", upload.array("images", 20), uploadUserImagesMultiple);

export default usersRouter;




