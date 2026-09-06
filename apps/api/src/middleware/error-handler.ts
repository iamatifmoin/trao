import type { ErrorRequestHandler } from "express";
import { HttpError } from "../lib/http-error.js";

/** Every error response — expected or not — comes back as { error: { code, message } }, matching the batch CLI's error shape. */
export const errorHandler: ErrorRequestHandler = (err, _req, res, _next) => {
  if (err instanceof HttpError) {
    res.status(err.status).json({ error: { code: err.code, message: err.message } });
    return;
  }

  console.error(err);
  res.status(500).json({ error: { code: "INTERNAL_ERROR", message: "Something went wrong" } });
};
