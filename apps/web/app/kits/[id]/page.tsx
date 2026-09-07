"use client";

import { useParams, useSearchParams } from "next/navigation";
import { useKit } from "@/lib/use-kit";
import { ApiError } from "@/lib/api-client";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import { Nav } from "@/components/Nav";
import { PageSpinner } from "@/components/Spinner";
import { ErrorBanner } from "@/components/ErrorBanner";
import { GenerationProgress } from "@/components/kit/GenerationProgress";
import { KitViewer } from "@/components/kit/KitViewer";

function KitDetailContent() {
  const params = useParams<{ id: string }>();
  const searchParams = useSearchParams();
  const isDuplicate = searchParams.get("duplicate") === "1";
  const { data, isLoading, error } = useKit(params.id);

  if (isLoading) return <PageSpinner label="Loading kit…" />;
  if (error) return <ErrorBanner message={error instanceof ApiError ? error.message : "Could not load this kit."} />;
  if (!data) return null;

  return (
    <div>
      {isDuplicate && (
        <div className="mb-4 rounded-lg bg-brand-50 px-4 py-3 text-sm text-brand-700">
          You already had a kit for this job description and company — showing that one instead of starting a new generation.
        </div>
      )}
      {data.status === "ready" && data.kit ? <KitViewer detail={data} /> : <GenerationProgress kit={data} />}
    </div>
  );
}

export default function KitDetailPage() {
  return (
    <ProtectedRoute>
      <Nav />
      <main className="mx-auto max-w-4xl px-4 py-8 sm:px-6">
        <KitDetailContent />
      </main>
    </ProtectedRoute>
  );
}
