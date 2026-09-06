import { GeminiError } from "../llm/gemini-client.js";

export interface ClassifiedError {
  code: string;
  message: string;
}

/**
 * Maps whatever buildKit threw to a small, stable set of codes — shared by
 * the batch CLI and the API so a rate-limit failure looks the same
 * whichever entry point hit it (Section 9: "the same code your application
 * uses, not a parallel implementation" extends to how failures are reported).
 */
export function classifyBuildKitError(err: unknown): ClassifiedError {
  if (err instanceof GeminiError) {
    switch (err.code) {
      case "RATE_LIMITED":
        return { code: "LLM_RATE_LIMITED", message: err.message };
      case "NOT_CONFIGURED":
        return { code: "LLM_NOT_CONFIGURED", message: err.message };
      case "INVALID_JSON":
        return { code: "LLM_INVALID_OUTPUT", message: err.message };
      default:
        return { code: "LLM_ERROR", message: err.message };
    }
  }

  return { code: "GENERATION_FAILED", message: err instanceof Error ? err.message : String(err) };
}
