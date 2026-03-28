"use client";

import type { TimePreset } from "@/lib/dashboard/types";

const PRESETS: { label: string; value: TimePreset }[] = [
  { label: "24h", value: "24h" },
  { label: "7d", value: "7d" },
  { label: "30d", value: "30d" },
  { label: "90d", value: "90d" },
  { label: "Custom", value: "custom" },
];

interface Props {
  value: TimePreset;
  onChange: (preset: TimePreset) => void;
  dateStart: Date | null;
  dateEnd: Date | null;
  onDateStartChange: (d: Date | null) => void;
  onDateEndChange: (d: Date | null) => void;
}

function toInputValue(d: Date | null): string {
  if (!d) return "";
  return d.toISOString().slice(0, 10);
}

export function TimePresetSelector({
  value,
  onChange,
  dateStart,
  dateEnd,
  onDateStartChange,
  onDateEndChange,
}: Props) {
  return (
    <div className="flex flex-col gap-1.5">
      <label className="text-xs font-medium text-zinc-500 uppercase tracking-wide">
        Time Range
      </label>
      <div className="flex flex-wrap items-center gap-2">
        {/* Button group — same height as DropdownSelect (py-2 + text-sm border) */}
        <div className="flex rounded-xl border border-zinc-200 bg-white overflow-hidden">
          {PRESETS.map((p) => (
            <button
              key={p.value}
              type="button"
              onClick={() => onChange(p.value)}
              className={[
                "px-3 py-2 text-sm font-medium transition-colors",
                value === p.value
                  ? "bg-violet-600 text-white"
                  : "text-zinc-600 hover:bg-zinc-50",
              ].join(" ")}
            >
              {p.label}
            </button>
          ))}
        </div>
        {value === "custom" && (
          <div className="flex items-center gap-2">
            <input
              type="date"
              value={toInputValue(dateStart)}
              onChange={(e) =>
                onDateStartChange(e.target.value ? new Date(e.target.value) : null)
              }
              className="rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-700 focus:outline-none focus:ring-2 focus:ring-violet-500"
            />
            <span className="text-xs text-zinc-400">to</span>
            <input
              type="date"
              value={toInputValue(dateEnd)}
              onChange={(e) =>
                onDateEndChange(e.target.value ? new Date(e.target.value) : null)
              }
              className="rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-700 focus:outline-none focus:ring-2 focus:ring-violet-500"
            />
          </div>
        )}
      </div>
    </div>
  );
}
