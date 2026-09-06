import { z } from "zod";
import { RequirementKind, RequirementPriority } from "@prep-kit/schema";
import { callGeminiJson, wrapUntrusted, UNTRUSTED_CONTENT_POLICY } from "../llm/gemini-client.js";

export interface ExtractedRequirement {
  text: string;
  kind: z.infer<typeof RequirementKind>;
  priority: z.infer<typeof RequirementPriority>;
}

const ExtractRequirementsOutputSchema = z.object({
  requirements: z.array(
    z.object({
      text: z.string().min(1),
      kind: RequirementKind,
      priority: RequirementPriority,
    }),
  ),
});

const SYSTEM_INSTRUCTION = `You extract hiring requirements from a job description for an interview-prep tool. ${UNTRUSTED_CONTENT_POLICY}

Rules:
- Only extract requirements the job description actually states. Do not invent requirements, seniority levels, or technologies it doesn't mention.
- priority is "must" only for requirements phrased as required, essential, or stated without qualification (e.g. "5+ years with React", "must have X"). priority is "nice" for anything phrased as a bonus, preferred, or optional (e.g. "bonus points for", "nice to have", "preferred but not required").
- kind is "technical" for specific tools/languages/systems, "behavioural" for soft skills, collaboration or leadership, or "domain" for industry/business-domain knowledge.
- If the job description is short and only states one or two concrete requirements, return only those. A thin posting should produce a thin, honest list, not a padded one.
- Return JSON only, matching exactly: { "requirements": [{ "text": string, "kind": "technical"|"behavioural"|"domain", "priority": "must"|"nice" }] }`;

/** Deliberately not the model's decision to phrase priority loosely — the wording of the posting drives must/nice, per Section 5. */
export async function extractRequirements(jd: string): Promise<ExtractedRequirement[]> {
  const prompt = `Extract the requirements from this job description.\n\n${wrapUntrusted("job_description", jd)}`;
  const result = await callGeminiJson(prompt, ExtractRequirementsOutputSchema, {
    systemInstruction: SYSTEM_INSTRUCTION,
    temperature: 0.2,
  });
  return result.requirements;
}
