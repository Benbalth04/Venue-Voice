"use client"

import { useMemo, useState } from "react"
import type { Question, Survey } from "@/lib/survey/types"
import { SurveyRenderer, type SurveyResponses } from "@/components/SurveyRenderer"

export function SurveyPreview({ survey }: { survey: Survey }) {
  const [responses, setResponses] = useState<SurveyResponses>({})

  const canSubmit = useMemo(() => {
    return true
  }, [])

  return (
    <div
      className="h-full w-full overflow-y-auto p-8"
      style={{ backgroundColor: survey.theme.backgroundColor }}
    >
      <div className="w-full">
        <SurveyRenderer
          survey={survey}
          responses={responses}
          onResponseChange={(questionId, next) => {
            setResponses((prev) => ({ ...prev, [questionId]: next }))
          }}
        />

        <div className="mt-8">
          <button
            type="button"
            className="w-full rounded-xl bg-violet-600 px-4 py-3 text-sm font-semibold text-white shadow-sm outline-none hover:bg-violet-700 focus-visible:ring-2 focus-visible:ring-violet-500 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60"
            disabled={!canSubmit}
            aria-label="Submit survey"
            onClick={() => {
              setResponses((prev) => prev)
            }}
          >
            Submit
          </button>
        </div>

        {survey.settings.showProgressBar ? (
          <ProgressBar survey={survey} responses={responses} />
        ) : null}
      </div>
    </div>
  )
}

function ProgressBar({
  survey,
  responses,
}: {
  survey: Survey
  responses: SurveyResponses
}) {
  const required: Question[] = survey.questions.filter((q) => !q.optional)
  const requiredCount = required.length

  const answeredRequired = required.filter((q) => {
    const r = responses[q.id]
    if (!r) return false
    if (r.type === "star") return r.value !== null
    return r.value.trim().length > 0
  }).length

  const denom = Math.max(1, requiredCount)
  const progress = Math.max(0, Math.min(1, answeredRequired / denom))

  return (
    <div className="mt-6">
      <div className="h-2 w-full overflow-hidden rounded-full bg-zinc-100">
        <div
          className="h-full rounded-full transition-[width]"
          style={{
            width: `${Math.round(progress * 100)}%`,
            backgroundColor: survey.settings.progressBarColor,
          }}
          role="progressbar"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={Math.round(progress * 100)}
        />
      </div>

      {requiredCount ? (
        <div className="mt-2 text-xs text-zinc-500">
          {answeredRequired}/{requiredCount} required answered
        </div>
      ) : (
        <div className="mt-2 text-xs text-zinc-500">
          All questions optional
        </div>
      )}
    </div>
  )
}