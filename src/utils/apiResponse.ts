import { Response } from "express";
import { ApiResponse } from "@/interface/types";

export const sendSuccess = <T>(
  res: Response,
  statusCode: number,
  message: string,
  data: T | null = null
): Response => {
  const response: ApiResponse<T> = {
    success: true,
    message,
    data,
    statusCode,
  };
  return res.status(statusCode).json(response);
};

export const sendError = (
  res: Response,
  statusCode: number,
  message: string,
  errors?: Record<string, string[]>
): Response => {
  return res.status(statusCode).json({
    success: false,
    message,
    data: null,
    statusCode,
    ...(errors && { errors }),
  });
};








