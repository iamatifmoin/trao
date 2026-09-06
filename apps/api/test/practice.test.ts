import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { MongoMemoryServer } from "mongodb-memory-server";
import request from "supertest";
import type { Express } from "express";
import type { Kit } from "@prep-kit/schema";
import type { BuildKitInput, BuildKitResult } from "@prep-kit/core";
import { connectToMongo, closeMongo, getDb, ObjectId } from "../src/db/mongo.js";
import { createApp } from "../src/app.js";
import { runGeneration } from "../src/jobs/generate-kit.js";
import type { Env } from "../src/config/env.js";
import type { KitDoc } from "../src/db/models.js";

let mongod: MongoMemoryServer;
let app: Express;

function fakeKit(): Kit {
  return {
    source: { company: "Acme", company_url: "https://acme.example.com", role: "Engineer", location: "Remote", jd_chars: 10, researched_at: new Date().toISOString(), pages_used: [] },
    company_brief: { summary: "s", what_they_do: "d", sources: [] },
    role: {
      title: "Engineer",
      seniority: "Mid",
      responsibilities: [],
      requirements: [
        { id: "r1", text: "React", kind: "technical", priority: "must" },
        { id: "r2", text: "Mentoring", kind: "behavioural", priority: "nice" },
      ],
    },
    questions: [],
    flashcards: [
      { id: "f1", front: "React?", back: "A UI library", requirement_ids: ["r1"] },
      { id: "f2", front: "Mentoring?", back: "Helping juniors grow", requirement_ids: ["r2"] },
    ],
    schedule: { days_available: 1, days: [{ day: 1, focus: "Review", question_ids: [], minutes: 0 }] },
    coverage: { uncovered_requirement_ids: [], passes: 1 },
  };
}

async function succeedingBuildKit(input: BuildKitInput): Promise<BuildKitResult> {
  return { kit: fakeKit(), warnings: [], research: { hiringSignals: "", briefPages: [], searchSnippets: [] } };
}

async function registerAgent(email: string) {
  const agent = request.agent(app);
  const res = await agent.post("/api/auth/register").send({ email, password: "password123" }).expect(201);
  return { agent, userId: new ObjectId(res.body.user.id as string) };
}

async function createReadyKit(userId: ObjectId) {
  const now = new Date();
  const doc: KitDoc = {
    userId,
    status: "pending",
    progress: { step: "Queued" },
    input: { jd: "JD", companyUrl: "https://acme.example.com", days: 1 },
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
  await runGeneration(result.insertedId, succeedingBuildKit);
  return result.insertedId;
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

describe("GET /api/kits/:id/practice/session", () => {
  it("requires auth", async () => {
    const res = await request(app).get("/api/kits/000000000000000000000000/practice/session");
    expect(res.status).toBe(401);
  });

  it("returns every card as never-reviewed on a fresh kit", async () => {
    const { agent, userId } = await registerAgent("p1@example.com");
    const kitId = await createReadyKit(userId);

    const res = await agent.get(`/api/kits/${kitId.toString()}/practice/session`);
    expect(res.status).toBe(200);
    expect(res.body.cards).toHaveLength(2);
    expect(res.body.coverage.neverReviewedCardIds.sort()).toEqual(["f1", "f2"]);
    expect(res.body.coverage.reviewedCards).toBe(0);
  });
});

describe("POST /api/kits/:id/practice/:flashcardId/review", () => {
  it("records a review and updates coverage", async () => {
    const { agent, userId } = await registerAgent("p2@example.com");
    const kitId = await createReadyKit(userId);

    const res = await agent.post(`/api/kits/${kitId.toString()}/practice/f1/review`).send({ confidence: 4 });
    expect(res.status).toBe(200);
    expect(res.body.state.lastConfidence).toBe(4);
    expect(res.body.state.repetitions).toBe(1);

    const session = await agent.get(`/api/kits/${kitId.toString()}/practice/session`);
    expect(session.body.coverage.reviewedCards).toBe(1);
    expect(session.body.coverage.neverReviewedCardIds).toEqual(["f2"]);
  });

  it("orders the next session by least confident first among due cards", async () => {
    const { agent, userId } = await registerAgent("p3@example.com");
    const kitId = await createReadyKit(userId);

    await agent.post(`/api/kits/${kitId.toString()}/practice/f1/review`).send({ confidence: 1 });
    await agent.post(`/api/kits/${kitId.toString()}/practice/f2/review`).send({ confidence: 5 });

    const session = await agent.get(`/api/kits/${kitId.toString()}/practice/session`);
    // Both cards get a 1-day interval on their first review (f1 via the low-confidence reset
    // branch, f2 via the first-successful-review branch), so neither is due yet — meaning both
    // fall into the same "not due" group, and the ordering within that group still falls back
    // to least-confident-first, putting f1 (confidence 1) ahead of f2 (confidence 5).
    expect(session.body.cards[0].flashcard.id).toBe("f1");
  });

  it("rejects an out-of-range confidence value", async () => {
    const { agent, userId } = await registerAgent("p4@example.com");
    const kitId = await createReadyKit(userId);

    const res = await agent.post(`/api/kits/${kitId.toString()}/practice/f1/review`).send({ confidence: 9 });
    expect(res.status).toBe(400);
  });

  it("404s for a flashcard that doesn't exist on the kit", async () => {
    const { agent, userId } = await registerAgent("p5@example.com");
    const kitId = await createReadyKit(userId);

    const res = await agent.post(`/api/kits/${kitId.toString()}/practice/ghost/review`).send({ confidence: 3 });
    expect(res.status).toBe(404);
  });
});

describe("GET /api/kits/:id/practice/weak-spots", () => {
  it("ranks the never-practiced requirement as weaker than a practiced one", async () => {
    const { agent, userId } = await registerAgent("p6@example.com");
    const kitId = await createReadyKit(userId);

    await agent.post(`/api/kits/${kitId.toString()}/practice/f2/review`).send({ confidence: 5 });

    const res = await agent.get(`/api/kits/${kitId.toString()}/practice/weak-spots`);
    expect(res.status).toBe(200);
    expect(res.body.weakSpots[0].requirementId).toBe("r1");
    expect(res.body.weakSpots[0].averageConfidence).toBeNull();
    expect(res.body.weakSpots[1].requirementId).toBe("r2");
    expect(res.body.weakSpots[1].averageConfidence).toBe(5);
  });
});
