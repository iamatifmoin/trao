import { z } from "zod";

// Appendix A field names and nesting are exact. `_meta` is our one extension
// point (Section 5 permits extending the structure) and carries edit/pin
// state that the builder needs but the brief doesn't name — see README
// "How you represent generated, edited and pinned state".

export const RequirementKind = z.enum(["technical", "behavioural", "domain"]);
export const RequirementPriority = z.enum(["must", "nice"]);
export const QuestionCategory = z.enum([
  "technical",
  "behavioural",
  "system-design",
  "company-fit",
]);
export const ItemOrigin = z.enum(["generated", "edited", "manual"]);

export const MetaSchema = z
  .object({
    origin: ItemOrigin,
    pinned: z.boolean(),
    order: z.number().int(),
    revision: z.number().int().min(0),
  })
  .partial();

export const RequirementSchema = z.object({
  id: z.string().min(1),
  text: z.string().min(1),
  kind: RequirementKind,
  priority: RequirementPriority,
  _meta: MetaSchema.optional(),
});

export const QuestionSchema = z.object({
  id: z.string().min(1),
  requirement_ids: z.array(z.string().min(1)),
  category: QuestionCategory,
  prompt: z.string().min(1),
  answer_outline: z.string(),
  difficulty: z.number().int().min(1).max(3),
  _meta: MetaSchema.optional(),
});

export const FlashcardSchema = z.object({
  id: z.string().min(1),
  front: z.string().min(1),
  back: z.string(),
  requirement_ids: z.array(z.string().min(1)),
  _meta: MetaSchema.optional(),
});

export const ScheduleDaySchema = z.object({
  day: z.number().int().min(1),
  focus: z.string(),
  question_ids: z.array(z.string().min(1)),
  minutes: z.number().int().min(0),
});

export const ScheduleSchema = z.object({
  days_available: z.number().int().min(1),
  days: z.array(ScheduleDaySchema),
});

export const CoverageSchema = z.object({
  uncovered_requirement_ids: z.array(z.string()),
  passes: z.number().int().min(0),
});

export const SourceSchema = z.object({
  company: z.string(),
  company_url: z.string(),
  role: z.string(),
  location: z.string(),
  jd_chars: z.number().int().min(0),
  researched_at: z.string(),
  pages_used: z.array(z.string()),
});

export const CompanyBriefSchema = z.object({
  summary: z.string(),
  what_they_do: z.string(),
  sources: z.array(z.string()),
  _meta: MetaSchema.optional(),
});

export const RoleSchema = z.object({
  title: z.string(),
  seniority: z.string(),
  responsibilities: z.array(z.string()),
  requirements: z.array(RequirementSchema),
});

export const KitSchema = z.object({
  source: SourceSchema,
  company_brief: CompanyBriefSchema,
  role: RoleSchema,
  questions: z.array(QuestionSchema),
  flashcards: z.array(FlashcardSchema),
  schedule: ScheduleSchema,
  coverage: CoverageSchema,
});

export type Requirement = z.infer<typeof RequirementSchema>;
export type Question = z.infer<typeof QuestionSchema>;
export type Flashcard = z.infer<typeof FlashcardSchema>;
export type ScheduleDay = z.infer<typeof ScheduleDaySchema>;
export type Schedule = z.infer<typeof ScheduleSchema>;
export type Coverage = z.infer<typeof CoverageSchema>;
export type Source = z.infer<typeof SourceSchema>;
export type CompanyBrief = z.infer<typeof CompanyBriefSchema>;
export type Role = z.infer<typeof RoleSchema>;
export type Kit = z.infer<typeof KitSchema>;
export type Meta = z.infer<typeof MetaSchema>;
