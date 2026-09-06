import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { MongoMemoryServer } from "mongodb-memory-server";
import request from "supertest";
import type { Express } from "express";
import type { Kit } from "@prep-kit/schema";
import type { BuildKitInput, BuildKitResult } from "@prep-kit/core";

vi.mock("@prep-kit/core", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@prep-kit/core")>();
  return {
    ...actual,
    regenerateCompanyBrief: vi.fn(),
    regenerateQuestionCategory: vi.fn(),
  };
});

import { regenerateCompanyBrief, regenerateQuestionCategory, BriefPinnedError } from "@prep-kit/core";
import { connectToMongo, closeMongo, getDb, ObjectId } from "../src/db/mongo.js";
import { createApp } from "../src/app.js";
import { runGeneration } from "../src/jobs/generate-kit.js";
import type { Env } from "../src/config/env.js";
import type { KitDoc } from "../src/db/models.js";

let mongod: MongoMemoryServer;
let app: Express;

function fakeKit(): Kit {
  return {
    source: {
      company: "Acme",
      company_url: "https://acme.example.com",
      role: "Software Engineer",
      location: "Remote",
      jd_chars: 42,
      researched_at: new Date().toISOString(),
      pages_used: [],
    },
    company_brief: { summary: "A widget company.", what_they_do: "Makes widgets.", sources: [], _meta: { origin: "generated", pinned: false, order: 0, revision: 0 } },
    role: {
      title: "Software Engineer",
      seniority: "Mid",
      responsibilities: ["Ship things"],
      requirements: [
        { id: "r1", text: "Knows TypeScript", kind: "technical", priority: "must", _meta: { origin: "generated", pinned: false, order: 0, revision: 0 } },
        { id: "r2", text: "Mentors juniors", kind: "behavioural", priority: "nice", _meta: { origin: "generated", pinned: false, order: 1, revision: 0 } },
      ],
    },
    questions: [
      {
        id: "q1",
        requirement_ids: ["r1"],
        category: "technical",
        prompt: "What is TS?",
        answer_outline: "...",
        difficulty: 1,
        _meta: { origin: "generated", pinned: false, order: 0, revision: 0 },
      },
      {
        id: "q2",
        requirement_ids: ["r2"],
        category: "behavioural",
        prompt: "Tell me about mentoring.",
        answer_outline: "...",
        difficulty: 1,
        _meta: { origin: "generated", pinned: false, order: 1, revision: 0 },
      },
    ],
    flashcards: [
      { id: "f1", front: "TS?", back: "Typed JS", requirement_ids: ["r1"], _meta: { origin: "generated", pinned: false, order: 0, revision: 0 } },
    ],
    schedule: {
      days_available: 2,
      days: [
        { day: 1, focus: "Technical", question_ids: ["q1"], minutes: 10 },
        { day: 2, focus: "Behavioural", question_ids: ["q2"], minutes: 10 },
      ],
    },
    coverage: { uncovered_requirement_ids: [], passes: 1 },
  };
}

async function succeedingBuildKit(input: BuildKitInput): Promise<BuildKitResult> {
  return {
    kit: fakeKit(),
    warnings: [],
    research: { hiringSignals: "some signal", briefPages: [{ url: "https://acme.example.com/about", title: "About", text: "..." }], searchSnippets: [] },
  };
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
    input: { jd: "JD", companyUrl: "https://acme.example.com", days: 2 },
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
  vi.clearAllMocks();
  await getDb().collection("users").deleteMany({});
  await getDb().collection("kits").deleteMany({});
});

describe("editing before a kit is ready", () => {
  it("returns 409 KIT_NOT_READY for a pending kit", async () => {
    const { agent, userId } = await registerAgent("notready@example.com");
    const now = new Date();
    const doc: KitDoc = {
      userId,
      status: "pending",
      progress: { step: "Queued" },
      input: { jd: "JD", companyUrl: "https://acme.example.com", days: 2 },
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

    const res = await agent.patch(`/api/kits/${result.insertedId.toString()}/company-brief`).send({ summary: "x" });
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe("KIT_NOT_READY");
  });
});

describe("requirements", () => {
  it("edits a requirement, marking it edited", async () => {
    const { agent, userId } = await registerAgent("req1@example.com");
    const kitId = await createReadyKit(userId);

    const res = await agent.patch(`/api/kits/${kitId.toString()}/requirements/r1`).send({ text: "10+ years with Rust" });
    expect(res.status).toBe(200);
    const r1 = res.body.kit.role.requirements.find((r: { id: string }) => r.id === "r1");
    expect(r1.text).toBe("10+ years with Rust");
    expect(r1._meta.origin).toBe("edited");
  });

  it("adds a manual requirement and recomputes coverage", async () => {
    const { agent, userId } = await registerAgent("req2@example.com");
    const kitId = await createReadyKit(userId);

    const res = await agent
      .post(`/api/kits/${kitId.toString()}/requirements`)
      .send({ text: "Owns on-call rotation", kind: "domain", priority: "must" });
    expect(res.status).toBe(201);
    const added = res.body.kit.role.requirements.find((r: { text: string }) => r.text === "Owns on-call rotation");
    expect(added._meta.origin).toBe("manual");
    // The newly-added must-have has no question yet, so it should show up as uncovered.
    expect(res.body.kit.coverage.uncovered_requirement_ids).toContain(added.id);
  });

  it("deleting a requirement strips it from questions and flashcards that referenced it", async () => {
    const { agent, userId } = await registerAgent("req3@example.com");
    const kitId = await createReadyKit(userId);

    const res = await agent.delete(`/api/kits/${kitId.toString()}/requirements/r1`);
    expect(res.status).toBe(200);
    const q1 = res.body.kit.questions.find((q: { id: string }) => q.id === "q1");
    expect(q1.requirement_ids).not.toContain("r1");
    const f1 = res.body.kit.flashcards.find((f: { id: string }) => f.id === "f1");
    expect(f1.requirement_ids).not.toContain("r1");
  });

  it("reorders requirements", async () => {
    const { agent, userId } = await registerAgent("req4@example.com");
    const kitId = await createReadyKit(userId);

    const res = await agent.patch(`/api/kits/${kitId.toString()}/requirements/reorder`).send({ orderedIds: ["r2", "r1"] });
    expect(res.status).toBe(200);
    expect(res.body.kit.role.requirements.map((r: { id: string }) => r.id)).toEqual(["r2", "r1"]);
  });
});

describe("questions", () => {
  it("edits a question's content, marking it edited", async () => {
    const { agent, userId } = await registerAgent("q1@example.com");
    const kitId = await createReadyKit(userId);

    const res = await agent.patch(`/api/kits/${kitId.toString()}/questions/q1`).send({ prompt: "My rewritten question" });
    expect(res.status).toBe(200);
    const q1 = res.body.kit.questions.find((q: { id: string }) => q.id === "q1");
    expect(q1.prompt).toBe("My rewritten question");
    expect(q1._meta.origin).toBe("edited");
  });

  it("moves a question to another category via the same edit endpoint", async () => {
    const { agent, userId } = await registerAgent("q2@example.com");
    const kitId = await createReadyKit(userId);

    const res = await agent.patch(`/api/kits/${kitId.toString()}/questions/q1`).send({ category: "system-design" });
    expect(res.status).toBe(200);
    const q1 = res.body.kit.questions.find((q: { id: string }) => q.id === "q1");
    expect(q1.category).toBe("system-design");
  });

  it("pinning alone does not flip origin away from generated", async () => {
    const { agent, userId } = await registerAgent("q3@example.com");
    const kitId = await createReadyKit(userId);

    const res = await agent.patch(`/api/kits/${kitId.toString()}/questions/q1`).send({ pinned: true });
    expect(res.status).toBe(200);
    const q1 = res.body.kit.questions.find((q: { id: string }) => q.id === "q1");
    expect(q1._meta.pinned).toBe(true);
    expect(q1._meta.origin).toBe("generated");
  });

  it("adds a manual question", async () => {
    const { agent, userId } = await registerAgent("q4@example.com");
    const kitId = await createReadyKit(userId);

    const res = await agent.post(`/api/kits/${kitId.toString()}/questions`).send({
      prompt: "A hand-written question",
      answer_outline: "outline",
      difficulty: 2,
      requirement_ids: ["r1"],
      category: "technical",
    });
    expect(res.status).toBe(201);
    const added = res.body.kit.questions.find((q: { prompt: string }) => q.prompt === "A hand-written question");
    expect(added._meta.origin).toBe("manual");
  });

  it("deleting a question strips it from the schedule", async () => {
    const { agent, userId } = await registerAgent("q5@example.com");
    const kitId = await createReadyKit(userId);

    const res = await agent.delete(`/api/kits/${kitId.toString()}/questions/q1`);
    expect(res.status).toBe(200);
    const day1 = res.body.kit.schedule.days.find((d: { day: number }) => d.day === 1);
    expect(day1.question_ids).not.toContain("q1");
  });

  it("reorders questions", async () => {
    const { agent, userId } = await registerAgent("q6@example.com");
    const kitId = await createReadyKit(userId);

    const res = await agent.patch(`/api/kits/${kitId.toString()}/questions/reorder`).send({ orderedIds: ["q2", "q1"] });
    expect(res.status).toBe(200);
    expect(res.body.kit.questions.map((q: { id: string }) => q.id)).toEqual(["q2", "q1"]);
  });
});

describe("flashcards", () => {
  it("edits, adds, deletes, and reorders", async () => {
    const { agent, userId } = await registerAgent("fc@example.com");
    const kitId = await createReadyKit(userId);

    const edited = await agent.patch(`/api/kits/${kitId.toString()}/flashcards/f1`).send({ back: "A new back" });
    expect(edited.body.kit.flashcards[0].back).toBe("A new back");
    expect(edited.body.kit.flashcards[0]._meta.origin).toBe("edited");

    const added = await agent.post(`/api/kits/${kitId.toString()}/flashcards`).send({ front: "New front", back: "New back" });
    expect(added.status).toBe(201);
    expect(added.body.kit.flashcards).toHaveLength(2);

    const newId = added.body.kit.flashcards.find((f: { front: string }) => f.front === "New front").id;
    const reordered = await agent.patch(`/api/kits/${kitId.toString()}/flashcards/reorder`).send({ orderedIds: [newId, "f1"] });
    expect(reordered.body.kit.flashcards.map((f: { id: string }) => f.id)).toEqual([newId, "f1"]);

    const deleted = await agent.delete(`/api/kits/${kitId.toString()}/flashcards/f1`);
    expect(deleted.body.kit.flashcards.map((f: { id: string }) => f.id)).toEqual([newId]);
  });
});

describe("company brief", () => {
  it("editing marks it edited and pinning blocks a later regeneration", async () => {
    const { agent, userId } = await registerAgent("brief1@example.com");
    const kitId = await createReadyKit(userId);

    const edited = await agent.patch(`/api/kits/${kitId.toString()}/company-brief`).send({ summary: "My own summary" });
    expect(edited.body.kit.company_brief.summary).toBe("My own summary");
    expect(edited.body.kit.company_brief._meta.origin).toBe("edited");

    await agent.patch(`/api/kits/${kitId.toString()}/company-brief`).send({ pinned: true });

    vi.mocked(regenerateCompanyBrief).mockRejectedValueOnce(new BriefPinnedError());
    const res = await agent.post(`/api/kits/${kitId.toString()}/regenerate/company-brief`);
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe("BRIEF_PINNED");
  });
});

describe("regeneration", () => {
  it("regenerates the company brief using the kit's stored research material", async () => {
    const { agent, userId } = await registerAgent("regen1@example.com");
    const kitId = await createReadyKit(userId);

    vi.mocked(regenerateCompanyBrief).mockResolvedValueOnce({
      summary: "Freshly regenerated summary",
      what_they_do: "Still makes widgets",
      sources: ["https://acme.example.com/about"],
      _meta: { origin: "generated", pinned: false, order: 0, revision: 0 },
    });

    const res = await agent.post(`/api/kits/${kitId.toString()}/regenerate/company-brief`);
    expect(res.status).toBe(200);
    expect(res.body.kit.company_brief.summary).toBe("Freshly regenerated summary");
    expect(vi.mocked(regenerateCompanyBrief)).toHaveBeenCalledWith(
      expect.objectContaining({ briefPages: expect.any(Array), searchSnippets: expect.any(Array) }),
    );
  });

  it("regenerates one question category, leaving other categories untouched", async () => {
    const { agent, userId } = await registerAgent("regen2@example.com");
    const kitId = await createReadyKit(userId);

    vi.mocked(regenerateQuestionCategory).mockResolvedValueOnce({
      questions: [
        { id: "q2", requirement_ids: ["r2"], category: "behavioural", prompt: "Tell me about mentoring.", answer_outline: "...", difficulty: 1 },
        { id: "q3", requirement_ids: ["r1"], category: "technical", prompt: "A fresh technical question", answer_outline: "...", difficulty: 2 },
      ],
      uncoveredRequirementIds: [],
    });

    const res = await agent.post(`/api/kits/${kitId.toString()}/regenerate/questions/technical`);
    expect(res.status).toBe(200);
    expect(res.body.kit.questions.map((q: { id: string }) => q.id)).toEqual(["q2", "q3"]);
  });

  it("rejects an invalid category", async () => {
    const { agent, userId } = await registerAgent("regen3@example.com");
    const kitId = await createReadyKit(userId);

    const res = await agent.post(`/api/kits/${kitId.toString()}/regenerate/questions/not-a-real-category`);
    expect(res.status).toBe(400);
  });

  it("regenerates the schedule deterministically from the current questions, no mocking needed", async () => {
    const { agent, userId } = await registerAgent("regen4@example.com");
    const kitId = await createReadyKit(userId);

    const res = await agent.post(`/api/kits/${kitId.toString()}/regenerate/schedule`).send({ days: 5 });
    expect(res.status).toBe(200);
    expect(res.body.kit.schedule.days_available).toBe(5);
    expect(res.body.kit.schedule.days).toHaveLength(5);
  });
});
