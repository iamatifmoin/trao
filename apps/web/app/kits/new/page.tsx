"use client";

import { useRef, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import { kitsApi, type CreateKitInput } from "@/lib/api";
import { ApiError } from "@/lib/api-client";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import { Nav } from "@/components/Nav";
import { Button } from "@/components/Button";
import { ErrorBanner } from "@/components/ErrorBanner";

type Mode = "single" | "batch";

function parseBatchFile(raw: string): CreateKitInput[] {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error("That file isn't valid JSON.");
  }
  if (!Array.isArray(parsed)) {
    throw new Error("Expected a JSON array of { jd, company_url, days } entries.");
  }

  return parsed.map((entry, i) => {
    if (
      typeof entry !== "object" ||
      entry === null ||
      typeof (entry as Record<string, unknown>).jd !== "string" ||
      typeof (entry as Record<string, unknown>).company_url !== "string" ||
      typeof (entry as Record<string, unknown>).days !== "number"
    ) {
      throw new Error(`Entry ${i + 1} is missing jd, company_url, or days.`);
    }
    const e = entry as Record<string, unknown>;
    return { jd: e.jd as string, company_url: e.company_url as string, days: e.days as number };
  });
}

function NewKitForm() {
  const [mode, setMode] = useState<Mode>("single");
  const router = useRouter();
  const queryClient = useQueryClient();

  // Single-kit form state
  const [jd, setJd] = useState("");
  const [companyUrl, setCompanyUrl] = useState("");
  const [days, setDays] = useState(5);
  const [singleError, setSingleError] = useState<string | null>(null);
  const [isSubmittingSingle, setIsSubmittingSingle] = useState(false);

  // Batch form state
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [batchCases, setBatchCases] = useState<CreateKitInput[] | null>(null);
  const [batchError, setBatchError] = useState<string | null>(null);
  const [isSubmittingBatch, setIsSubmittingBatch] = useState(false);

  async function handleSingleSubmit(e: FormEvent) {
    e.preventDefault();
    setSingleError(null);
    setIsSubmittingSingle(true);
    try {
      const { kit, duplicate } = await kitsApi.create({ jd, company_url: companyUrl, days });
      await queryClient.invalidateQueries({ queryKey: ["kits"] });
      router.push(`/kits/${kit.id}${duplicate ? "?duplicate=1" : ""}`);
    } catch (err) {
      setSingleError(err instanceof ApiError ? err.message : "Could not create the kit. Please try again.");
    } finally {
      setIsSubmittingSingle(false);
    }
  }

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    setBatchError(null);
    setBatchCases(null);
    const file = e.target.files?.[0];
    if (!file) return;

    file
      .text()
      .then((raw) => setBatchCases(parseBatchFile(raw)))
      .catch((err: Error) => setBatchError(err.message));
  }

  async function handleBatchSubmit() {
    if (!batchCases || batchCases.length === 0) return;
    setBatchError(null);
    setIsSubmittingBatch(true);
    try {
      await kitsApi.createBatch(batchCases);
      await queryClient.invalidateQueries({ queryKey: ["kits"] });
      router.push("/kits");
    } catch (err) {
      setBatchError(err instanceof ApiError ? err.message : "Could not submit the batch. Please try again.");
    } finally {
      setIsSubmittingBatch(false);
    }
  }

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-6">
      <div className="mb-6 flex gap-1 rounded-lg bg-slate-100 p-1" role="tablist" aria-label="Kit creation mode">
        <button
          type="button"
          role="tab"
          aria-selected={mode === "single"}
          onClick={() => setMode("single")}
          className={`flex-1 rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
            mode === "single" ? "bg-white text-slate-900 shadow-sm" : "text-slate-500"
          }`}
        >
          Paste one
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={mode === "batch"}
          onClick={() => setMode("batch")}
          className={`flex-1 rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
            mode === "batch" ? "bg-white text-slate-900 shadow-sm" : "text-slate-500"
          }`}
        >
          Upload a file
        </button>
      </div>

      {mode === "single" ? (
        <form onSubmit={handleSingleSubmit} className="space-y-4">
          {singleError && <ErrorBanner message={singleError} />}

          <div>
            <label htmlFor="jd" className="block text-sm font-medium text-slate-700">
              Job description
            </label>
            <textarea
              id="jd"
              required
              rows={10}
              value={jd}
              onChange={(e) => setJd(e.target.value)}
              placeholder="Paste the full job description here…"
              className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-brand-500"
            />
          </div>

          <div>
            <label htmlFor="companyUrl" className="block text-sm font-medium text-slate-700">
              Company website
            </label>
            <input
              id="companyUrl"
              type="text"
              required
              value={companyUrl}
              onChange={(e) => setCompanyUrl(e.target.value)}
              placeholder="https://example.com"
              className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-brand-500"
            />
          </div>

          <div className="max-w-[10rem]">
            <label htmlFor="days" className="block text-sm font-medium text-slate-700">
              Days until interview
            </label>
            <input
              id="days"
              type="number"
              required
              min={1}
              max={90}
              value={days}
              onChange={(e) => setDays(Number(e.target.value))}
              className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-brand-500"
            />
          </div>

          <Button type="submit" disabled={isSubmittingSingle}>
            {isSubmittingSingle ? "Starting…" : "Generate kit"}
          </Button>
        </form>
      ) : (
        <div className="space-y-4">
          {batchError && <ErrorBanner message={batchError} />}

          <div>
            <label htmlFor="batchFile" className="block text-sm font-medium text-slate-700">
              Cases file (JSON array of {"{ jd, company_url, days }"})
            </label>
            <input
              ref={fileInputRef}
              id="batchFile"
              type="file"
              accept="application/json"
              onChange={handleFileChange}
              className="mt-1 block w-full text-sm text-slate-600 file:mr-3 file:rounded-md file:border-0 file:bg-brand-50 file:px-3 file:py-1.5 file:text-sm file:font-medium file:text-brand-700 hover:file:bg-brand-100"
            />
            <p className="mt-1 text-xs text-slate-400">
              Uses the same shape as the batch evaluation cases file — an <code>id</code> field, if present, is ignored.
            </p>
          </div>

          {batchCases && (
            <div className="rounded-md border border-slate-200 bg-slate-50 p-3 text-sm text-slate-600">
              <p className="font-medium text-slate-700">{batchCases.length} case(s) ready to submit</p>
              <ul className="mt-1 list-inside list-disc space-y-0.5">
                {batchCases.slice(0, 5).map((c, i) => (
                  <li key={i} className="truncate">
                    {c.company_url} — {c.days} day{c.days === 1 ? "" : "s"}
                  </li>
                ))}
                {batchCases.length > 5 && <li>…and {batchCases.length - 5} more</li>}
              </ul>
            </div>
          )}

          <Button onClick={handleBatchSubmit} disabled={!batchCases || isSubmittingBatch}>
            {isSubmittingBatch ? "Starting…" : `Generate ${batchCases?.length ?? ""} kit(s)`}
          </Button>
        </div>
      )}
    </div>
  );
}

export default function NewKitPage() {
  return (
    <ProtectedRoute>
      <Nav />
      <main className="mx-auto max-w-2xl px-4 py-8 sm:px-6">
        <h1 className="mb-6 text-xl font-semibold text-slate-900">New kit</h1>
        <NewKitForm />
      </main>
    </ProtectedRoute>
  );
}
