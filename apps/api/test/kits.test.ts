import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { MongoMemoryServer } from "mongodb-memory-server";
import request from "supertest";
import type { Express } from "express";
import type { Kit } from "@prep-kit/schema";
import { validateKit } from "@prep-kit/schema";
import type { BuildKitInput, BuildKitResult } from "@prep-kit/core";
import { connectToMongo, closeMongo, getDb, ObjectId } from "../src/db/mongo.js";
import { createApp } from "../src/app.js";
import { runGeneration } from "../src/jobs/generate-kit.js";
import type { Env } from "../src/config/env.js";
import type { KitDoc } from "../src/db/models.js";

/**
 * Inserts a kit doc directly, bypassing POST /api/kits — that route always
 * fires its own background runGeneration using the app's bound buildKitFn,
 * which would race the explicit runGeneration call these lifecycle tests
 * make with a *different* fake (the concurrency guard in runGeneration
 * would then just no-op the second call against the same kit id).
 */
async function insertPendingKit(userId: ObjectId, input: { jd: string; companyUrl: string; days: number }) {
  const now = new Date();
  const doc: KitDoc = {
    userId,
    status: "pending",
    progress: { step: "Queued" },
    input,
    kit: null,
    research: null,
    warnings: [],
    error: null,
    dedupeKey: `test-${Math.random()}`,
    practice: {},
    createdAt: now,
    updatedAt: now,
  };
  const result = await getDb().collection<KitDoc>("kits").insertOne(doc);
  return result.insertedId;
}

let mongod: MongoMemoryServer;
let app: Express;

function fakeKit(company: string, days: number): Kit {
  return {
    source: {
      company,
      company_url: "https://acme.example.com",
      role: "Software Engineer",
      location: "Remote",
      jd_chars: 42,
      researched_at: new Date().toISOString(),
      pages_used: [],
    },
    company_brief: { summary: "A widget company.", what_they_do: "Makes widgets.", sources: [] },
    role: {
      title: "Software Engineer",
      seniority: "Mid",
      responsibilities: ["Ship things"],
      requirements: [{ id: "r1", text: "Knows TypeScript", kind: "technical", priority: "must" }],
    },
    questions: [
      { id: "q1", requirement_ids: ["r1"], category: "technical", prompt: "What is TS?", answer_outline: "A typed superset of JS.", difficulty: 1 },
    ],
    flashcards: [{ id: "f1", front: "TS?", back: "Typed JS", requirement_ids: ["r1"] }],
    schedule: {
      days_available: days,
      days: Array.from({ length: days }, (_, i) => ({
        day: i + 1,
        focus: i === 0 ? "Technical deep-dive" : "Review",
        question_ids: i === 0 ? ["q1"] : [],
        minutes: i === 0 ? 15 : 0,
      })),
    },
    coverage: { uncovered_requirement_ids: [], passes: 1 },
  };
}

async function succeedingBuildKit(input: BuildKitInput): Promise<BuildKitResult> {
  input.onProgress?.("Doing the thing");
  return {
    kit: fakeKit("Acme", input.daysAvailable),
    warnings: ["no public discussion of this company's interview process was found"],
    research: { hiringSignals: "", briefPages: [], searchSnippets: [] },
  };
}

async function failingBuildKit(): Promise<BuildKitResult> {
  throw new Error("simulated generation failure");
}

async function registerAgent(email: string) {
  const agent = request.agent(app);
  const res = await agent.post("/api/auth/register").send({ email, password: "password123" }).expect(201);
  return { agent, userId: new ObjectId(res.body.user.id as string) };
}

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
  app = createApp(env, { buildKitFn: succeedingBuildKit });
}, 60_000);

afterAll(async () => {
  await closeMongo();
  await mongod.stop();
});

afterEach(async () => {
  await getDb().collection("users").deleteMany({});
  await getDb().collection("kits").deleteMany({});
});

describe("POST /api/kits", () => {
  it("requires auth", async () => {
    const res = await request(app).post("/api/kits").send({ jd: "x", company_url: "https://acme.example.com", days: 3 });
    expect(res.status).toBe(401);
  });

  it("validates the request body", async () => {
    const { agent } = await registerAgent("a@example.com");
    const res = await agent.post("/api/kits").send({ jd: "", company_url: "https://acme.example.com", days: 3 });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("INVALID_INPUT");
  });

  it("rejects an out-of-range days value", async () => {
    const { agent } = await registerAgent("a@example.com");
    const res = await agent.post("/api/kits").send({ jd: "JD text", company_url: "https://acme.example.com", days: 0 });
    expect(res.status).toBe(400);
  });

  it("creates a kit doc immediately with status pending, without waiting for generation", async () => {
    const { agent } = await registerAgent("a@example.com");
    const res = await agent.post("/api/kits").send({ jd: "JD text", company_url: "https://acme.example.com", days: 3 });
    expect(res.status).toBe(202);
    expect(res.body.kit.status).toBe("pending");
    expect(res.body.duplicate).toBe(false);
  });

  it("returns the existing kit on a duplicate submission instead of creating a second one", async () => {
    const { agent } = await registerAgent("a@example.com");
    const first = await agent.post("/api/kits").send({ jd: "Same JD", company_url: "https://acme.example.com", days: 3 });
    const second = await agent.post("/api/kits").send({ jd: "Same JD", company_url: "https://acme.example.com", days: 3 });

    expect(second.status).toBe(200);
    expect(second.body.duplicate).toBe(true);
    expect(second.body.kit.id).toBe(first.body.kit.id);

    const all = await agent.get("/api/kits");
    expect(all.body.kits).toHaveLength(1);
  });
});

describe("generation lifecycle (kit doc inserted directly, runGeneration awaited explicitly)", () => {
  it("transitions a kit to ready with the generated content on success", async () => {
    const { agent, userId } = await registerAgent("gen@example.com");
    const kitId = await insertPendingKit(userId, { jd: "JD", companyUrl: "https://acme.example.com", days: 4 });

    await runGeneration(kitId, succeedingBuildKit);

    const detail = await agent.get(`/api/kits/${kitId.toString()}`);
    expect(detail.body.status).toBe("ready");
    expect(detail.body.kit.source.company).toBe("Acme");
    expect(detail.body.kit.schedule.days_available).toBe(4);
    expect(detail.body.warnings).toContain("no public discussion of this company's interview process was found");
    expect(validateKit(detail.body.kit).valid).toBe(true);
  });

  it("transitions a kit to failed with a structured error when generation throws", async () => {
    const { agent, userId } = await registerAgent("fail@example.com");
    const kitId = await insertPendingKit(userId, { jd: "JD", companyUrl: "https://acme.example.com", days: 2 });

    await runGeneration(kitId, failingBuildKit);

    const detail = await agent.get(`/api/kits/${kitId.toString()}`);
    expect(detail.body.status).toBe("failed");
    expect(detail.body.error.code).toBe("GENERATION_FAILED");
    expect(detail.body.kit).toBeNull();
  });
});

describe("ownership", () => {
  it("returns 404 (not 403) for another user's kit", async () => {
    const { agent: owner } = await registerAgent("owner@example.com");
    const created = await owner.post("/api/kits").send({ jd: "JD", company_url: "https://acme.example.com", days: 3 });
    const kitId = created.body.kit.id as string;

    const { agent: intruder } = await registerAgent("intruder@example.com");
    const res = await intruder.get(`/api/kits/${kitId}`);
    expect(res.status).toBe(404);
  });

  it("GET /api/kits only lists the current user's kits", async () => {
    const { agent: a } = await registerAgent("listA@example.com");
    await a.post("/api/kits").send({ jd: "JD 1", company_url: "https://acme.example.com", days: 3 });

    const { agent: b } = await registerAgent("listB@example.com");
    await b.post("/api/kits").send({ jd: "JD 2", company_url: "https://other.example.com", days: 2 });

    const resA = await a.get("/api/kits");
    expect(resA.body.kits).toHaveLength(1);
    expect(resA.body.kits[0].input.jd).toBe("JD 1");
  });
});

describe("POST /api/kits/batch", () => {
  it("creates one kit per case", async () => {
    const { agent } = await registerAgent("batch@example.com");
    const res = await agent.post("/api/kits/batch").send({
      cases: [
        { jd: "JD one", company_url: "https://acme.example.com", days: 3 },
        { jd: "JD two", company_url: "https://other.example.com", days: 5 },
      ],
    });
    expect(res.status).toBe(202);
    expect(res.body.kits).toHaveLength(2);

    const all = await agent.get("/api/kits");
    expect(all.body.kits).toHaveLength(2);
  });

  it("rejects an empty batch", async () => {
    const { agent } = await registerAgent("batch2@example.com");
    const res = await agent.post("/api/kits/batch").send({ cases: [] });
    expect(res.status).toBe(400);
  });
});

describe("GET /api/kits/:id/stream", () => {
  it("sends the current status immediately and closes when already ready", async () => {
    const { agent, userId } = await registerAgent("stream@example.com");
    const kitId = await insertPendingKit(userId, { jd: "JD", companyUrl: "https://acme.example.com", days: 3 });

    await runGeneration(kitId, succeedingBuildKit);

    const res = await agent.get(`/api/kits/${kitId.toString()}/stream`);
    expect(res.status).toBe(200);
    expect(res.headers["content-type"]).toMatch(/text\/event-stream/);
    expect(res.text).toContain('"status":"ready"');
  });
});
