"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { useSearchParams } from "next/navigation"
import { Loader2 } from "lucide-react"
import { SurveyRenderer, getUnansweredRequiredIds, type SurveyResponses, type SurveyResponseValue } from "@/components/survey/SurveyRenderer"
import {
  fetchSurveyForSession,
  fetchSurveyRedirect,
  submitSurvey,
  SurveySubmissionValidationError,
  extractErrorMessage,
} from "@/lib/api/client"

const BACKEND_BASE = process.env.NEXT_PUBLIC_BACKEND_BASE_URL
import type { Survey } from "@/lib/survey/types"
import { surveyFromApi } from "@/lib/survey/richText"

const DRAFT_KEY_PREFIX = "survey-draft-"
const DRAFT_DEBOUNCE_MS = 2000

function responsesToAnswers(responses: SurveyResponses): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  for (const [qId, r] of Object.entries(responses)) {
    if (!r) continue
    // Photo files are sent as separate multipart form fields — exclude from JSON answers
    if (r.type === "photo") continue
    if (r.type === "star" || r.type === "nps") out[qId] = r.value
    else if (r.type === "choice") out[qId] = r.value
    else if (r.type === "choices") out[qId] = r.value
    else if (r.type === "text") out[qId] = r.value
  }
  return out
}

function collectPhotoFiles(responses: SurveyResponses): Record<string, File> {
  const files: Record<string, File> = {}
  for (const [qId, r] of Object.entries(responses)) {
    if (r?.type === "photo" && r.value instanceof File) {
      files[qId] = r.value
    }
  }
  return files
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
    // Exclude photo responses — File objects cannot be serialized to JSON and
    // cannot be meaningfully restored from localStorage.
    const draftable: SurveyResponses = Object.fromEntries(
      Object.entries(responses).filter(([, v]) => v?.type !== "photo"),
    )
    localStorage.setItem(
      `${DRAFT_KEY_PREFIX}${sessionId}-${qrCodeId}`,
      JSON.stringify(draftable),
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

  // May differ from the URL param when the session was auto-created because
  // the user bypassed the QR redirect page.
  const [effectiveSessionId, setEffectiveSessionId] = useState(sessionId)

  const [survey, setSurvey] = useState<Survey | null>(null)
  const [responses, setResponses] = useState<SurveyResponses>({})
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState<string | null>(null)
  const [submitAttempted, setSubmitAttempted] = useState(false)
  const [backendMissingIds, setBackendMissingIds] = useState<string[]>([])

  const draftTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const responsesRef = useRef(responses)
  const submittedRef = useRef(false)
  responsesRef.current = responses

  useEffect(() => {
    if (!qrCodeId) {
      setError("Invalid session. Please scan the QR code again.")
      setLoading(false)
      return
    }

    let cancelled = false

    async function load() {
      try {
        let resolvedSessionId = sessionId

        // If there is no session in the URL (user bypassed QR redirect), auto-create
        // one via the redirect endpoint so the survey can still be loaded and submitted.
        if (!sessionId) {
          const redirectResult = await fetchSurveyRedirect(qrCodeId)
          if (!redirectResult.valid || !redirectResult.session_id) {
            if (!cancelled) setError("Survey not available. Please scan the QR code again.")
            return
          }
          resolvedSessionId = redirectResult.session_id
          if (!cancelled) {
            setEffectiveSessionId(resolvedSessionId)
            window.history.replaceState(
              {},
              "",
              `?session=${encodeURIComponent(resolvedSessionId)}&qr=${encodeURIComponent(qrCodeId)}`,
            )
          }
        }

        const data = await fetchSurveyForSession(resolvedSessionId, qrCodeId)
        if (cancelled) return

        setSurvey(surveyFromApi(data.schema as Record<string, unknown>))

        const draft = loadDraft(resolvedSessionId, qrCodeId)
        if (draft && Object.keys(draft).length > 0) {
          setResponses(draft)
        }
      } catch (err) {
        if (!cancelled) {
          setError(extractErrorMessage(err, "Failed to load survey"))
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
    saveDraft(effectiveSessionId, qrCodeId, responsesRef.current)
  }, [effectiveSessionId, qrCodeId])

  useEffect(() => {
    if (!effectiveSessionId || !qrCodeId || loading) return
    if (draftTimer.current) clearTimeout(draftTimer.current)
    draftTimer.current = setTimeout(persistDraft, DRAFT_DEBOUNCE_MS)
    return () => {
      if (draftTimer.current) clearTimeout(draftTimer.current)
    }
  }, [responses, effectiveSessionId, qrCodeId, loading, persistDraft])

  const handleResponseChange = useCallback((questionId: string, next: SurveyResponseValue) => {
    setResponses((prev) => ({ ...prev, [questionId]: next }))
    setSubmitError(null)
    setSubmitAttempted(false)
    setBackendMissingIds([])
  }, [])

  const handleSubmit = useCallback(async () => {
    if (!effectiveSessionId || !qrCodeId || submitting || !survey) return

    setSubmitAttempted(true)
    const missingIds = getUnansweredRequiredIds(survey, responsesRef.current)
    if (missingIds.length > 0) {
      setSubmitError("You still have questions to complete.")
      setBackendMissingIds([])
      return
    }

    setSubmitting(true)
    setSubmitError(null)
    setBackendMissingIds([])
    try {
      const answers = responsesToAnswers(responsesRef.current)
      const photoFiles = collectPhotoFiles(responsesRef.current)
      const result = await submitSurvey(effectiveSessionId, qrCodeId, answers, photoFiles)
      submittedRef.current = true
      clearDraft(effectiveSessionId, qrCodeId)
      window.location.href = result.redirect_url
    } catch (err) {
      if (err instanceof SurveySubmissionValidationError) {
        setSubmitError(err.message ?? "You still have questions to complete.")
        setBackendMissingIds(err.missingRequired)
      } else {
        setSubmitError(extractErrorMessage(err, "Failed to submit"))
        setBackendMissingIds([])
      }
      setSubmitAttempted(true)
    } finally {
      setSubmitting(false)
    }
  }, [effectiveSessionId, qrCodeId, submitting, survey])

  useEffect(() => {
    const saveAndAbandon = () => {
      saveDraft(effectiveSessionId, qrCodeId, responsesRef.current)
      if (!submittedRef.current && effectiveSessionId && qrCodeId) {
        const url = `${BACKEND_BASE}/api/v1/survey/abandon`
        const blob = new Blob(
          [JSON.stringify({ session_id: effectiveSessionId, qr_code_id: qrCodeId })],
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
  }, [effectiveSessionId, qrCodeId])

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
            unansweredRequiredIds={
              submitAttempted && submitError
                ? backendMissingIds.length > 0
                  ? backendMissingIds
                  : getUnansweredRequiredIds(survey, responses)
                : []
            }
          />

          {submitError && (
            <p className="mt-4 text-sm font-medium text-red-600">{submitError}</p>
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
          </div>
        </div>
      </div>
    </div>
  )
}
