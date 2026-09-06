import { Router } from "express";
import { z } from "zod";
import { ObjectId } from "mongodb";
import { getDb } from "../db/mongo.js";
import type { UserDoc } from "../db/models.js";
import { hashPassword, verifyPassword } from "../lib/password.js";
import { HttpError } from "../lib/http-error.js";

const router = Router();

const CredentialsSchema = z.object({
  email: z.string().trim().toLowerCase().email("Enter a valid email address"),
  password: z.string().min(8, "Password must be at least 8 characters"),
});

function parseCredentials(body: unknown) {
  const parsed = CredentialsSchema.safeParse(body);
  if (!parsed.success) {
    throw new HttpError(400, "INVALID_INPUT", parsed.error.issues[0]?.message ?? "Invalid email or password");
  }
  return parsed.data;
}

router.post("/register", async (req, res, next) => {
  try {
    const { email, password } = parseCredentials(req.body);
    const users = getDb().collection<UserDoc>("users");

    const existing = await users.findOne({ email });
    if (existing) {
      throw new HttpError(409, "EMAIL_TAKEN", "An account with that email already exists");
    }

    const passwordHash = await hashPassword(password);
    const result = await users.insertOne({ email, passwordHash, createdAt: new Date() });

    req.session.userId = result.insertedId.toString();
    res.status(201).json({ user: { id: result.insertedId.toString(), email } });
  } catch (err) {
    next(err);
  }
});

router.post("/login", async (req, res, next) => {
  try {
    const { email, password } = parseCredentials(req.body);
    const users = getDb().collection<UserDoc>("users");
    const user = await users.findOne({ email });

    // Same error for "no such user" and "wrong password" — a login response can't be used to enumerate accounts.
    if (!user || !(await verifyPassword(password, user.passwordHash))) {
      throw new HttpError(401, "INVALID_CREDENTIALS", "Incorrect email or password");
    }

    req.session.userId = user._id!.toString();
    res.json({ user: { id: user._id!.toString(), email: user.email } });
  } catch (err) {
    next(err);
  }
});

router.post("/logout", (req, res, next) => {
  req.session.destroy((err) => {
    if (err) {
      next(err);
      return;
    }
    res.clearCookie("connect.sid");
    res.status(204).end();
  });
});

router.get("/me", async (req, res, next) => {
  try {
    if (!req.session.userId) {
      res.json({ user: null });
      return;
    }

    const users = getDb().collection<UserDoc>("users");
    const user = await users.findOne({ _id: new ObjectId(req.session.userId) });
    if (!user) {
      // The session points at a user that no longer exists — treat it as signed out.
      req.session.destroy(() => undefined);
      res.json({ user: null });
      return;
    }

    res.json({ user: { id: user._id!.toString(), email: user.email } });
  } catch (err) {
    next(err);
  }
});

export default router;
