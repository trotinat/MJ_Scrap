"use client";

import { useId, useState, type KeyboardEvent } from "react";
import { X } from "lucide-react";

/** Chips input: Enter or comma adds a value; values are plain strings. */
export function TagInput({
  value,
  onChange,
  placeholder,
  suggestions,
  ariaLabel,
}: {
  value: string[];
  onChange: (v: string[]) => void;
  placeholder?: string;
  suggestions?: { value: string; label: string }[];
  ariaLabel?: string;
}) {
  const [draft, setDraft] = useState("");
  const listId = useId();

  const add = (raw: string) => {
    const parts = raw
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
    if (parts.length === 0) return;
    const next = [...value];
    for (const p of parts) if (!next.some((v) => v.toLowerCase() === p.toLowerCase())) next.push(p);
    onChange(next);
    setDraft("");
  };

  const onKey = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" || e.key === ",") {
      e.preventDefault();
      add(draft);
    } else if (e.key === "Backspace" && !draft && value.length) {
      onChange(value.slice(0, -1));
    }
  };

  return (
    <div className="flex min-h-[42px] flex-wrap items-center gap-1.5 rounded-lg border border-paper-line bg-white px-2 py-1.5 focus-within:border-brand-500 focus-within:ring-1 focus-within:ring-brand-500">
      {value.map((v) => (
        <span key={v} className="inline-flex items-center gap-1 rounded-md bg-paper px-2 py-0.5 text-sm text-ink-soft">
          {v}
          <button type="button" onClick={() => onChange(value.filter((x) => x !== v))} className="text-ink-mute hover:text-ink-soft" aria-label={`Retirer ${v}`}>
            <X className="h-3 w-3" />
          </button>
        </span>
      ))}
      <input
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={onKey}
        onBlur={() => add(draft)}
        placeholder={value.length ? "" : placeholder}
        list={suggestions ? listId : undefined}
        aria-label={ariaLabel}
        className="min-w-[8rem] flex-1 border-0 bg-transparent p-1 text-sm outline-none placeholder:text-ink-mute"
      />
      {suggestions && (
        <datalist id={listId}>
          {suggestions.map((s) => (
            <option key={s.value} value={s.value}>
              {s.label}
            </option>
          ))}
        </datalist>
      )}
    </div>
  );
}
