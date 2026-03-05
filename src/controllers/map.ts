import { Response } from "express";
import { sendError, sendSuccess } from "@/utils/apiResponse";
import { AuthRequest } from "@/middleware/authMiddleware";

const NOMINATIM_BASE = "https://nominatim.openstreetmap.org";

const REQUEST_HEADERS = {
  "User-Agent": "GardeningApp/1.0 (location-search)",
  Accept: "application/json",
} as const;

export const reverseGeocode = async (
  req: AuthRequest,
  res: Response
): Promise<void> => {
  try {
    const lat = Number(req.query.lat);
    const lng = Number(req.query.lng);

    if (Number.isNaN(lat) || Number.isNaN(lng)) {
      sendError(res, 400, "lat and lng query params are required");
      return;
    }

    const params = new URLSearchParams({
      format: "json",
      lat: String(lat),
      lon: String(lng),
      zoom: "18",
      addressdetails: "1",
    });

    const response = await fetch(`${NOMINATIM_BASE}/reverse?${params.toString()}`, {
      headers: REQUEST_HEADERS,
    });

    if (!response.ok) {
      sendError(res, 502, "Failed to resolve location");
      return;
    }

    const data = (await response.json()) as { display_name?: string };
    sendSuccess(res, 200, "Location resolved", {
      address: data?.display_name || `${lat.toFixed(6)}, ${lng.toFixed(6)}`,
      lat,
      lng,
    });
  } catch (error) {
    console.error("Reverse geocode error:", error);
    sendError(res, 500, "Internal server error");
  }
};

export const searchGeocode = async (
  req: AuthRequest,
  res: Response
): Promise<void> => {
  try {
    const q = String(req.query.q || "").trim();
    if (!q) {
      sendError(res, 400, "q query param is required");
      return;
    }

    const params = new URLSearchParams({
      format: "json",
      q,
      limit: "1",
      addressdetails: "1",
    });

    const response = await fetch(`${NOMINATIM_BASE}/search?${params.toString()}`, {
      headers: REQUEST_HEADERS,
    });

    if (!response.ok) {
      sendError(res, 502, "Failed to search location");
      return;
    }

    const rows = (await response.json()) as Array<{
      lat: string;
      lon: string;
      display_name?: string;
    }>;

    if (!rows.length) {
      sendSuccess(res, 200, "Location not found", null);
      return;
    }

    const first = rows[0];
    const lat = Number(first.lat);
    const lng = Number(first.lon);
    sendSuccess(res, 200, "Location found", {
      address: first.display_name || q,
      lat,
      lng,
    });
  } catch (error) {
    console.error("Search geocode error:", error);
    sendError(res, 500, "Internal server error");
  }
};

