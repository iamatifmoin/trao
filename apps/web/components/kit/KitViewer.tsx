"use client";

import Link from "next/link";
import type { KitDetail } from "@/lib/api";
import { useKitMutations } from "@/lib/use-kit-mutations";
import { Button } from "@/components/Button";
import { CompanyBriefSection } from "./CompanyBriefSection";
import { RequirementsSection } from "./RequirementsSection";
import { QuestionBank } from "./QuestionBank";
import { FlashcardsSection } from "./FlashcardsSection";
import { ScheduleSection } from "./ScheduleSection";

export function KitViewer({ detail }: { detail: KitDetail }) {
  const kit = detail.kit!;
  const mutations = useKitMutations(detail.id);

  return (
    <div className="space-y-6">
      <div className="rounded-xl border border-slate-200 bg-white p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-xl font-semibold text-slate-900">{kit.role.title || kit.source.role}</h1>
            <p className="text-sm text-slate-500">
              {kit.source.company} · {kit.role.seniority} · {kit.source.location}
            </p>
          </div>
          <Link href={`/kits/${detail.id}/practice`}>
            <Button>Practice mode</Button>
          </Link>
        </div>
        {kit.role.responsibilities.length > 0 && (
          <ul className="mt-3 list-inside list-disc space-y-0.5 text-sm text-slate-600">
            {kit.role.responsibilities.map((r, i) => (
              <li key={i}>{r}</li>
            ))}
          </ul>
        )}
      </div>

      {detail.warnings.length > 0 && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
          <p className="font-medium">Things worth knowing about this kit</p>
          <ul className="mt-1 list-inside list-disc space-y-0.5">
            {detail.warnings.map((w, i) => (
              <li key={i}>{w}</li>
            ))}
          </ul>
        </div>
      )}

      <CompanyBriefSection kit={kit} mutations={mutations} />
      <RequirementsSection kit={kit} mutations={mutations} />
      <QuestionBank kit={kit} mutations={mutations} />
      <FlashcardsSection kit={kit} mutations={mutations} />
      <ScheduleSection kit={kit} mutations={mutations} />
    </div>
  );
}
