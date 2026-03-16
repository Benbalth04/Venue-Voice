"use client"

import type { Question } from "@/lib/survey/types"

export function QuestionCard({
  question,
  selected,
  dragAttributes,
  dragListeners,
  onSelect,
  onDelete,
  questionTypeLabels,
}: {
  question: Question
  selected: boolean
  dragAttributes: unknown
  dragListeners: unknown
  onSelect: () => void
  onDelete: () => void
  questionTypeLabels?: Record<string, string>
}) {
  return (
    <div
      className={[
        "rounded-xl border bg-white p-6 shadow-sm transition-colors",
        selected ? "border-violet-500" : "border-zinc-200 hover:border-zinc-300",
      ].join(" ")}
      onClick={onSelect}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") onSelect()
      }}
      aria-label={`Select question ${question.id}`}
    >
      <div className="flex items-start gap-3">
        <button
          type="button"
          className="mt-0.5 inline-flex h-9 w-9 cursor-grab items-center justify-center rounded-lg border border-zinc-200 bg-white text-zinc-600 shadow-sm outline-none hover:bg-zinc-50 focus-visible:ring-2 focus-visible:ring-violet-500 focus-visible:ring-offset-2"
          aria-label="Drag handle"
          {...(dragAttributes as Record<string, unknown>)}
          {...(dragListeners as Record<string, unknown>)}
          onClick={(e) => e.stopPropagation()}
        >
          <GripIcon />
        </button>

        <div className="min-w-0 flex-1">
          <div className="text-xs font-semibold uppercase tracking-wide text-zinc-500">
            {questionTypeLabels?.[question.type] ?? questionTypeLabel(question.type)}
          </div>
          <div className="mt-1 truncate text-base font-semibold text-zinc-950">
            {question.title.text || "Untitled question"}
          </div>
          {question.description?.text ? (
            <div className="mt-1 truncate text-sm text-zinc-600">
              {question.description.text}
            </div>
          ) : null}
        </div>

        <button
          type="button"
          className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-zinc-200 bg-white text-zinc-600 shadow-sm outline-none hover:border-red-200 hover:bg-red-50 hover:text-red-600 focus-visible:ring-2 focus-visible:ring-violet-500 focus-visible:ring-offset-2"
          aria-label="Delete question"
          onClick={(e) => {
            e.stopPropagation()
            onDelete()
          }}
        >
          <TrashIcon />
        </button>
      </div>
    </div>
  )
}

function GripIcon() {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="currentColor"
      aria-hidden="true"
    >
      <circle cx="9" cy="6" r="1.5" />
      <circle cx="9" cy="12" r="1.5" />
      <circle cx="9" cy="18" r="1.5" />
      <circle cx="15" cy="6" r="1.5" />
      <circle cx="15" cy="12" r="1.5" />
      <circle cx="15" cy="18" r="1.5" />
    </svg>
  )
}

function questionTypeLabel(type: string): string {
  const labels: Record<string, string> = {
    star: "Star rating",
    text: "Short text",
    long_text: "Long text",
    nps: "NPS score",
    multiple_choice: "Multiple choice",
    checkbox: "Checkboxes",
    yes_no: "Yes / No",
    email: "Email",
    phone: "Phone",
  }
  return labels[type] ?? type
}

function TrashIcon() {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      aria-hidden="true"
    >
      <path d="M3 6h18" />
      <path d="M8 6V4h8v2" />
      <path d="M6 6l1 16h10l1-16" />
    </svg>
  )
}

