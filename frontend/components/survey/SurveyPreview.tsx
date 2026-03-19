"use client"

import { useCallback, useState } from "react"
import type { Survey } from "@/lib/survey/types"
import { SurveyRenderer, getUnansweredRequiredIds, type SurveyResponses } from "@/components/survey/SurveyRenderer"

export function SurveyPreview({ survey }: { survey: Survey }) {
  const [responses, setResponses] = useState<SurveyResponses>({})
  const [submitAttempted, setSubmitAttempted] = useState(false)

  const handleSubmit = useCallback(() => {
    setSubmitAttempted(true)
  }, [])

  const missingIds = getUnansweredRequiredIds(survey, responses)
  const hasValidationErrors = submitAttempted && missingIds.length > 0

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
            className="w-full rounded-xl bg-violet-600 px-4 py-3 text-sm font-semibold text-white shadow-sm outline-none hover:bg-violet-700 focus-visible:ring-2 focus-visible:ring-violet-500 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60"
            aria-label="Submit survey"
            onClick={handleSubmit}
          >
            Submit
          </button>
          <div className="mt-4 flex justify-center">
            <img
              src="/venue_voice_logo_3.png"
              alt="Venue Voice"
              className="h-12 w-auto object-contain"
              aria-hidden
            />
          </div>
        </div>
      </div>
    </div>
  )
}