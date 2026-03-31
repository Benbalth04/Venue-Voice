"use client"

import { Info } from "lucide-react"

export const AI_ANALYSIS_TOOLTIP_PRESENT =
  "We use AI to analyse this text. Please be aware it may not always be 100% correct."

export const AI_ANALYSIS_TOOLTIP_PAST =
  "We used AI to analyse this text. Please be aware it may not always be 100% correct."

type Variant = "present" | "past"

const COPY: Record<Variant, string> = {
  present: AI_ANALYSIS_TOOLTIP_PRESENT,
  past: AI_ANALYSIS_TOOLTIP_PAST,
}

export function AiAnalysisInfoTooltip({
  variant,
  className,
}: {
  variant: Variant
  className?: string
}) {
  const text = COPY[variant]

  return (
    <span className={`group relative inline-flex shrink-0 ${className ?? ""}`}>
      <button
        type="button"
        className="inline-flex items-center justify-center rounded p-0.5 text-violet-600 outline-none transition-colors hover:text-violet-700 focus-visible:ring-2 focus-visible:ring-violet-400 focus-visible:ring-offset-1"
        aria-label={text}
      >
        <Info className="h-4 w-4" aria-hidden />
      </button>
      <span
        role="tooltip"
        className="pointer-events-none invisible absolute left-1/2 top-full z-[60] mt-1.5 w-max max-w-xs -translate-x-1/2 rounded-lg border border-zinc-200 bg-white px-3 py-2 text-left text-xs leading-snug text-zinc-700 shadow-lg opacity-0 transition-opacity duration-150 group-hover:visible group-hover:opacity-100 group-focus-within:visible group-focus-within:opacity-100"
      >
        {text}
      </span>
    </span>
  )
}
