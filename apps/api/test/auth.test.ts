import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { MongoMemoryServer } from "mongodb-memory-server";
import request from "supertest";
import type { Express } from "express";
import { connectToMongo, closeMongo, getDb } from "../src/db/mongo.js";
import { createApp } from "../src/app.js";
import type { Env } from "../src/config/env.js";

let mongod: MongoMemoryServer;
let app: Express;

beforeAll(async () => {
  mongod = await MongoMemoryServer.create();
  const uri = mongod.getUri();
  await connectToMongo(uri);

  const env: Env = {
    MONGODB_URI: uri,
    SESSION_SECRET: "test-session-secret-not-for-production-use",
    PORT: 0,
    NODE_ENV: "test",
    FRONTEND_URL: "http://localhost:3000",
  };
  app = createApp(env);
}, 60_000);

afterAll(async () => {
  await closeMongo();
  await mongod.stop();
});

afterEach(async () => {
  await getDb().collection("users").deleteMany({});
});

describe("POST /api/auth/register", () => {
  it("registers a new user, starts a session, and returns the user", async () => {
    const res = await request(app).post("/api/auth/register").send({ email: "a@example.com", password: "password123" });
    expect(res.status).toBe(201);
    expect(res.body.user.email).toBe("a@example.com");
    expect(res.headers["set-cookie"]).toBeDefined();
  });

  it("rejects a password under 8 characters", async () => {
    const res = await request(app).post("/api/auth/register").send({ email: "a@example.com", password: "short" });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("INVALID_INPUT");
  });

  it("rejects a duplicate email", async () => {
    await request(app).post("/api/auth/register").send({ email: "dup@example.com", password: "password123" });
    const res = await request(app).post("/api/auth/register").send({ email: "dup@example.com", password: "password123" });
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe("EMAIL_TAKEN");
  });
});

describe("POST /api/auth/login", () => {
  it("logs in with correct credentials", async () => {
    await request(app).post("/api/auth/register").send({ email: "b@example.com", password: "password123" });
    const res = await request(app).post("/api/auth/login").send({ email: "b@example.com", password: "password123" });
    expect(res.status).toBe(200);
    expect(res.body.user.email).toBe("b@example.com");
  });

  it("rejects an incorrect password", async () => {
    await request(app).post("/api/auth/register").send({ email: "b@example.com", password: "password123" });
    const res = await request(app).post("/api/auth/login").send({ email: "b@example.com", password: "wrongpassword" });
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe("INVALID_CREDENTIALS");
  });

  it("returns the same error for a non-existent account as for a wrong password", async () => {
    const res = await request(app).post("/api/auth/login").send({ email: "nobody@example.com", password: "password123" });
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe("INVALID_CREDENTIALS");
  });
});

describe("session persistence", () => {
  it("keeps a session across requests via the cookie, reflected in /me", async () => {
    const agent = request.agent(app);
    await agent.post("/api/auth/register").send({ email: "c@example.com", password: "password123" });

    const me = await agent.get("/api/auth/me");
    expect(me.status).toBe(200);
    expect(me.body.user.email).toBe("c@example.com");
  });

  it("/me reports signed-out (not an error) when there is no session", async () => {
    const res = await request(app).get("/api/auth/me");
    expect(res.status).toBe(200);
    expect(res.body.user).toBeNull();
  });

  it("logout ends the session so /me goes back to signed-out", async () => {
    const agent = request.agent(app);
    await agent.post("/api/auth/register").send({ email: "d@example.com", password: "password123" });
    await agent.post("/api/auth/logout").expect(204);

    const me = await agent.get("/api/auth/me");
    expect(me.body.user).toBeNull();
  });
});

describe("unknown routes", () => {
  it("returns a structured 404 rather than an HTML error page", async () => {
    const res = await request(app).get("/api/does-not-exist");
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe("NOT_FOUND");
  });
});
