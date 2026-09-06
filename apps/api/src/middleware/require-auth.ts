import type { RequestHandler } from "express";
import { HttpError } from "../lib/http-error.js";

/** A signed-out visitor must not reach anything behind this — Section 1's core auth requirement. */
export const requireAuth: RequestHandler = (req, _res, next) => {
  if (!req.session.userId) {
    next(new HttpError(401, "UNAUTHENTICATED", "You must be logged in to do that"));
    return;
  }
  next();
};
