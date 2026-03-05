import { Router } from "express";
import { updateUserPremium } from "@/controllers/admin";

const adminRouter = Router();

// Admin routes - no authentication required for now (you can add admin auth later)
adminRouter.patch("/users/premium", updateUserPremium);

export default adminRouter;

