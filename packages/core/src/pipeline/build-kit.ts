import { validateKit, type Kit, type Requirement, type Question, type Flashcard, type Meta } from "@prep-kit/schema";
import { crawlCompany } from "../retrieval/crawl.js";
import type { FetchedPage } from "../retrieval/fetch-page.js";
import { classifyPages, deriveCompanyName, buildHiringSignalsText, type ClassifiedPage } from "../deterministic/classify-pages.js";
import { checkCoverage } from "../deterministic/coverage.js";
import { allocateSchedule } from "../deterministic/schedule.js";
import { extractRequirements } from "../generation/extract-requirements.js";
import { buildCompanyBrief } from "../generation/company-brief.js";
import { generateQuestions, type GeneratedQuestion, type RequirementForPrompt } from "../generation/questions.js";
import { generateFlashcards } from "../generation/flashcards.js";
import { searchPublicDiscussion, type TavilySearchResult } from "../search/tavily.js";
import { truncate } from "../llm/gemini-client.js";

export interface BuildKitInput {
  jd: string;
  companyUrl: string;
  daysAvailable: number;
  /** Defaults to NODE_ENV !== "production" — callers that know their environment (API, CLI) may set this explicitly. */
  allowPrivateNetworks?: boolean;
  /** Called at each major phase transition — the API uses this to drive visible progress (Section 1); the CLI ignores it. */
  onProgress?: (step: string) => void;
}

export interface BuildKitResearchPage {
  url: string;
  title: string;
  text: string;
}

export interface BuildKitResearchSnippet {
  url: string;
  title: string;
  snippet: string;
}

/** Exactly what fed the company brief and every question category's prompt — persisted so a later regeneration reuses it instead of re-crawling the company site. */
export interface BuildKitResearch {
  hiringSignals: string;
  briefPages: BuildKitResearchPage[];
  searchSnippets: BuildKitResearchSnippet[];
}

export interface BuildKitResult {
  kit: Kit;
  /** Non-fatal problems worth surfacing: unreachable pages, no hiring page found, no public discussion, unclosed coverage gaps. */
  warnings: string[];
  research: BuildKitResearch;
}

const MAX_COVERAGE_PASSES = 3;

function freshMeta(order: number): Meta {
  return { origin: "generated", pinned: false, order, revision: 0 };
}

function toPromptReq(r: Requirement): RequirementForPrompt {
  return { id: r.id, text: r.text, kind: r.kind, priority: r.priority };
}

interface CompanyResearch {
  pages: FetchedPage[];
  classified: ClassifiedPage[];
  companyName: string;
  searchResults: TavilySearchResult[];
}

async function researchCompany(
  companyUrl: string,
  allowPrivateNetworks: boolean,
  warnings: string[],
): Promise<CompanyResearch> {
  const crawl = await crawlCompany(companyUrl, { allowPrivateNetworks });
  for (const skip of crawl.skipped) {
    warnings.push(`could not retrieve ${skip.url}: ${skip.reason}`);
  }
  if (crawl.pages.length === 0) {
    warnings.push(`the company site at ${companyUrl} could not be crawled at all`);
  }

  const classified = classifyPages(crawl.pages);
  const companyName = deriveCompanyName(crawl.pages[0], companyUrl);
  const searchResults = await searchPublicDiscussion(companyName);
  if (searchResults.length === 0) {
    warnings.push("no public discussion of this company's interview process was found");
  }

  return { pages: crawl.pages, classified, companyName, searchResults };
}

/**
 * Runs the full research → generation → validation sequence for one job
 * description and company. This is the single implementation the API and
 * the batch CLI both call (Section 9: "the same code your application
 * uses, not a parallel implementation").
 *
 * Sequencing: the job description needs no retrieval, so its analysis runs
 * concurrently with company research (crawl → classify → search, which is
 * itself a genuine dependency chain — search needs the company name the
 * crawl derived). Once both are in, the company brief and all four question
 * categories are mutually independent, so they run concurrently too; the
 * shared rate limiter queues and spaces the underlying Gemini calls
 * correctly even when fired at once. Coverage-checking and scheduling never
 * touch the model at all.
 */
export async function buildKit(input: BuildKitInput): Promise<BuildKitResult> {
  const warnings: string[] = [];
  const allowPrivateNetworks = input.allowPrivateNetworks ?? process.env.NODE_ENV !== "production";
  const onProgress = input.onProgress ?? (() => undefined);

  onProgress("Extracting requirements from the job description, and researching the company site");
  const [analysis, research] = await Promise.all([
    extractRequirements(input.jd),
    researchCompany(input.companyUrl, allowPrivateNetworks, warnings),
  ]);

  const requirements: Requirement[] = analysis.requirements.map((r, i) => ({
    id: `r${i + 1}`,
    text: r.text,
    kind: r.kind,
    priority: r.priority,
    _meta: freshMeta(i),
  }));

  const hiringSignals = buildHiringSignalsText(research.classified, research.searchResults);
  const technicalReqs = requirements.filter((r) => r.kind === "technical" || r.kind === "domain").map(toPromptReq);
  const behaviouralReqs = requirements.filter((r) => r.kind === "behavioural").map(toPromptReq);

  const briefPages: BuildKitResearchPage[] = research.classified
    .filter((c) => c.signal !== "other")
    .map((c) => ({ url: c.page.finalUrl, title: c.page.title, text: truncate(c.page.text, 3000) }));
  const searchSnippets: BuildKitResearchSnippet[] = research.searchResults.map((s) => ({
    url: s.url,
    title: s.title,
    snippet: s.snippet,
  }));

  onProgress("Generating the company brief and interview questions for each category");
  const [brief, technicalQs, systemDesignQs, behaviouralQs, companyFitQs] = await Promise.all([
    buildCompanyBrief({
      companyUrl: input.companyUrl,
      pages: briefPages,
      searchSnippets,
    }),
    generateQuestions({ category: "technical", requirements: technicalReqs, hiringSignals }),
    generateQuestions({ category: "system-design", requirements: technicalReqs, hiringSignals }),
    generateQuestions({ category: "behavioural", requirements: behaviouralReqs, hiringSignals }),
    generateQuestions({ category: "company-fit", requirements: [], hiringSignals }),
  ]);

  const questions: Question[] = [];
  let idCounter = 1;
  const appendGenerated = (generated: GeneratedQuestion[], category: Question["category"]) => {
    for (const g of generated) {
      questions.push({
        id: `q${idCounter++}`,
        requirement_ids: g.requirement_ids,
        category,
        prompt: g.prompt,
        answer_outline: g.answer_outline,
        difficulty: g.difficulty,
        _meta: freshMeta(questions.length),
      });
    }
  };

  appendGenerated(technicalQs, "technical");
  appendGenerated(systemDesignQs, "system-design");
  appendGenerated(behaviouralQs, "behavioural");
  appendGenerated(companyFitQs, "company-fit");

  // Second pass: close must-have coverage gaps only. Nice-to-have gaps are
  // reported honestly rather than chased — Section 4's failure condition is
  // specifically an uncovered must-have.
  onProgress("Checking requirement coverage");
  let passes = 1;
  let coverage = checkCoverage(requirements, questions);

  while (coverage.uncoveredMustRequirementIds.length > 0 && passes < MAX_COVERAGE_PASSES) {
    onProgress(`Closing coverage gaps (pass ${passes + 1})`);
    const uncoveredMustReqs = requirements.filter((r) => coverage.uncoveredMustRequirementIds.includes(r.id));
    const uncoveredTechnical = uncoveredMustReqs.filter((r) => r.kind === "technical" || r.kind === "domain").map(toPromptReq);
    const uncoveredBehavioural = uncoveredMustReqs.filter((r) => r.kind === "behavioural").map(toPromptReq);
    const existingPrompts = questions.map((q) => q.prompt);

    const [gapTechnicalQs, gapBehaviouralQs] = await Promise.all([
      uncoveredTechnical.length > 0
        ? generateQuestions({ category: "technical", requirements: uncoveredTechnical, hiringSignals, excludePrompts: existingPrompts })
        : Promise.resolve<GeneratedQuestion[]>([]),
      uncoveredBehavioural.length > 0
        ? generateQuestions({
            category: "behavioural",
            requirements: uncoveredBehavioural,
            hiringSignals,
            excludePrompts: existingPrompts,
          })
        : Promise.resolve<GeneratedQuestion[]>([]),
    ]);

    const before = coverage.uncoveredMustRequirementIds.length;
    appendGenerated(gapTechnicalQs, "technical");
    appendGenerated(gapBehaviouralQs, "behavioural");
    passes++;
    coverage = checkCoverage(requirements, questions);

    // A pass that closed nothing isn't going to converge by repeating — stop rather than burn more calls.
    if (coverage.uncoveredMustRequirementIds.length === before) break;
  }

  if (coverage.uncoveredMustRequirementIds.length > 0) {
    warnings.push(
      `could not generate a question for ${coverage.uncoveredMustRequirementIds.length} must-have requirement(s) after ${passes} pass(es)`,
    );
  }

  onProgress("Generating flashcards");
  const generatedFlashcards = await generateFlashcards(
    questions.map((q) => ({
      id: q.id,
      requirement_ids: q.requirement_ids,
      category: q.category,
      prompt: q.prompt,
      answer_outline: q.answer_outline,
    })),
  );
  const flashcards: Flashcard[] = generatedFlashcards.map((f, i) => ({
    id: `f${i + 1}`,
    front: f.front,
    back: f.back,
    requirement_ids: f.requirement_ids,
    _meta: freshMeta(i),
  }));

  // Deterministic — never the model's call (Section 3, Section 8).
  onProgress("Building the study schedule");
  const scheduleDays = allocateSchedule(
    questions.map((q) => ({ id: q.id, category: q.category, difficulty: q.difficulty, requirement_ids: q.requirement_ids })),
    requirements.map((r) => ({ id: r.id, priority: r.priority })),
    input.daysAvailable,
  );

  const pagesUsed = [...new Set([...research.pages.map((p) => p.finalUrl), ...research.searchResults.map((s) => s.url)])];

  const kit: Kit = {
    source: {
      company: research.companyName,
      company_url: input.companyUrl,
      role: analysis.title,
      location: analysis.location,
      jd_chars: input.jd.length,
      researched_at: new Date().toISOString(),
      pages_used: pagesUsed,
    },
    company_brief: { ...brief, _meta: freshMeta(0) },
    role: {
      title: analysis.title,
      seniority: analysis.seniority,
      responsibilities: analysis.responsibilities,
      requirements,
    },
    questions,
    flashcards,
    schedule: { days_available: input.daysAvailable, days: scheduleDays },
    coverage: { uncovered_requirement_ids: coverage.uncoveredRequirementIds, passes },
  };

  onProgress("Validating the generated kit");
  const validation = validateKit(kit);
  if (!validation.valid) {
    throw new Error(`buildKit produced a kit that failed its own structure validation: ${validation.errors.join("; ")}`);
  }

  return { kit, warnings, research: { hiringSignals, briefPages, searchSnippets } };
}
