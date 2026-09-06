import { config } from "dotenv";
import path from "node:path";
import { fileURLToPath } from "node:url";
import fs from "node:fs/promises";
import { buildKit, GeminiError, type Kit } from "@prep-kit/core";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
config({ path: path.join(__dirname, "../../../.env") });

interface EvaluationCase {
  id: string;
  jd: string;
  company_url: string;
  days: number;
}

interface KitResultEntry {
  id: string;
  status: "ok" | "failed";
  kit: Kit | null;
  error: { code: string; message: string } | null;
}

interface ParsedArgs {
  input: string;
  output: string;
}

function parseArgs(argv: string[]): ParsedArgs {
  let input: string | undefined;
  let output: string | undefined;

  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--input") input = argv[++i];
    else if (argv[i] === "--output") output = argv[++i];
  }

  if (!input || !output) {
    console.error("Usage: evaluate --input <cases.json> --output <kits.json>");
    process.exit(1);
  }

  return { input, output };
}

function validateCase(raw: unknown): EvaluationCase | null {
  if (typeof raw !== "object" || raw === null) return null;
  const r = raw as Record<string, unknown>;
  if (
    typeof r.id !== "string" ||
    typeof r.jd !== "string" ||
    typeof r.company_url !== "string" ||
    typeof r.days !== "number" ||
    !Number.isInteger(r.days) ||
    r.days < 1
  ) {
    return null;
  }
  return { id: r.id, jd: r.jd, company_url: r.company_url, days: r.days };
}

function idOf(raw: unknown): string {
  if (raw && typeof raw === "object" && typeof (raw as Record<string, unknown>).id === "string") {
    return (raw as Record<string, unknown>).id as string;
  }
  return "unknown";
}

/** A small, stable set of codes rather than surfacing raw provider error strings — Section 9's batch output should be a diagnosable, structured failure. */
function errorCodeFor(err: unknown): string {
  if (err instanceof GeminiError) {
    switch (err.code) {
      case "RATE_LIMITED":
        return "LLM_RATE_LIMITED";
      case "NOT_CONFIGURED":
        return "LLM_NOT_CONFIGURED";
      case "INVALID_JSON":
        return "LLM_INVALID_OUTPUT";
      default:
        return "LLM_ERROR";
    }
  }
  return "GENERATION_FAILED";
}

async function main(): Promise<void> {
  const { input, output } = parseArgs(process.argv.slice(2));

  const rawCases: unknown = JSON.parse(await fs.readFile(input, "utf-8"));
  if (!Array.isArray(rawCases)) {
    console.error(`${input} must contain a JSON array of cases`);
    process.exit(1);
  }

  const results: KitResultEntry[] = [];

  for (const entry of rawCases) {
    const id = idOf(entry);
    const evalCase = validateCase(entry);

    if (!evalCase) {
      console.error(`[${id}] invalid case: expected { id: string, jd: string, company_url: string, days: integer >= 1 }`);
      results.push({
        id,
        status: "failed",
        kit: null,
        error: { code: "INVALID_CASE", message: "case is missing or has the wrong type for id/jd/company_url/days" },
      });
      continue;
    }

    console.error(`[${evalCase.id}] generating kit (days=${evalCase.days})...`);
    try {
      // The batch tool runs against operator-supplied cases (including the
      // local fixture hosts Appendix B itself uses), not arbitrary
      // internet-facing user input — so unlike the deployed API, it always
      // allows private/loopback company URLs rather than gating on NODE_ENV.
      const { kit, warnings } = await buildKit({
        jd: evalCase.jd,
        companyUrl: evalCase.company_url,
        daysAvailable: evalCase.days,
        allowPrivateNetworks: true,
      });
      for (const warning of warnings) console.error(`[${evalCase.id}] warning: ${warning}`);
      results.push({ id: evalCase.id, status: "ok", kit, error: null });
      console.error(`[${evalCase.id}] done`);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error(`[${evalCase.id}] failed: ${message}`);
      results.push({ id: evalCase.id, status: "failed", kit: null, error: { code: errorCodeFor(err), message } });
    }
  }

  const outputPayload = {
    version: "1.0",
    generated_at: new Date().toISOString(),
    kits: results,
  };

  await fs.writeFile(output, JSON.stringify(outputPayload, null, 2), "utf-8");

  const okCount = results.filter((r) => r.status === "ok").length;
  console.error(`Wrote ${results.length} result(s) to ${output} (${okCount} ok, ${results.length - okCount} failed)`);
}

main().catch((err) => {
  console.error("evaluate crashed:", err);
  process.exitCode = 1;
});
