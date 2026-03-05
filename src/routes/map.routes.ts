import { Router } from "express";
import { authenticateToken } from "@/middleware/authMiddleware";
import { reverseGeocode, searchGeocode } from "@/controllers/map";

const mapRouter = Router();

mapRouter.use(authenticateToken);
mapRouter.get("/reverse", reverseGeocode);
mapRouter.get("/search", searchGeocode);

export default mapRouter;

