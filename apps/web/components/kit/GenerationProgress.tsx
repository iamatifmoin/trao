import Link from "next/link";
import type { KitDetail } from "@/lib/api";
import { Spinner } from "@/components/Spinner";
import { Button } from "@/components/Button";

const STEP_ORDER = [
  "Starting",
  "Extracting requirements from the job description, and researching the company site",
  "Generating the company brief and interview questions for each category",
  "Checking requirement coverage",
  "Generating flashcards",
  "Building the study schedule",
  "Validating the generated kit",
  "Done",
];

export function GenerationProgress({ kit }: { kit: KitDetail }) {
  if (kit.status === "failed") {
    return (
      <div className="rounded-xl border border-red-200 bg-white p-6">
        <h2 className="text-lg font-semibold text-red-700">Generation failed</h2>
        <p className="mt-2 text-sm text-red-700">{kit.error?.message ?? "Something went wrong."}</p>
        {kit.error?.code && <p className="mt-1 text-xs text-slate-400">Error code: {kit.error.code}</p>}
        <Link href="/kits/new" className="mt-4 inline-block">
          <Button>Try a new kit</Button>
        </Link>
      </div>
    );
  }

  const currentIndex = STEP_ORDER.indexOf(kit.progress.step);

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-8">
      <div className="flex flex-col items-center text-center">
        <Spinner label="" />
        <p className="mt-3 text-sm font-medium text-slate-700">{kit.progress.step || "Starting…"}</p>
        <p className="mt-1 text-xs text-slate-400">
          Researching {kit.input.companyUrl} and drafting your kit — this usually takes 30–90 seconds.
        </p>
      </div>

      <ol className="mx-auto mt-8 max-w-md space-y-2">
        {STEP_ORDER.slice(0, -1).map((step, i) => {
          const done = currentIndex > i || (currentIndex === -1 && i === 0);
          const active = currentIndex === i;
          return (
            <li key={step} className="flex items-center gap-2 text-sm">
              <span
                className={`flex h-4 w-4 shrink-0 items-center justify-center rounded-full text-[10px] ${
                  done ? "bg-brand-600 text-white" : active ? "border-2 border-brand-500" : "border border-slate-300"
                }`}
              >
                {done ? "✓" : ""}
              </span>
              <span className={active ? "font-medium text-slate-800" : done ? "text-slate-500" : "text-slate-300"}>{step}</span>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
