import { Router } from "express";
import { z } from "zod";
import { ObjectId } from "mongodb";
import {
  validateKit,
  RequirementKind,
  RequirementPriority,
  QuestionCategory,
  type Kit,
  type Question,
} from "@prep-kit/schema";
import {
  checkCoverage,
  createIdSequence,
  markEdited,
  newManualMeta,
  withPinned,
  applyReorder,
  removeRequirementReferences,
  removeQuestionReferences,
  pruneDanglingScheduleReferences,
  regenerateQuestionCategory,
  regenerateCompanyBrief,
  regenerateSchedule,
  BriefPinnedError,
  orderForNextSession,
  computePracticeCoverage,
  computeWeakSpots,
  reviewCard,
  initialPracticeState,
} from "@prep-kit/core";
import { getDb } from "../db/mongo.js";
import type { KitDoc } from "../db/models.js";
import { requireAuth } from "../middleware/require-auth.js";
import { HttpError } from "../lib/http-error.js";
import { computeDedupeKey } from "../lib/dedupe.js";
import { subscribeProgress } from "../lib/progress-bus.js";
import { runGeneration, type BuildKitFn } from "../jobs/generate-kit.js";

type OwnedKitDoc = KitDoc & { _id: ObjectId };
type ReadyKitDoc = OwnedKitDoc & { kit: Kit };

const CreateKitSchema = z.object({
  jd: z.string().trim().min(1, "Job description is required"),
  company_url: z.string().trim().min(1, "Company website is required"),
  days: z.coerce.number().int().min(1, "days must be at least 1").max(90, "days must be 90 or fewer"),
});

const BatchCreateSchema = z.object({
  cases: z.array(CreateKitSchema).min(1, "Provide at least one case").max(20, "Batch upload is limited to 20 cases at a time"),
});

const ReorderSchema = z.object({ orderedIds: z.array(z.string()).min(1, "orderedIds is required") });

const RequirementEditSchema = z
  .object({ text: z.string().trim().min(1).optional(), kind: RequirementKind.optional(), priority: RequirementPriority.optional() })
  .refine((o) => Object.keys(o).length > 0, "Provide at least one field to update");

const RequirementCreateSchema = z.object({
  text: z.string().trim().min(1),
  kind: RequirementKind,
  priority: RequirementPriority,
});

const QuestionEditSchema = z
  .object({
    prompt: z.string().trim().min(1).optional(),
    answer_outline: z.string().optional(),
    difficulty: z.union([z.literal(1), z.literal(2), z.literal(3)]).optional(),
    requirement_ids: z.array(z.string()).optional(),
    category: QuestionCategory.optional(),
    pinned: z.boolean().optional(),
  })
  .refine((o) => Object.keys(o).length > 0, "Provide at least one field to update");

const QuestionCreateSchema = z.object({
  prompt: z.string().trim().min(1),
  answer_outline: z.string().default(""),
  difficulty: z.union([z.literal(1), z.literal(2), z.literal(3)]),
  requirement_ids: z.array(z.string()).default([]),
  category: QuestionCategory,
});

const FlashcardEditSchema = z
  .object({ front: z.string().trim().min(1).optional(), back: z.string().optional(), requirement_ids: z.array(z.string()).optional(), pinned: z.boolean().optional() })
  .refine((o) => Object.keys(o).length > 0, "Provide at least one field to update");

const FlashcardCreateSchema = z.object({
  front: z.string().trim().min(1),
  back: z.string().default(""),
  requirement_ids: z.array(z.string()).default([]),
});

const CompanyBriefEditSchema = z
  .object({ summary: z.string().trim().min(1).optional(), what_they_do: z.string().trim().min(1).optional(), pinned: z.boolean().optional() })
  .refine((o) => Object.keys(o).length > 0, "Provide at least one field to update");

const RegenerateScheduleSchema = z.object({ days: z.coerce.number().int().min(1).max(90).optional() });

const ReviewSchema = z.object({ confidence: z.coerce.number().int().min(1).max(5) });

function toSummary(doc: OwnedKitDoc) {
  return {
    id: doc._id.toString(),
    status: doc.status,
    progress: doc.progress,
    input: doc.input,
    company: doc.kit?.source.company ?? null,
    role: doc.kit?.source.role ?? null,
    error: doc.error,
    createdAt: doc.createdAt,
    updatedAt: doc.updatedAt,
  };
}

function toDetail(doc: OwnedKitDoc) {
  return {
    id: doc._id.toString(),
    status: doc.status,
    progress: doc.progress,
    input: doc.input,
    kit: doc.kit,
    warnings: doc.warnings,
    error: doc.error,
    createdAt: doc.createdAt,
    updatedAt: doc.updatedAt,
  };
}

/** Every mutation goes through this before being persisted, so a broken kit can never be saved (Section 13). */
function recomputeCoverage(kit: Kit): void {
  const result = checkCoverage(kit.role.requirements, kit.questions);
  kit.coverage.uncovered_requirement_ids = result.uncoveredRequirementIds;
}

export function createKitsRouter(buildKitFn: BuildKitFn): Router {
  const router = Router();
  router.use(requireAuth);

  async function createKitJob(
    userId: ObjectId,
    input: { jd: string; companyUrl: string; days: number },
  ): Promise<{ doc: OwnedKitDoc; duplicate: boolean }> {
    const kits = getDb().collection<KitDoc>("kits");
    const dedupeKey = computeDedupeKey(userId.toString(), input.jd, input.companyUrl);

    const existing = await kits.findOne({ userId, dedupeKey });
    if (existing) {
      return { doc: existing as OwnedKitDoc, duplicate: true };
    }

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
      dedupeKey,
      practice: {},
      createdAt: now,
      updatedAt: now,
    };

    const result = await kits.insertOne(doc);
    const inserted: OwnedKitDoc = { ...doc, _id: result.insertedId };

    // Fire-and-forget: the request returns immediately. Progress lives on
    // the doc (and streams over SSE) rather than blocking this response for
    // the 30-90s a generation actually takes.
    void runGeneration(result.insertedId, buildKitFn);

    return { doc: inserted, duplicate: false };
  }

  async function loadOwnedKit(userId: ObjectId, kitId: string): Promise<OwnedKitDoc> {
    if (!ObjectId.isValid(kitId)) {
      throw new HttpError(404, "NOT_FOUND", "Kit not found");
    }
    const kits = getDb().collection<KitDoc>("kits");
    const doc = await kits.findOne({ _id: new ObjectId(kitId), userId });
    if (!doc) {
      // Not found and "belongs to someone else" get the same response, so existence isn't leaked.
      throw new HttpError(404, "NOT_FOUND", "Kit not found");
    }
    return doc as OwnedKitDoc;
  }

  /** Editing/regeneration only makes sense once a kit has finished its first generation. */
  async function loadReadyKit(userId: ObjectId, kitId: string): Promise<ReadyKitDoc> {
    const doc = await loadOwnedKit(userId, kitId);
    if (doc.status !== "ready" || !doc.kit) {
      throw new HttpError(409, "KIT_NOT_READY", `Kit is ${doc.status} — wait for generation to finish before editing it`);
    }
    return doc as ReadyKitDoc;
  }

  async function saveKit(kitId: ObjectId, kit: Kit): Promise<void> {
    const validation = validateKit(kit);
    if (!validation.valid) {
      throw new HttpError(500, "INVALID_KIT_STATE", `This change would leave the kit invalid: ${validation.errors.join("; ")}`);
    }
    await getDb().collection<KitDoc>("kits").updateOne({ _id: kitId }, { $set: { kit, updatedAt: new Date() } });
  }

  // ---- Creation ----

  router.post("/", async (req, res, next) => {
    try {
      const parsed = CreateKitSchema.safeParse(req.body);
      if (!parsed.success) {
        throw new HttpError(400, "INVALID_INPUT", parsed.error.issues[0]?.message ?? "Invalid request");
      }
      const userId = new ObjectId(req.session.userId!);
      const { doc, duplicate } = await createKitJob(userId, {
        jd: parsed.data.jd,
        companyUrl: parsed.data.company_url,
        days: parsed.data.days,
      });
      res.status(duplicate ? 200 : 202).json({ kit: toSummary(doc), duplicate });
    } catch (err) {
      next(err);
    }
  });

  router.post("/batch", async (req, res, next) => {
    try {
      const parsed = BatchCreateSchema.safeParse(req.body);
      if (!parsed.success) {
        throw new HttpError(400, "INVALID_INPUT", parsed.error.issues[0]?.message ?? "Invalid request");
      }
      const userId = new ObjectId(req.session.userId!);
      const results = [];
      for (const c of parsed.data.cases) {
        const { doc, duplicate } = await createKitJob(userId, { jd: c.jd, companyUrl: c.company_url, days: c.days });
        results.push({ kit: toSummary(doc), duplicate });
      }
      res.status(202).json({ kits: results });
    } catch (err) {
      next(err);
    }
  });

  router.get("/", async (req, res, next) => {
    try {
      const userId = new ObjectId(req.session.userId!);
      const kits = getDb().collection<KitDoc>("kits");
      const docs = await kits.find({ userId }).sort({ createdAt: -1 }).toArray();
      res.json({ kits: docs.map((d) => toSummary(d as OwnedKitDoc)) });
    } catch (err) {
      next(err);
    }
  });

  router.get("/:id", async (req, res, next) => {
    try {
      const userId = new ObjectId(req.session.userId!);
      const doc = await loadOwnedKit(userId, req.params.id);
      res.json(toDetail(doc));
    } catch (err) {
      next(err);
    }
  });

  router.get("/:id/stream", async (req, res, next) => {
    try {
      const userId = new ObjectId(req.session.userId!);
      const doc = await loadOwnedKit(userId, req.params.id);

      res.writeHead(200, {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
      });

      const send = (event: unknown) => {
        res.write(`data: ${JSON.stringify(event)}\n\n`);
      };

      send({ step: doc.progress.step, status: doc.status, error: doc.error ?? undefined });

      if (doc.status === "ready" || doc.status === "failed") {
        res.end();
        return;
      }

      const unsubscribe = subscribeProgress(doc._id.toString(), (event) => {
        send(event);
        if (event.status === "ready" || event.status === "failed") {
          unsubscribe();
          res.end();
        }
      });

      req.on("close", unsubscribe);
    } catch (err) {
      next(err);
    }
  });

  // ---- Requirements ----
  // Note: the literal "/reorder" route must be registered before the
  // "/:reqId" route below — Express would otherwise match "reorder" itself
  // as a :reqId value, since parameterized routes are matched in
  // registration order and a wildcard segment matches any literal string.

  router.patch("/:id/requirements/reorder", async (req, res, next) => {
    try {
      const parsed = ReorderSchema.safeParse(req.body);
      if (!parsed.success) throw new HttpError(400, "INVALID_INPUT", parsed.error.issues[0]?.message ?? "Invalid request");
      const userId = new ObjectId(req.session.userId!);
      const doc = await loadReadyKit(userId, req.params.id);
      const kit = doc.kit;

      const reordered = applyReorder(kit.role.requirements, parsed.data.orderedIds);
      kit.role.requirements = reordered.map((r, i) => ({ ...r, _meta: { ...r._meta, order: i } }));

      await saveKit(doc._id, kit);
      res.json({ kit });
    } catch (err) {
      next(err);
    }
  });

  router.patch("/:id/requirements/:reqId", async (req, res, next) => {
    try {
      const parsed = RequirementEditSchema.safeParse(req.body);
      if (!parsed.success) throw new HttpError(400, "INVALID_INPUT", parsed.error.issues[0]?.message ?? "Invalid request");
      const userId = new ObjectId(req.session.userId!);
      const doc = await loadReadyKit(userId, req.params.id);
      const kit = doc.kit;

      const requirement = kit.role.requirements.find((r) => r.id === req.params.reqId);
      if (!requirement) throw new HttpError(404, "NOT_FOUND", "Requirement not found");

      Object.assign(requirement, parsed.data);
      requirement._meta = markEdited(requirement._meta);

      recomputeCoverage(kit);
      await saveKit(doc._id, kit);
      res.json({ kit });
    } catch (err) {
      next(err);
    }
  });

  router.post("/:id/requirements", async (req, res, next) => {
    try {
      const parsed = RequirementCreateSchema.safeParse(req.body);
      if (!parsed.success) throw new HttpError(400, "INVALID_INPUT", parsed.error.issues[0]?.message ?? "Invalid request");
      const userId = new ObjectId(req.session.userId!);
      const doc = await loadReadyKit(userId, req.params.id);
      const kit = doc.kit;

      const nextId = createIdSequence(kit.role.requirements.map((r) => r.id), "r");
      kit.role.requirements.push({
        id: nextId(),
        text: parsed.data.text,
        kind: parsed.data.kind,
        priority: parsed.data.priority,
        _meta: newManualMeta(kit.role.requirements.length),
      });

      recomputeCoverage(kit);
      await saveKit(doc._id, kit);
      res.status(201).json({ kit });
    } catch (err) {
      next(err);
    }
  });

  router.delete("/:id/requirements/:reqId", async (req, res, next) => {
    try {
      const userId = new ObjectId(req.session.userId!);
      const doc = await loadReadyKit(userId, req.params.id);
      const kit = doc.kit;

      const index = kit.role.requirements.findIndex((r) => r.id === req.params.reqId);
      if (index === -1) throw new HttpError(404, "NOT_FOUND", "Requirement not found");

      kit.role.requirements.splice(index, 1);
      removeRequirementReferences(kit, req.params.reqId);
      recomputeCoverage(kit);
      await saveKit(doc._id, kit);
      res.json({ kit });
    } catch (err) {
      next(err);
    }
  });

  // ---- Questions ----
  // Same ordering note as requirements: "/reorder" must come before "/:qId".

  router.patch("/:id/questions/reorder", async (req, res, next) => {
    try {
      const parsed = ReorderSchema.safeParse(req.body);
      if (!parsed.success) throw new HttpError(400, "INVALID_INPUT", parsed.error.issues[0]?.message ?? "Invalid request");
      const userId = new ObjectId(req.session.userId!);
      const doc = await loadReadyKit(userId, req.params.id);
      const kit = doc.kit;

      const reordered = applyReorder(kit.questions, parsed.data.orderedIds);
      kit.questions = reordered.map((q, i) => ({ ...q, _meta: { ...q._meta, order: i } }));

      await saveKit(doc._id, kit);
      res.json({ kit });
    } catch (err) {
      next(err);
    }
  });

  router.patch("/:id/questions/:qId", async (req, res, next) => {
    try {
      const parsed = QuestionEditSchema.safeParse(req.body);
      if (!parsed.success) throw new HttpError(400, "INVALID_INPUT", parsed.error.issues[0]?.message ?? "Invalid request");
      const userId = new ObjectId(req.session.userId!);
      const doc = await loadReadyKit(userId, req.params.id);
      const kit = doc.kit;

      const question = kit.questions.find((q) => q.id === req.params.qId);
      if (!question) throw new HttpError(404, "NOT_FOUND", "Question not found");

      const { pinned, ...contentFields } = parsed.data;
      Object.assign(question, contentFields);
      if (pinned !== undefined) question._meta = withPinned(question._meta, pinned);
      if (Object.keys(contentFields).length > 0) question._meta = markEdited(question._meta);

      recomputeCoverage(kit);
      await saveKit(doc._id, kit);
      res.json({ kit });
    } catch (err) {
      next(err);
    }
  });

  router.post("/:id/questions", async (req, res, next) => {
    try {
      const parsed = QuestionCreateSchema.safeParse(req.body);
      if (!parsed.success) throw new HttpError(400, "INVALID_INPUT", parsed.error.issues[0]?.message ?? "Invalid request");
      const userId = new ObjectId(req.session.userId!);
      const doc = await loadReadyKit(userId, req.params.id);
      const kit = doc.kit;

      const validRequirementIds = new Set(kit.role.requirements.map((r) => r.id));
      const requirement_ids = parsed.data.requirement_ids.filter((id) => validRequirementIds.has(id));

      const nextId = createIdSequence(kit.questions.map((q) => q.id), "q");
      kit.questions.push({
        id: nextId(),
        requirement_ids,
        category: parsed.data.category,
        prompt: parsed.data.prompt,
        answer_outline: parsed.data.answer_outline,
        difficulty: parsed.data.difficulty,
        _meta: newManualMeta(kit.questions.length),
      });

      recomputeCoverage(kit);
      await saveKit(doc._id, kit);
      res.status(201).json({ kit });
    } catch (err) {
      next(err);
    }
  });

  router.delete("/:id/questions/:qId", async (req, res, next) => {
    try {
      const userId = new ObjectId(req.session.userId!);
      const doc = await loadReadyKit(userId, req.params.id);
      const kit = doc.kit;

      const index = kit.questions.findIndex((q) => q.id === req.params.qId);
      if (index === -1) throw new HttpError(404, "NOT_FOUND", "Question not found");

      kit.questions.splice(index, 1);
      removeQuestionReferences(kit, req.params.qId);
      recomputeCoverage(kit);
      await saveKit(doc._id, kit);
      res.json({ kit });
    } catch (err) {
      next(err);
    }
  });

  // ---- Flashcards ----
  // Same ordering note as requirements: "/reorder" must come before "/:fId".

  router.patch("/:id/flashcards/reorder", async (req, res, next) => {
    try {
      const parsed = ReorderSchema.safeParse(req.body);
      if (!parsed.success) throw new HttpError(400, "INVALID_INPUT", parsed.error.issues[0]?.message ?? "Invalid request");
      const userId = new ObjectId(req.session.userId!);
      const doc = await loadReadyKit(userId, req.params.id);
      const kit = doc.kit;

      const reordered = applyReorder(kit.flashcards, parsed.data.orderedIds);
      kit.flashcards = reordered.map((f, i) => ({ ...f, _meta: { ...f._meta, order: i } }));

      await saveKit(doc._id, kit);
      res.json({ kit });
    } catch (err) {
      next(err);
    }
  });

  router.patch("/:id/flashcards/:fId", async (req, res, next) => {
    try {
      const parsed = FlashcardEditSchema.safeParse(req.body);
      if (!parsed.success) throw new HttpError(400, "INVALID_INPUT", parsed.error.issues[0]?.message ?? "Invalid request");
      const userId = new ObjectId(req.session.userId!);
      const doc = await loadReadyKit(userId, req.params.id);
      const kit = doc.kit;

      const flashcard = kit.flashcards.find((f) => f.id === req.params.fId);
      if (!flashcard) throw new HttpError(404, "NOT_FOUND", "Flashcard not found");

      const { pinned, ...contentFields } = parsed.data;
      Object.assign(flashcard, contentFields);
      if (pinned !== undefined) flashcard._meta = withPinned(flashcard._meta, pinned);
      if (Object.keys(contentFields).length > 0) flashcard._meta = markEdited(flashcard._meta);

      await saveKit(doc._id, kit);
      res.json({ kit });
    } catch (err) {
      next(err);
    }
  });

  router.post("/:id/flashcards", async (req, res, next) => {
    try {
      const parsed = FlashcardCreateSchema.safeParse(req.body);
      if (!parsed.success) throw new HttpError(400, "INVALID_INPUT", parsed.error.issues[0]?.message ?? "Invalid request");
      const userId = new ObjectId(req.session.userId!);
      const doc = await loadReadyKit(userId, req.params.id);
      const kit = doc.kit;

      const validRequirementIds = new Set(kit.role.requirements.map((r) => r.id));
      const requirement_ids = parsed.data.requirement_ids.filter((id) => validRequirementIds.has(id));

      const nextId = createIdSequence(kit.flashcards.map((f) => f.id), "f");
      kit.flashcards.push({
        id: nextId(),
        front: parsed.data.front,
        back: parsed.data.back,
        requirement_ids,
        _meta: newManualMeta(kit.flashcards.length),
      });

      await saveKit(doc._id, kit);
      res.status(201).json({ kit });
    } catch (err) {
      next(err);
    }
  });

  router.delete("/:id/flashcards/:fId", async (req, res, next) => {
    try {
      const userId = new ObjectId(req.session.userId!);
      const doc = await loadReadyKit(userId, req.params.id);
      const kit = doc.kit;

      const index = kit.flashcards.findIndex((f) => f.id === req.params.fId);
      if (index === -1) throw new HttpError(404, "NOT_FOUND", "Flashcard not found");

      kit.flashcards.splice(index, 1);
      await saveKit(doc._id, kit);
      res.json({ kit });
    } catch (err) {
      next(err);
    }
  });

  // ---- Company brief ----

  router.patch("/:id/company-brief", async (req, res, next) => {
    try {
      const parsed = CompanyBriefEditSchema.safeParse(req.body);
      if (!parsed.success) throw new HttpError(400, "INVALID_INPUT", parsed.error.issues[0]?.message ?? "Invalid request");
      const userId = new ObjectId(req.session.userId!);
      const doc = await loadReadyKit(userId, req.params.id);
      const kit = doc.kit;

      const { pinned, ...contentFields } = parsed.data;
      Object.assign(kit.company_brief, contentFields);
      if (pinned !== undefined) kit.company_brief._meta = withPinned(kit.company_brief._meta, pinned);
      if (Object.keys(contentFields).length > 0) kit.company_brief._meta = markEdited(kit.company_brief._meta);

      await saveKit(doc._id, kit);
      res.json({ kit });
    } catch (err) {
      next(err);
    }
  });

  // ---- Regeneration (Section 6: company brief, one question category, or the schedule) ----

  router.post("/:id/regenerate/company-brief", async (req, res, next) => {
    try {
      const userId = new ObjectId(req.session.userId!);
      const doc = await loadReadyKit(userId, req.params.id);
      if (!doc.research) {
        throw new HttpError(409, "NO_RESEARCH_MATERIAL", "No stored research material to regenerate the brief from");
      }
      const kit = doc.kit;

      try {
        kit.company_brief = await regenerateCompanyBrief({
          companyUrl: kit.source.company_url,
          currentBrief: kit.company_brief,
          briefPages: doc.research.briefPages,
          searchSnippets: doc.research.searchSnippets,
        });
      } catch (err) {
        if (err instanceof BriefPinnedError) {
          throw new HttpError(409, "BRIEF_PINNED", err.message);
        }
        throw err;
      }

      await saveKit(doc._id, kit);
      res.json({ kit });
    } catch (err) {
      next(err);
    }
  });

  router.post("/:id/regenerate/questions/:category", async (req, res, next) => {
    try {
      const parsedCategory = QuestionCategory.safeParse(req.params.category);
      if (!parsedCategory.success) {
        throw new HttpError(400, "INVALID_INPUT", "category must be technical, behavioural, system-design, or company-fit");
      }
      const userId = new ObjectId(req.session.userId!);
      const doc = await loadReadyKit(userId, req.params.id);
      if (!doc.research) {
        throw new HttpError(409, "NO_RESEARCH_MATERIAL", "No stored research material to regenerate questions from");
      }
      const kit = doc.kit;
      const category = parsedCategory.data as Question["category"];

      const result = await regenerateQuestionCategory(category, kit.questions, kit.role.requirements, doc.research.hiringSignals);
      kit.questions = result.questions;
      kit.coverage.uncovered_requirement_ids = result.uncoveredRequirementIds;
      // Replaced questions can drop out of kit.questions entirely; make sure none of them are still referenced by the schedule.
      pruneDanglingScheduleReferences(kit);

      await saveKit(doc._id, kit);
      res.json({ kit });
    } catch (err) {
      next(err);
    }
  });

  router.post("/:id/regenerate/schedule", async (req, res, next) => {
    try {
      const parsed = RegenerateScheduleSchema.safeParse(req.body ?? {});
      if (!parsed.success) throw new HttpError(400, "INVALID_INPUT", "days must be an integer between 1 and 90");
      const userId = new ObjectId(req.session.userId!);
      const doc = await loadReadyKit(userId, req.params.id);
      const kit = doc.kit;

      const daysAvailable = parsed.data.days ?? kit.schedule.days_available;
      kit.schedule = regenerateSchedule(kit.questions, kit.role.requirements, daysAvailable);

      await saveKit(doc._id, kit);
      res.json({ kit });
    } catch (err) {
      next(err);
    }
  });

  // ---- Practice mode (Section 7) ----

  router.get("/:id/practice/session", async (req, res, next) => {
    try {
      const userId = new ObjectId(req.session.userId!);
      const doc = await loadReadyKit(userId, req.params.id);
      const kit = doc.kit;

      const ordered = orderForNextSession(kit.flashcards, doc.practice);
      const coverage = computePracticeCoverage(
        kit.flashcards.map((f) => f.id),
        doc.practice,
      );

      res.json({
        cards: ordered.map((f) => ({ flashcard: f, state: doc.practice[f.id] ?? null })),
        coverage,
      });
    } catch (err) {
      next(err);
    }
  });

  router.post("/:id/practice/:flashcardId/review", async (req, res, next) => {
    try {
      const parsed = ReviewSchema.safeParse(req.body);
      if (!parsed.success) throw new HttpError(400, "INVALID_INPUT", "confidence must be an integer between 1 and 5");
      const userId = new ObjectId(req.session.userId!);
      const doc = await loadReadyKit(userId, req.params.id);

      const flashcard = doc.kit.flashcards.find((f) => f.id === req.params.flashcardId);
      if (!flashcard) throw new HttpError(404, "NOT_FOUND", "Flashcard not found");

      const previous = doc.practice[flashcard.id] ?? initialPracticeState();
      const updated = reviewCard(previous, parsed.data.confidence);

      await getDb()
        .collection<KitDoc>("kits")
        .updateOne({ _id: doc._id }, { $set: { [`practice.${flashcard.id}`]: updated, updatedAt: new Date() } });

      res.json({ state: updated });
    } catch (err) {
      next(err);
    }
  });

  // ---- Creative feature: weak spots (joins practice confidence back to job requirements, not just flashcards) ----

  router.get("/:id/practice/weak-spots", async (req, res, next) => {
    try {
      const userId = new ObjectId(req.session.userId!);
      const doc = await loadReadyKit(userId, req.params.id);
      const kit = doc.kit;

      const weakSpots = computeWeakSpots(kit.role.requirements, kit.flashcards, doc.practice);
      res.json({ weakSpots });
    } catch (err) {
      next(err);
    }
  });

  return router;
}
