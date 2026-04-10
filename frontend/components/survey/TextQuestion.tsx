"use client"

import type { CSSProperties } from "react"

export function TextQuestion({
  placeholder,
  multiline = true,
  value,
  onChange,
  primaryColor,
}: {
  placeholder?: string
  multiline?: boolean
  value: string
  onChange: (next: string) => void
  primaryColor: string
}) {
  const themeStyle = {
    ["--survey-input-ring" as string]: primaryColor,
    caretColor: primaryColor,
  } as CSSProperties

  const baseClass =
    "w-full rounded-xl border border-zinc-200 bg-white px-4 py-3 text-base text-zinc-950 shadow-sm outline-none placeholder:text-zinc-400 focus-visible:border-[color:var(--survey-input-ring)] focus-visible:ring-2 focus-visible:ring-[color:var(--survey-input-ring)] focus-visible:ring-offset-2 selection:bg-[color-mix(in_srgb,var(--survey-input-ring)_22%,transparent)]"

  if (!multiline) {
    return (
      <input
        type="text"
        className={baseClass}
        style={themeStyle}
        placeholder={placeholder ?? "Type your response..."}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        aria-label="Text response"
      />
    )
  }

  return (
    <textarea
      className={`${baseClass} min-h-24 resize-y`}
      style={themeStyle}
      rows={4}
      placeholder={placeholder ?? "Type your response..."}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      aria-label="Text response"
    />
  )
}

