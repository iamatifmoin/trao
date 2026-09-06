import { z } from "zod";
import { callGeminiJson, wrapUntrusted, truncate, UNTRUSTED_CONTENT_POLICY } from "../llm/gemini-client.js";

export interface CompanyPageInput {
  url: string;
  title: string;
  text: string;
}

export interface SearchSnippetInput {
  url: string;
  title: string;
  snippet: string;
}

export interface CompanyBriefInput {
  companyUrl: string;
  pages: CompanyPageInput[];
  searchSnippets: SearchSnippetInput[];
}

export interface GeneratedCompanyBrief {
  summary: string;
  what_they_do: string;
  sources: string[];
}

const CompanyBriefOutputSchema = z.object({
  summary: z.string(),
  what_they_do: z.string(),
});

const SYSTEM_INSTRUCTION = `You write short, honest company briefs for interview candidates. ${UNTRUSTED_CONTENT_POLICY}

Rules:
- Base the brief only on the pages and search results given below. Do not invent facts, funding details, headcount, or founding dates that aren't stated in the material.
- If the material is thin or generic, say so plainly rather than padding with confident-sounding filler.
- Return JSON only: { "summary": string, "what_they_do": string }`;

/**
 * When nothing was retrievable, this returns an honest empty brief without
 * calling the model at all — Section 10 explicitly wants "an honest brief
 * rather than a fabricated one" when a company can't be found.
 */
export async function buildCompanyBrief(input: CompanyBriefInput): Promise<GeneratedCompanyBrief> {
  if (input.pages.length === 0 && input.searchSnippets.length === 0) {
    return {
      summary: `No information about this company could be retrieved — the site at ${input.companyUrl} could not be crawled and no public discussion turned up in search. This brief is left thin rather than invented.`,
      what_they_do: "Unknown — no company page or public source could be retrieved.",
      sources: [],
    };
  }

  const pagesBlock = input.pages
    .map((p, i) => wrapUntrusted(`company_page_${i + 1}:${p.url}`, `${p.title}\n${truncate(p.text, 3000)}`))
    .join("\n\n");
  const searchBlock = input.searchSnippets
    .map((s, i) => wrapUntrusted(`search_result_${i + 1}:${s.url}`, `${s.title}\n${s.snippet}`))
    .join("\n\n");

  const prompt = `Company site: ${input.companyUrl}

Pages fetched from the company site:
${pagesBlock || "(none retrieved)"}

Public search results about the company:
${searchBlock || "(none found)"}`;

  const result = await callGeminiJson(prompt, CompanyBriefOutputSchema, {
    systemInstruction: SYSTEM_INSTRUCTION,
    temperature: 0.3,
  });

  return {
    ...result,
    sources: [...input.pages.map((p) => p.url), ...input.searchSnippets.map((s) => s.url)],
  };
}
