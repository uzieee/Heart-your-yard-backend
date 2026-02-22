import { Router } from "express";
import {
  saveOnboarding,
  completeOnboardingController,
} from "@/controllers/onboarding";
import { uploadImage, uploadMiddleware } from "@/controllers/upload";
import { authenticateToken } from "@/middleware/authMiddleware";

const onboardingRouter = Router();

// All routes require authentication
onboardingRouter.use(authenticateToken);

onboardingRouter.post("/save", saveOnboarding);
onboardingRouter.post("/complete", completeOnboardingController);
onboardingRouter.post("/upload-image", uploadMiddleware, uploadImage);

export default onboardingRouter;







