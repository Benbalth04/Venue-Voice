"use client"

export function TextQuestion({
  placeholder,
  value,
  onChange,
}: {
  placeholder?: string
  value: string
  onChange: (next: string) => void
}) {
  return (
    <textarea
      className="min-h-24 w-full resize-y rounded-xl border border-zinc-200 bg-white px-4 py-3 text-base text-zinc-950 shadow-sm outline-none placeholder:text-zinc-400 focus-visible:ring-2 focus-visible:ring-violet-500 focus-visible:ring-offset-2"
      placeholder={placeholder ?? "Type your response..."}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      aria-label="Text response"
    />
  )
}

