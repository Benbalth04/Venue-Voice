"use client"

export function TextQuestion({
  placeholder,
  multiline = true,
  value,
  onChange,
}: {
  placeholder?: string
  multiline?: boolean
  value: string
  onChange: (next: string) => void
}) {
  const baseClass =
    "w-full rounded-xl border border-zinc-200 bg-white px-4 py-3 text-base text-zinc-950 shadow-sm outline-none placeholder:text-zinc-400 focus-visible:ring-2 focus-visible:ring-violet-500 focus-visible:ring-offset-2"

  if (!multiline) {
    return (
      <input
        type="text"
        className={baseClass}
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
      rows={4}
      placeholder={placeholder ?? "Type your response..."}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      aria-label="Text response"
    />
  )
}

