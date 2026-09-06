import type { CompanyBrief } from "@prep-kit/schema";
import { buildCompanyBrief, type CompanyPageInput, type SearchSnippetInput } from "../generation/company-brief.js";
import { freshGeneratedMeta } from "./item-state.js";

export class BriefPinnedError extends Error {
  constructor() {
    super("The company brief is pinned — unpin it before regenerating.");
    this.name = "BriefPinnedError";
  }
}

export interface RegenerateBriefInput {
  companyUrl: string;
  currentBrief: CompanyBrief;
  briefPages: CompanyPageInput[];
  searchSnippets: SearchSnippetInput[];
}

/**
 * Pinning is the only thing that blocks a direct "regenerate this section"
 * click — a plain edit doesn't, since a single field has nothing else to
 * preserve once the user has explicitly asked to regenerate exactly it.
 */
export async function regenerateCompanyBrief(input: RegenerateBriefInput): Promise<CompanyBrief> {
  if (input.currentBrief._meta?.pinned) {
    throw new BriefPinnedError();
  }

  const result = await buildCompanyBrief({
    companyUrl: input.companyUrl,
    pages: input.briefPages,
    searchSnippets: input.searchSnippets,
  });

  return { ...result, _meta: freshGeneratedMeta(0) };
}
