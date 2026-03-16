"use client"

import { useEffect, useState } from "react"
import { fetchQuestionTypesPublic, type QuestionTypeResponse } from "@/lib/api/client"

const CATEGORY_LABELS: Record<string, string> = {
  rating: "Rating",
  text: "Text",
  choice: "Choice",
  customer_details: "Customer Details",
}

export function Toolbar({
  onAdd,
  questionTypes: questionTypesProp,
  // Legacy props – kept for backward compatibility with /surveys/new
  onAddStar,
  onAddText,
}: {
  onAdd?: (type: string) => void
  questionTypes?: QuestionTypeResponse[]
  onAddStar?: () => void
  onAddText?: () => void
}) {
  const [questionTypesState, setQuestionTypesState] = useState<QuestionTypeResponse[]>([])
  const [loading, setLoading] = useState(!questionTypesProp)

  useEffect(() => {
    if (questionTypesProp) {
      setQuestionTypesState(questionTypesProp)
      setLoading(false)
      return
    }
    fetchQuestionTypesPublic()
      .then(setQuestionTypesState)
      .catch(() => setQuestionTypesState([]))
      .finally(() => setLoading(false))
  }, [questionTypesProp])

  const questionTypes = questionTypesProp ?? questionTypesState

  const groups = (() => {
    const byCategory = new Map<string, QuestionTypeResponse[]>()
    for (const qt of questionTypes) {
      const list = byCategory.get(qt.category) ?? []
      list.push(qt)
      byCategory.set(qt.category, list)
    }
    return Array.from(byCategory.entries()).map(([category, types]) => ({
      label: CATEGORY_LABELS[category] ?? category,
      types,
    }))
  })()

  function handleAdd(type: string) {
    if (onAdd) {
      onAdd(type)
    } else if (type === "star" && onAddStar) {
      onAddStar()
    } else if (type === "text" && onAddText) {
      onAddText()
    }
  }

  if (loading) {
    return (
      <div className="px-3 py-4 text-sm text-zinc-400">Loading question types…</div>
    )
  }

  return (
    <div className="flex flex-col gap-0">
      {groups.map((group) => (
        <div key={group.label}>
          <div className="px-3 pb-1 pt-3 text-[10px] font-semibold uppercase tracking-wider text-zinc-400">
            {group.label}
          </div>
          {group.types.map((qt) => (
            <button
              key={qt.type}
              type="button"
              onClick={() => handleAdd(qt.type)}
              className="w-full px-3 py-2 text-left text-sm text-zinc-700 hover:bg-violet-50 hover:text-violet-700"
            >
              {qt.label}
            </button>
          ))}
        </div>
      ))}
    </div>
  )
}
