import express, { type Express } from "express";
import cors from "cors";
import { buildKit } from "@prep-kit/core";
import { createSessionMiddleware } from "./middleware/session.js";
import { errorHandler } from "./middleware/error-handler.js";
import { HttpError } from "./lib/http-error.js";
import authRouter from "./routes/auth.js";
import { createKitsRouter } from "./routes/kits.js";
import type { BuildKitFn } from "./jobs/generate-kit.js";
import type { Env } from "./config/env.js";

export interface CreateAppOptions {
  /** Overridable for tests, so hitting the real HTTP routes never triggers a live Gemini call. */
  buildKitFn?: BuildKitFn;
}

export function createApp(env: Env, options: CreateAppOptions = {}): Express {
  const app = express();
  const buildKitFn = options.buildKitFn ?? buildKit;

  // Needed for secure cookies to work correctly behind a platform's reverse proxy (Render/Railway/Fly/etc.).
  app.set("trust proxy", 1);

  app.use(cors({ origin: env.FRONTEND_URL, credentials: true }));
  app.use(express.json({ limit: "1mb" }));
  app.use(createSessionMiddleware(env.MONGODB_URI, env.SESSION_SECRET, env.NODE_ENV === "production"));

  app.get("/api/health", (_req, res) => res.json({ ok: true }));
  app.use("/api/auth", authRouter);
  app.use("/api/kits", createKitsRouter(buildKitFn));

  app.use((_req, _res, next) => next(new HttpError(404, "NOT_FOUND", "Route not found")));
  app.use(errorHandler);

  return app;
}
