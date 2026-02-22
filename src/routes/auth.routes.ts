import { Router } from "express";
import {
  registerUser,
  checkUsername,
  requestOTPController,
  verifyOTPController,
  loginUser,
  logoutUser,
} from "@/controllers/auth";

const authRouter = Router();

authRouter.post("/register", registerUser);
authRouter.post("/login", loginUser);
authRouter.post("/logout", logoutUser);
authRouter.get("/check-username", checkUsername);
authRouter.post("/request-otp", requestOTPController);
authRouter.post("/verify-otp", verifyOTPController);

export default authRouter;


