import type { Kit } from "@prep-kit/schema";
import { EditableField } from "./EditableField";
import { OriginBadge, PinButton } from "./ItemChrome";
import { Button } from "@/components/Button";
import type { useKitMutations } from "@/lib/use-kit-mutations";

export function CompanyBriefSection({
  kit,
  mutations,
}: {
  kit: Kit;
  mutations: ReturnType<typeof useKitMutations>;
}) {
  const brief = kit.company_brief;
  const pinned = brief._meta?.pinned ?? false;

  return (
    <section aria-labelledby="brief-heading" className="rounded-xl border border-slate-200 bg-white p-5">
      <div className="mb-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <h2 id="brief-heading" className="text-base font-semibold text-slate-900">
            Company brief
          </h2>
          <OriginBadge meta={brief._meta} />
        </div>
        <div className="flex items-center gap-1">
          <PinButton pinned={pinned} onToggle={() => mutations.companyBriefPinToggle.mutate(!pinned)} label="company brief" />
          <Button
            variant="secondary"
            onClick={() => mutations.companyBriefRegenerate.mutate()}
            disabled={mutations.companyBriefRegenerate.isPending || pinned}
            title={pinned ? "Unpin to regenerate" : undefined}
          >
            {mutations.companyBriefRegenerate.isPending ? "Regenerating…" : "Regenerate"}
          </Button>
        </div>
      </div>

      <div className="space-y-3">
        <div>
          <p className="text-xs font-medium uppercase tracking-wide text-slate-400">What they do</p>
          <EditableField
            as="textarea"
            rows={2}
            label="What the company does"
            value={brief.what_they_do}
            onCommit={(what_they_do) => mutations.companyBriefUpdate.mutate({ what_they_do })}
          />
        </div>
        <div>
          <p className="text-xs font-medium uppercase tracking-wide text-slate-400">Summary</p>
          <EditableField
            as="textarea"
            rows={3}
            label="Company brief summary"
            value={brief.summary}
            onCommit={(summary) => mutations.companyBriefUpdate.mutate({ summary })}
          />
        </div>
        {brief.sources.length > 0 && (
          <div>
            <p className="text-xs font-medium uppercase tracking-wide text-slate-400">Sources</p>
            <ul className="mt-1 space-y-0.5">
              {brief.sources.map((url) => (
                <li key={url} className="truncate text-xs text-brand-600">
                  <a href={url} target="_blank" rel="noreferrer" className="hover:underline">
                    {url}
                  </a>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </section>
  );
}
