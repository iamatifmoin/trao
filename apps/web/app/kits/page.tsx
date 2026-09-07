"use client";

import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { kitsApi } from "@/lib/api";
import { ApiError } from "@/lib/api-client";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import { Nav } from "@/components/Nav";
import { Button } from "@/components/Button";
import { ErrorBanner } from "@/components/ErrorBanner";
import { PageSpinner } from "@/components/Spinner";
import { StatusBadge } from "@/components/StatusBadge";

function KitsList() {
  const { data, isLoading, error } = useQuery({
    queryKey: ["kits"],
    queryFn: () => kitsApi.list(),
  });

  if (isLoading) return <PageSpinner label="Loading your kits…" />;
  if (error) return <ErrorBanner message={error instanceof ApiError ? error.message : "Could not load your kits."} />;

  const kits = data?.kits ?? [];

  if (kits.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-slate-300 bg-white p-10 text-center">
        <p className="text-sm text-slate-600">You haven&apos;t created any kits yet.</p>
        <Link href="/kits/new" className="mt-4 inline-block">
          <Button>Create your first kit</Button>
        </Link>
      </div>
    );
  }

  return (
    <ul className="space-y-3">
      {kits.map((kit) => (
        <li key={kit.id}>
          <Link
            href={`/kits/${kit.id}`}
            className="block rounded-xl border border-slate-200 bg-white p-4 transition-shadow hover:shadow-sm focus-visible:shadow-sm"
          >
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="truncate font-medium text-slate-900">
                  {kit.role ?? (kit.input.jd.slice(0, 60) || "Untitled role")}
                </p>
                <p className="mt-0.5 truncate text-sm text-slate-500">
                  {kit.company ?? kit.input.companyUrl} · {kit.input.days} day{kit.input.days === 1 ? "" : "s"}
                </p>
                {kit.status !== "ready" && kit.status !== "failed" && (
                  <p className="mt-1 text-xs text-slate-400">{kit.progress.step}</p>
                )}
                {kit.status === "failed" && kit.error && <p className="mt-1 text-xs text-red-600">{kit.error.message}</p>}
              </div>
              <StatusBadge status={kit.status} />
            </div>
          </Link>
        </li>
      ))}
    </ul>
  );
}

export default function KitsPage() {
  return (
    <ProtectedRoute>
      <Nav />
      <main className="mx-auto max-w-5xl px-4 py-8 sm:px-6">
        <div className="mb-6 flex items-center justify-between">
          <h1 className="text-xl font-semibold text-slate-900">Your kits</h1>
          <Link href="/kits/new">
            <Button>New kit</Button>
          </Link>
        </div>
        <KitsList />
      </main>
    </ProtectedRoute>
  );
}
