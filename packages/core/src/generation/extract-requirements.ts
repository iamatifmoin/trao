import { z } from "zod";
import { RequirementKind, RequirementPriority } from "@prep-kit/schema";
import { callGeminiJson, wrapUntrusted, UNTRUSTED_CONTENT_POLICY } from "../llm/gemini-client.js";

export interface ExtractedRequirement {
  text: string;
  kind: z.infer<typeof RequirementKind>;
  priority: z.infer<typeof RequirementPriority>;
}

export interface JobDescriptionAnalysis {
  title: string;
  seniority: string;
  location: string;
  responsibilities: string[];
  requirements: ExtractedRequirement[];
}

const ExtractRequirementsOutputSchema = z.object({
  title: z.string(),
  seniority: z.string(),
  location: z.string(),
  responsibilities: z.array(z.string()),
  requirements: z.array(
    z.object({
      text: z.string().min(1),
      kind: RequirementKind,
      priority: RequirementPriority,
    }),
  ),
});

const SYSTEM_INSTRUCTION = `You extract structured facts from a job description for an interview-prep tool. ${UNTRUSTED_CONTENT_POLICY}

Rules:
- title is the job title as stated. If no clear title is stated, write a short best-effort label (e.g. "Not specified in the posting") rather than inventing a specific title.
- seniority is a short label (e.g. "Junior", "Mid", "Senior", "Staff") inferred only from what the posting actually says (years of experience required, an explicit level, scope of ownership described). If nothing in the text implies a level, say "Not specified".
- location is what the posting states (a city, "Remote", "Hybrid — <city>", etc). If it isn't stated, say "Not specified".
- responsibilities is a short list of what the role actually does day-to-day, taken from the posting.
- Only extract requirements the job description actually states. Do not invent requirements, seniority levels, or technologies it doesn't mention.
- priority is "must" only for requirements phrased as required, essential, or stated without qualification (e.g. "5+ years with React", "must have X"). priority is "nice" for anything phrased as a bonus, preferred, or optional (e.g. "bonus points for", "nice to have", "preferred but not required").
- kind is "technical" for specific tools/languages/systems, "behavioural" for soft skills, collaboration or leadership, or "domain" for industry/business-domain knowledge.
- If the job description is short and only states one or two concrete requirements, return only those. A thin posting should produce a thin, honest list, not a padded one.
- Return JSON only, matching exactly: { "title": string, "seniority": string, "location": string, "responsibilities": string[], "requirements": [{ "text": string, "kind": "technical"|"behavioural"|"domain", "priority": "must"|"nice" }] }`;

/**
 * One read of the job description does double duty: the requirements list
 * (Section 3's first step, and the thing coverage-checking depends on) and
 * the role metadata Appendix A also needs (title/seniority/responsibilities).
 * These aren't a second category of judgment call the way technical vs.
 * behavioural question generation is — deliberately not the model's
 * decision to phrase priority loosely, though: the wording of the posting
 * drives must/nice, per Section 5.
 */
export async function extractRequirements(jd: string): Promise<JobDescriptionAnalysis> {
  const prompt = `Extract structured facts from this job description.\n\n${wrapUntrusted("job_description", jd)}`;
  return callGeminiJson(prompt, ExtractRequirementsOutputSchema, {
    systemInstruction: SYSTEM_INSTRUCTION,
    temperature: 0.2,
  });
}
