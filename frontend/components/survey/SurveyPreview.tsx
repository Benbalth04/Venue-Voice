"use client"

import { useCallback, useState } from "react"
import { CheckCircle2 } from "lucide-react"
import type { Survey } from "@/lib/survey/types"
import { SurveyRenderer, getUnansweredRequiredIds, type SurveyResponses } from "@/components/survey/SurveyRenderer"

export function SurveyPreview({ survey }: { survey: Survey }) {
  const [responses, setResponses] = useState<SurveyResponses>({})
  const [submitAttempted, setSubmitAttempted] = useState(false)
  const [submitted, setSubmitted] = useState(false)

  const handleSubmit = useCallback(() => {
    setSubmitAttempted(true)
    const missing = getUnansweredRequiredIds(survey, responses)
    if (missing.length === 0) {
      setSubmitted(true)
    }
  }, [survey, responses])

  const missingIds = getUnansweredRequiredIds(survey, responses)
  const hasValidationErrors = submitAttempted && missingIds.length > 0

  if (submitted) {
    return (
      <div
        className="h-full w-full overflow-y-auto p-6 flex items-center justify-center"
        style={{ backgroundColor: survey.theme.backgroundColor }}
      >
        <div
          className="w-full max-w-md rounded-2xl border border-zinc-200 bg-white p-8 text-center shadow-lg"
          style={{ borderTopWidth: "4px", borderTopColor: survey.theme.primaryColor }}
        >
          <CheckCircle2 className="mx-auto h-16 w-16 text-emerald-500" />
          <h1 className="mt-4 text-xl font-semibold text-zinc-900">
            {survey.thankYou?.title ?? "Thank you!"}
          </h1>
          <p className="mt-2 text-zinc-600">
            {survey.thankYou?.content ?? "Your feedback has been received."}
          </p>
        </div>
      </div>
    )
  }

  return (
    <div
      className="h-full w-full overflow-y-auto p-6"
      style={{ backgroundColor: survey.theme.backgroundColor }}
    >
      <div className="w-full">
        <SurveyRenderer
          survey={survey}
          responses={responses}
          onResponseChange={(questionId, next) => {
            setResponses((prev) => ({ ...prev, [questionId]: next }))
          }}
          unansweredRequiredIds={hasValidationErrors ? missingIds : []}
        />

        {hasValidationErrors && (
          <p className="mt-4 text-sm font-medium text-red-600">
            You still have questions to complete.
          </p>
        )}

        <div className="mt-6">
          <button
            type="button"
            className="w-full rounded-xl px-4 py-3 text-base font-semibold text-white outline-none disabled:cursor-not-allowed disabled:opacity-50"
            style={{ backgroundColor: survey.theme.primaryColor }}
            aria-label="Submit survey"
            onClick={handleSubmit}
          >
            Submit
          </button>
        </div>
      </div>
    </div>
  )
}