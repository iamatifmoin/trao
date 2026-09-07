"use client";

import { useEffect, useState } from "react";

interface EditableTextProps {
  value: string;
  onCommit: (value: string) => void;
  label: string;
  className?: string;
  as?: "input" | "textarea";
  rows?: number;
}

/**
 * Local state until blur, then commits — this is what makes editing feel
 * immediate (Section 12) without round-tripping on every keystroke: typing
 * itself never touches the network, only leaving the field does.
 */
export function EditableField({ value, onCommit, label, className = "", as = "input", rows = 3 }: EditableTextProps) {
  const [draft, setDraft] = useState(value);

  useEffect(() => {
    setDraft(value);
  }, [value]);

  function commitIfChanged() {
    if (draft.trim() !== value.trim() && draft.trim().length > 0) {
      onCommit(draft.trim());
    } else {
      setDraft(value);
    }
  }

  const shared = {
    "aria-label": label,
    value: draft,
    onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setDraft(e.target.value),
    onBlur: commitIfChanged,
    className: `w-full rounded-md border border-transparent bg-transparent px-2 py-1 text-sm hover:border-slate-200 focus:border-brand-500 focus:bg-white ${className}`,
  };

  if (as === "textarea") {
    return <textarea {...shared} rows={rows} />;
  }
  return <input {...shared} type="text" />;
}
