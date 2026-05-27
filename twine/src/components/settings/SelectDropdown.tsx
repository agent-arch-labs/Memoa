import { useState, useRef } from "react";
import { useClickOutside } from "@/hooks/useClickOutside";

interface Option {
  value: string;
  label: string;
}

interface Props {
  value: string;
  options: Option[];
  onChange: (value: string) => void;
  className?: string;
}

export function SelectDropdown({ value, options, onChange, className = "" }: Props) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useClickOutside(ref, () => setOpen(false), open);

  const activeLabel = options.find((o) => o.value === value)?.label || value;

  return (
    <div className={`relative ${className}`} ref={ref}>
      <button
        className="flex items-center gap-1.5 bg-transparent border border-[var(--color-border)] rounded-lg px-2.5 py-1.5 text-xs text-[var(--color-text-primary)] hover:border-[var(--color-accent)]/40 transition-colors cursor-pointer w-full"
        onClick={() => setOpen(!open)}
      >
        <span className="truncate flex-1 text-left">{activeLabel}</span>
        <svg
          className={`w-2.5 h-2.5 shrink-0 transition-transform duration-200 ${open ? "rotate-180" : ""}`}
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.5"
        >
          <polyline points="6 9 12 15 18 9" />
        </svg>
      </button>

      {open && (
        <div className="absolute top-full left-0 mt-1 bg-[var(--color-surface)] border border-[var(--color-border)] rounded-xl shadow-xl z-50 min-w-full max-h-[240px] overflow-y-auto animate-in slide-in-from-top-2 duration-150">
          <div className="py-1">
            {options.map((opt) => (
              <button
                key={opt.value}
                className={`w-full text-left px-3 py-1.5 text-xs transition-colors truncate ${
                  opt.value === value
                    ? "text-[var(--color-accent)] bg-[var(--color-accent)]/8 font-medium"
                    : "text-[var(--color-text-primary)] hover:bg-[var(--color-surface-hover)]"
                }`}
                onClick={() => {
                  onChange(opt.value);
                  setOpen(false);
                }}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}