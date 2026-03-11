"use client"

import { useMemo, useState } from "react"

export function StarQuestion({
  starCount,
  selectedColor,
  value,
  align = "left",
  onChange,
}: {
  starCount: number
  selectedColor: string
  value: number | null
  align?: "left" | "center" | "right"
  onChange: (next: number | null) => void
}) {
  const stars = Array.from({ length: starCount }, (_, i) => i + 1)
  const [hover, setHover] = useState<number | null>(null)

  const hoverColor = useMemo(() => toRgba(selectedColor, 0.5), [selectedColor])
  const justify =
    align === "center"
      ? "justify-center"
      : align === "right"
        ? "justify-end"
        : "justify-start"

  return (
    <div
      className={`flex items-center gap-1 ${justify}`}
      role="radiogroup"
      aria-label="Star rating"
      onMouseLeave={() => setHover(null)}
    >
      {stars.map((n) => {
        const selected = value !== null && n <= value
        const hoverOn = hover !== null && n <= hover
        const fill = selected ? selectedColor : hoverOn ? hoverColor : "none"
        const stroke = selected ? selectedColor : hoverOn ? hoverColor : "#A1A1AA"

        return (
          <button
            key={n}
            type="button"
            className="group rounded-md px-1 py-1 outline-none focus-visible:ring-2 focus-visible:ring-violet-500 focus-visible:ring-offset-2"
            role="radio"
            aria-checked={value === n}
            aria-label={`${n} star${n === 1 ? "" : "s"}`}
            onMouseEnter={() => setHover(n)}
            onClick={() => onChange(n)}
            onKeyDown={(e) => {
              if (e.key === "Backspace" || e.key === "Delete") onChange(null)
              if (e.key === "ArrowLeft") onChange(Math.max(1, (value ?? 1) - 1))
              if (e.key === "ArrowRight")
                onChange(Math.min(starCount, (value ?? 0) + 1))
            }}
          >
            <svg
              width="26"
              height="26"
              viewBox="0 0 24 24"
              fill={fill}
              stroke={stroke}
              strokeWidth="1.6"
              className="transition-colors group-hover:stroke-zinc-700"
              aria-hidden="true"
            >
              <path d="M12 2l2.85 6.63 7.15.62-5.42 4.7 1.62 7.05L12 17.77 5.8 21l1.62-7.05L2 9.25l7.15-.62L12 2z" />
            </svg>
          </button>
        )
      })}
    </div>
  )
}

function toRgba(hex: string, alpha: number) {
  const normalized = hex.replace("#", "").trim()
  const full =
    normalized.length === 3
      ? normalized
          .split("")
          .map((c) => c + c)
          .join("")
      : normalized
  if (full.length !== 6) return hex

  const r = parseInt(full.slice(0, 2), 16)
  const g = parseInt(full.slice(2, 4), 16)
  const b = parseInt(full.slice(4, 6), 16)
  return `rgba(${r}, ${g}, ${b}, ${alpha})`
}

