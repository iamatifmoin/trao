import type { KitStatus } from "@/lib/api";

const STATUS_STYLES: Record<KitStatus, string> = {
  pending: "bg-slate-100 text-slate-600",
  generating: "bg-brand-100 text-brand-700",
  ready: "bg-green-100 text-green-700",
  failed: "bg-red-100 text-red-700",
};

const STATUS_LABELS: Record<KitStatus, string> = {
  pending: "Queued",
  generating: "Generating",
  ready: "Ready",
  failed: "Failed",
};

export function StatusBadge({ status }: { status: KitStatus }) {
  return (
    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_STYLES[status]}`}>
      {STATUS_LABELS[status]}
    </span>
  );
}
