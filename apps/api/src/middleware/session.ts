import session from "express-session";
import MongoStore from "connect-mongo";
import type { RequestHandler } from "express";

const SESSION_MAX_AGE_MS = 1000 * 60 * 60 * 24 * 7; // 7 days

/**
 * Sessions live in Mongo (connect-mongo), not memory, so they survive a
 * restart and expire on their own via TTL matching the cookie's maxAge —
 * that's the "sensible handling of expired sessions" requirement, handled
 * by the store rather than hand-rolled expiry checks.
 */
export function createSessionMiddleware(mongoUri: string, secret: string, isProduction: boolean): RequestHandler {
  return session({
    secret,
    resave: false,
    saveUninitialized: false,
    store: MongoStore.create({
      mongoUrl: mongoUri,
      collectionName: "sessions",
      ttl: SESSION_MAX_AGE_MS / 1000,
    }),
    cookie: {
      httpOnly: true,
      secure: isProduction,
      // "Lax" only sends the cookie on top-level navigation across sites —
      // never on cross-origin fetch/XHR, which is exactly how the deployed
      // frontend (a different domain from the API) talks to this server.
      // "None" is required for that, and browsers only honor SameSite=None
      // when Secure is also set — which it already is in production.
      // Locally, frontend and API share "localhost" as their registrable
      // domain (only the port differs), so "Lax" is fine and safer there.
      sameSite: isProduction ? "none" : "lax",
      maxAge: SESSION_MAX_AGE_MS,
    },
  });
}
