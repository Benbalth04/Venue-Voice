"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { useSearchParams } from "next/navigation"
import { Loader2 } from "lucide-react"
import { SurveyRenderer, type SurveyResponses, type SurveyResponseValue } from "@/components/survey/SurveyRenderer"
import {
  fetchSurveyForSession,
  submitSurvey,
} from "@/lib/api/client"

const BACKEND_BASE =
  process.env.NEXT_PUBLIC_BACKEND_BASE_URL ?? "http://localhost:5000"
import type { Survey } from "@/lib/survey/types"
import { surveyFromApi } from "@/lib/survey/richText"

const DRAFT_KEY_PREFIX = "survey-draft-"
const DRAFT_DEBOUNCE_MS = 2000

function responsesToAnswers(responses: SurveyResponses): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  for (const [qId, r] of Object.entries(responses)) {
    if (!r) continue
    if (r.type === "star" || r.type === "nps") out[qId] = r.value
    else if (r.type === "choice") out[qId] = r.value
    else if (r.type === "choices") out[qId] = r.value
    else if (r.type === "text") out[qId] = r.value
  }
  return out
}

function loadDraft(sessionId: string, qrCodeId: string): SurveyResponses | null {
  if (typeof window === "undefined") return null
  try {
    const raw = localStorage.getItem(`${DRAFT_KEY_PREFIX}${sessionId}-${qrCodeId}`)
    if (!raw) return null
    return JSON.parse(raw) as SurveyResponses
  } catch {
    return null
  }
}

function saveDraft(sessionId: string, qrCodeId: string, responses: SurveyResponses) {
  if (typeof window === "undefined") return
  try {
    localStorage.setItem(
      `${DRAFT_KEY_PREFIX}${sessionId}-${qrCodeId}`,
      JSON.stringify(responses),
    )
  } catch {
    // ignore
  }
}

function clearDraft(sessionId: string, qrCodeId: string) {
  if (typeof window === "undefined") return
  try {
    localStorage.removeItem(`${DRAFT_KEY_PREFIX}${sessionId}-${qrCodeId}`)
  } catch {
    // ignore
  }
}

export default function PublicSurveyPageContent() {
  const searchParams = useSearchParams()
  const sessionId = searchParams.get("session") ?? ""
  const qrCodeId = searchParams.get("qr") ?? ""

  const [survey, setSurvey] = useState<Survey | null>(null)
  const [responses, setResponses] = useState<SurveyResponses>({})
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState<string | null>(null)

  const draftTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const responsesRef = useRef(responses)
  const submittedRef = useRef(false)
  responsesRef.current = responses

  useEffect(() => {
    if (!sessionId || !qrCodeId) {
      setError("Invalid session. Please scan the QR code again.")
      setLoading(false)
      return
    }

    let cancelled = false

    async function load() {
      try {
        const data = await fetchSurveyForSession(sessionId, qrCodeId)
        if (cancelled) return

        setSurvey(surveyFromApi(data.schema as Record<string, unknown>))

        const draft = loadDraft(sessionId, qrCodeId)
        if (draft && Object.keys(draft).length > 0) {
          setResponses(draft)
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Failed to load survey")
        }
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    load()
    return () => {
      cancelled = true
    }
  }, [sessionId, qrCodeId])

  const persistDraft = useCallback(() => {
    saveDraft(sessionId, qrCodeId, responsesRef.current)
  }, [sessionId, qrCodeId])

  useEffect(() => {
    if (!sessionId || !qrCodeId || loading) return
    if (draftTimer.current) clearTimeout(draftTimer.current)
    draftTimer.current = setTimeout(persistDraft, DRAFT_DEBOUNCE_MS)
    return () => {
      if (draftTimer.current) clearTimeout(draftTimer.current)
    }
  }, [responses, sessionId, qrCodeId, loading, persistDraft])

  const handleResponseChange = useCallback((questionId: string, next: SurveyResponseValue) => {
    setResponses((prev) => ({ ...prev, [questionId]: next }))
  }, [])

  const handleSubmit = useCallback(async () => {
    if (!sessionId || !qrCodeId || submitting) return

    setSubmitting(true)
    setSubmitError(null)
    try {
      const answers = responsesToAnswers(responsesRef.current)
      const result = await submitSurvey(sessionId, qrCodeId, answers)
      submittedRef.current = true
      clearDraft(sessionId, qrCodeId)
      window.location.href = result.redirect_url
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : "Failed to submit")
    } finally {
      setSubmitting(false)
    }
  }, [sessionId, qrCodeId, submitting])

  useEffect(() => {
    const saveAndAbandon = () => {
      saveDraft(sessionId, qrCodeId, responsesRef.current)
      if (!submittedRef.current && sessionId && qrCodeId) {
        const url = `${BACKEND_BASE}/api/v1/survey/abandon`
        const blob = new Blob(
          [JSON.stringify({ session_id: sessionId, qr_code_id: qrCodeId })],
          { type: "application/json" },
        )
        navigator.sendBeacon(url, blob)
      }
    }
    window.addEventListener("beforeunload", saveAndAbandon)
    window.addEventListener("pagehide", saveAndAbandon)
    return () => {
      window.removeEventListener("beforeunload", saveAndAbandon)
      window.removeEventListener("pagehide", saveAndAbandon)
    }
  }, [sessionId, qrCodeId])

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-zinc-50">
        <Loader2 className="h-8 w-8 animate-spin text-violet-600" />
      </div>
    )
  }

  if (error || !survey) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-zinc-50 px-4">
        <div className="w-full max-w-md rounded-2xl border border-zinc-200 bg-white p-8 text-center shadow-sm">
          <p className="text-lg font-medium text-zinc-900">
            {error ?? "Survey not found"}
          </p>
          <p className="mt-2 text-sm text-zinc-500">
            Please scan the QR code again to access the survey.
          </p>
        </div>
      </div>
    )
  }

  return (
    <div
      className="min-h-screen px-4 py-8"
      style={{ backgroundColor: survey.theme.backgroundColor }}
    >
      <div className="mx-auto max-w-2xl">
        <div
          className="rounded-2xl border border-zinc-200 bg-white p-6 shadow-lg sm:p-8"
          style={{
            fontFamily: survey.theme.fontFamily,
            color: survey.theme.textColor,
          }}
        >
          <SurveyRenderer
            survey={survey}
            responses={responses}
            onResponseChange={handleResponseChange}
          />

          {submitError && (
            <p className="mt-4 text-sm text-red-600">{submitError}</p>
          )}

          <div className="mt-8">
            <button
              type="button"
              onClick={handleSubmit}
              disabled={submitting}
              className="w-full rounded-xl px-4 py-3 text-base font-semibold text-white disabled:opacity-50"
              style={{ backgroundColor: survey.theme.primaryColor }}
            >
              {submitting ? (
                <span className="inline-flex items-center gap-2">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Submitting...
                </span>
              ) : (
                "Submit"
              )}
            </button>
            <div className="mt-6 flex justify-center">
              <img
                src="/venue_voice_logo_3.png"
                alt="Venue Voice"
                className="h-15 w-auto object-contain margin-bottom-0"
                aria-hidden
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
