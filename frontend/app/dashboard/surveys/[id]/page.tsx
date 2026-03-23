"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { useParams, useRouter } from "next/navigation"
import Link from "next/link"
import {
  ArrowLeft,
  Check,
  Loader2,
  Eye,
  EyeOff,
  AlertCircle,
  Save,
} from "lucide-react"
import { LoadingSpinner } from "@/components/ui/LoadingSpinner"
import { supabase } from "@/lib/supabase/client"
import {
  fetchQuestionTypesPublic,
  fetchSurveyLatest,
  saveSurveyVersion,
  SurveyStructureValidationError,
  extractErrorMessage,
  type QuestionTypeResponse,
  type SurveyListItem,
  type SurveyValidationErrorItem,
} from "@/lib/api/client"
import { defaultSurvey } from "@/lib/survey/defaultSurvey"
import { surveyFromApi, surveyToApi } from "@/lib/survey/richText"
import { deleteSurveyDraft, loadSurveyDraft, saveSurveyDraft } from "@/lib/survey/drafts"
import type { Question, Survey } from "@/lib/survey/types"
import { SurveyEditor, type EditorSelection } from "@/components/survey/SurveyEditor"
import { SettingsPanel } from "@/components/survey/SettingsPanel"
import { SurveyPreview } from "@/components/survey/SurveyPreview"
import { Toolbar } from "@/components/survey/Toolbar"
import { useConfirm } from "@/components/ui/ConfirmDialog"
import { useSettingsSchema } from "@/contexts/SettingsSchemaContext"

const AUTOSAVE_DELAY_MS = 2_000
const LEAVE_MESSAGE = "You have unsaved changes. Are you sure you want to leave?"

function serializeSurvey(value: Survey): string {
  return JSON.stringify(value)
}

export default function SurveyEditorPage() {
  const params = useParams()
  const router = useRouter()
  const surveyId = params.id as string

  const [schema, setSchema] = useState<Survey>(defaultSurvey)
  const [latestDbSchema, setLatestDbSchema] = useState<Survey>(defaultSurvey)
  const [dbVersion, setDbVersion] = useState(1)
  const [surveyMeta, setSurveyMeta] = useState<SurveyListItem | null>(null)

  const [selection, setSelection] = useState<EditorSelection>(null)
  const [showPreview, setShowPreview] = useState(false)

  const [isSaving, setIsSaving] = useState(false)
  const [lastSaved, setLastSaved] = useState<Date | null>(null)
  const [lastDraftSavedAt, setLastDraftSavedAt] = useState<Date | null>(null)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [validationErrors, setValidationErrors] = useState<SurveyValidationErrorItem[]>([])

  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [pendingDraft, setPendingDraft] = useState<Survey | null>(null)
  const [questionTypes, setQuestionTypes] = useState<QuestionTypeResponse[]>([])
  const [isMobileViewport, setIsMobileViewport] = useState(false)

  const autosaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const schemaRef = useRef(schema)
  const dbVersionRef = useRef(dbVersion)
  const isFirstLoad = useRef(true)
  schemaRef.current = schema
  dbVersionRef.current = dbVersion

  const { confirm, ConfirmDialogRender } = useConfirm()
  const { getDefaultsForType } = useSettingsSchema()

  const isDirty = useMemo(
    () => serializeSurvey(schema) !== serializeSurvey(latestDbSchema),
    [schema, latestDbSchema],
  )

  async function getToken(): Promise<string | null> {
    const {
      data: { session },
    } = await supabase.auth.getSession()
    return session?.access_token ?? null
  }

  useEffect(() => {
    fetchQuestionTypesPublic()
      .then(setQuestionTypes)
      .catch(() => setQuestionTypes([]))
  }, [])

  useEffect(() => {
    const mq = window.matchMedia("(max-width: 767px)")
    const apply = () => setIsMobileViewport(mq.matches)
    apply()
    mq.addEventListener("change", apply)
    return () => mq.removeEventListener("change", apply)
  }, [])

  useEffect(() => {
    async function load() {
      const token = await getToken()
      if (!token) {
        router.push("/login")
        return
      }
      try {
        const data = await fetchSurveyLatest(token, surveyId)
        const databaseSchema = surveyFromApi(data.survey_schema_json as Record<string, unknown>)
        setSchema(databaseSchema)
        setLatestDbSchema(databaseSchema)
        setDbVersion(data.latest_version)
        setSurveyMeta(data)
        setLastSaved(new Date(data.updated_at))

        const draft = loadSurveyDraft(surveyId)
        if (draft && draft.lastDatabaseVersion === data.latest_version) {
          setPendingDraft(draft.schema)
          setLastDraftSavedAt(new Date(draft.updatedAt))
        } else if (draft) {
          deleteSurveyDraft(surveyId)
          setLastDraftSavedAt(null)
        }
      } catch (err) {
        setLoadError(extractErrorMessage(err, "Failed to load survey"))
      } finally {
        setLoading(false)
        isFirstLoad.current = false
      }
    }
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [surveyId])

  const persistDraft = useCallback(() => {
    saveSurveyDraft(surveyId, {
      schema: schemaRef.current,
      lastDatabaseVersion: dbVersionRef.current,
      updatedAt: new Date().toISOString(),
    })
    setLastDraftSavedAt(new Date())
  }, [surveyId])

  useEffect(() => {
    if (isFirstLoad.current || loading) return
    const dirty = serializeSurvey(schema) !== serializeSurvey(latestDbSchema)
    if (!dirty) return
    setSaveError(null)
    if (autosaveTimer.current) clearTimeout(autosaveTimer.current)
    autosaveTimer.current = setTimeout(persistDraft, AUTOSAVE_DELAY_MS)
  }, [schema, latestDbSchema, loading, persistDraft])

  useEffect(
    () => () => {
      if (autosaveTimer.current) clearTimeout(autosaveTimer.current)
    },
    [],
  )

  useEffect(() => {
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      if (!isDirty) return
      saveSurveyDraft(surveyId, {
        schema: schemaRef.current,
        lastDatabaseVersion: dbVersionRef.current,
        updatedAt: new Date().toISOString(),
      })
      e.preventDefault()
      e.returnValue = LEAVE_MESSAGE
      return LEAVE_MESSAGE
    }
    window.addEventListener("beforeunload", onBeforeUnload)
    return () => window.removeEventListener("beforeunload", onBeforeUnload)
  }, [isDirty, surveyId])

  useEffect(() => {
    const onClick = async (event: MouseEvent) => {
      if (!isDirty) return
      if (event.defaultPrevented) return
      if (event.button !== 0) return
      if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return
      const target = event.target as Element | null
      const anchor = target?.closest("a[href]") as HTMLAnchorElement | null
      if (!anchor) return
      const href = anchor.getAttribute("href")
      if (!href || href.startsWith("#") || href.startsWith("mailto:")) return
      if (!href.startsWith("/")) return
      const next = new URL(href, window.location.origin)
      if (next.pathname === window.location.pathname && next.search === window.location.search) {
        return
      }
      event.preventDefault()
      event.stopPropagation()
      const ok = await confirm({ title: "Unsaved changes", message: LEAVE_MESSAGE })
      if (ok) router.push(href)
    }
    document.addEventListener("click", onClick, true)
    return () => document.removeEventListener("click", onClick, true)
  }, [isDirty, confirm, router])

  useEffect(() => {
    const onPopState = async () => {
      if (!isDirty) return
      window.history.go(1)
      const ok = await confirm({ title: "Unsaved changes", message: LEAVE_MESSAGE })
      if (ok) window.history.back()
    }
    window.addEventListener("popstate", onPopState)
    return () => window.removeEventListener("popstate", onPopState)
  }, [isDirty, confirm])

  const doSave = useCallback(async () => {
    if (!isDirty) {
      setSaveError(null)
      return
    }
    const token = await getToken()
    if (!token) return

    setIsSaving(true)
    setSaveError(null)
    setValidationErrors([])
    try {
      const result = await saveSurveyVersion(
        token,
        surveyId,
        surveyToApi(schemaRef.current) as Record<string, unknown>,
        dbVersionRef.current,
      )
      setDbVersion(result.latest_version)
      dbVersionRef.current = result.latest_version
      setSurveyMeta(result)
      setLatestDbSchema(schemaRef.current)
      setLastSaved(new Date())
      setLastDraftSavedAt(null)
      deleteSurveyDraft(surveyId)
    } catch (err) {
      if (err instanceof SurveyStructureValidationError) {
        setValidationErrors(err.schemaErrors)
        setSaveError(err.message)
      } else {
        const msg = extractErrorMessage(err, "Save failed")
        setValidationErrors([])
        if (msg.toLowerCase().includes("conflict") || msg.includes("409")) {
          setSaveError(
            "Save conflict: this survey was updated elsewhere. Reload and merge your changes before saving again.",
          )
        } else {
          setSaveError(msg)
        }
      }
    } finally {
      setIsSaving(false)
    }
  }, [isDirty, surveyId])

  function addQuestion(type: string) {
    const id = crypto.randomUUID()
    const q: Question = {
      id,
      version: 1,
      type: type as Question["type"],
      title: { text: "Untitled question", style: { size: "h2" } },
      description: { text: "", style: { size: "body" } },
      optional: false,
      settings: getDefaultsForType(type) as Question["settings"],
    }
    setSchema((prev) => ({
      ...prev,
      version: prev.version + 1,
      questions: [...prev.questions, q],
    }))
    setSelection({ type: "question", questionId: id })
  }

  async function deleteQuestion(questionId: string) {
    const ok = await confirm({
      title: "Delete question",
      message: "Delete this question? This can't be undone.",
      confirmLabel: "Delete",
      cancelLabel: "Cancel",
      variant: "danger",
    })
    if (!ok) return
    setSchema((prev) => ({
      ...prev,
      version: prev.version + 1,
      questions: prev.questions.filter((q) => q.id !== questionId),
    }))
    setSelection((prev) =>
      prev?.type === "question" && prev.questionId === questionId ? null : prev,
    )
  }

  function reorderQuestions(nextIds: string[]) {
    const byId = new Map(schema.questions.map((q) => [q.id, q]))
    setSchema((prev) => ({
      ...prev,
      version: prev.version + 1,
      questions: nextIds.map((id) => byId.get(id)!).filter(Boolean),
    }))
  }

  function StatusBadge() {
    if (!surveyMeta) return null
    const map: Record<string, string> = {
      draft: "bg-zinc-100 text-zinc-600",
      active: "bg-emerald-50 text-emerald-700",
      archived: "bg-red-50 text-red-600",
    }
    return (
      <span
        className={`rounded-full px-2.5 py-0.5 text-xs font-semibold capitalize ${
          map[surveyMeta.status] ?? map.draft
        }`}
      >
        {surveyMeta.status}
      </span>
    )
  }

  function SaveStatus() {
    if (isSaving)
      return (
        <span className="flex items-center gap-1.5 text-xs text-zinc-500">
          <Loader2 className="h-3 w-3 animate-spin" />
          Saving...
        </span>
      )
    if (saveError)
      return (
        <span className="flex items-center gap-1.5 text-xs text-red-600">
          <AlertCircle className="h-3 w-3" />
          {saveError}
        </span>
      )
    if (isDirty && lastDraftSavedAt)
      return (
        <span className="flex items-center gap-1.5 text-xs text-amber-600">
          <Save className="h-3 w-3" />
          Draft saved locally
        </span>
      )
    if (isDirty) return <span className="text-xs text-amber-600">Unsaved changes</span>
    if (lastSaved)
      return (
        <span className="flex items-center gap-1.5 text-xs text-emerald-600">
          <Check className="h-3 w-3" />
          Saved
        </span>
      )
    return null
  }

  if (loading) {
    return (
      <div className="flex min-h-[300px] items-center justify-center">
        <LoadingSpinner size="lg" />
      </div>
    )
  }

  if (loadError) {
    return (
      <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
        {loadError}
      </div>
    )
  }

  if (isMobileViewport) {
    return (
      <div className="flex min-h-[60vh] flex-col items-center justify-center gap-4 bg-zinc-50 p-6">
        <div className="max-w-md rounded-2xl border border-zinc-200 bg-white p-6 text-center shadow-sm">
          <p className="text-sm leading-relaxed text-zinc-700">
            The survey editor is not available on small screens. Use a larger display to edit surveys.
          </p>
          <button
            type="button"
            className="mt-5 w-full rounded-xl bg-violet-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-violet-700"
            onClick={() => router.push("/dashboard/surveys")}
          >
            Go to survey overview
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-zinc-200 bg-white px-4 py-3">
        <div className="flex min-w-0 items-center gap-3">
          <Link
            href="/dashboard/surveys"
            className="flex-shrink-0 rounded-lg p-1.5 text-zinc-500 hover:bg-zinc-100 hover:text-zinc-700"
            aria-label="Back to surveys"
          >
            <ArrowLeft className="h-4 w-4" />
          </Link>
          <div className="min-w-0">
            <p className="text-[11px] uppercase tracking-wide text-zinc-400">Survey Editor</p>
            <h1 className="truncate text-sm font-semibold text-zinc-900">
              {surveyMeta?.title ?? "Loading..."}
            </h1>
          </div>
          <StatusBadge />
          {surveyMeta?.status === "active" && (
            <span className="rounded-full bg-amber-100 px-2.5 py-0.5 text-xs font-semibold text-amber-800">
              Editing Draft of Active Survey
            </span>
          )}
        </div>

        <div className="flex flex-shrink-0 items-center gap-3">
          <SaveStatus />


          <button
            onClick={() => setShowPreview((v) => !v)}
            className="inline-flex items-center gap-1.5 rounded-xl border border-zinc-200 bg-white px-3 py-1.5 text-xs font-semibold text-zinc-700 hover:bg-zinc-50"
          >
            {showPreview ? (
              <>
                <EyeOff className="h-3 w-3" /> Editor
              </>
            ) : (
              <>
                <Eye className="h-3 w-3" /> Preview
              </>
            )}
          </button>

          <button
            onClick={doSave}
            disabled={isSaving}
            className="rounded-xl bg-violet-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-violet-700 disabled:opacity-40"
          >
            Save now
          </button>
        </div>
      </div>

      {validationErrors.length > 0 && (
        <div className="border-b border-red-200 bg-red-50 px-4 py-3">
          <p className="mb-2 text-sm font-semibold text-red-800">Validation errors – fix these before saving:</p>
          <ul className="list-inside list-disc space-y-1 text-xs text-red-700">
            {validationErrors.map((e, i) => {
              const qId = e.question_id
              const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(qId ?? "")
              const questionMatch = qId?.match(/^Question (\d+)$/i)
              const targetId = isUuid
                ? qId
                : questionMatch
                  ? schema.questions[parseInt(questionMatch[1], 10) - 1]?.id
                  : null
              return (
                <li key={i}>
                  {qId && targetId ? (
                    <>
                      <button
                        type="button"
                        onClick={() => setSelection({ type: "question", questionId: targetId })}
                        className="font-medium underline hover:text-red-900"
                      >
                        {qId}
                      </button>
                      {e.setting ? ` (${e.setting}): ` : ": "}
                    </>
                  ) : qId ? (
                    <span className="font-medium">{qId}: </span>
                  ) : null}
                  {e.message}
                </li>
              )
            })}
          </ul>
        </div>
      )}

      {isDirty && !isSaving && (
        <div className="flex items-center justify-between border-b border-amber-200 bg-amber-50 px-4 py-2 text-xs">
          <span className="text-amber-700">You have unsaved changes</span>
          <button onClick={doSave} className="font-semibold text-amber-800 underline">
            Save now
          </button>
        </div>
      )}

      {showPreview ? (
        <div className="flex-1 overflow-y-auto bg-zinc-100 p-4 md:p-6">
          <div className="mx-auto w-full max-w-2xl rounded-2xl bg-white p-6 shadow-md">
            <SurveyPreview survey={schema} />
          </div>
        </div>
      ) : (
        <div className="flex min-h-0 flex-1 flex-col overflow-hidden xl:flex-row">
          <div className="flex min-h-0 flex-1 flex-col overflow-hidden md:flex-row">
            <div className="w-full shrink-0 overflow-y-auto border-b border-zinc-200 bg-white md:w-56 md:border-b-0 md:border-r">
              <Toolbar onAdd={addQuestion} questionTypes={questionTypes} />
              <div className="border-t border-zinc-100 px-3 py-3">
                <p className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-zinc-400">
                  Questions ({schema.questions.length})
                </p>
                {schema.questions.length === 0 && (
                  <p className="text-xs text-zinc-400">No questions yet. Add one above.</p>
                )}
                {schema.questions.map((q, i) => (
                  <button
                    key={q.id}
                    onClick={() => setSelection({ type: "question", questionId: q.id })}
                    className={[
                      "mb-1 w-full truncate rounded-lg px-2 py-1.5 text-left text-xs",
                      selection?.type === "question" && selection.questionId === q.id
                        ? "bg-violet-50 font-semibold text-violet-700"
                        : "text-zinc-700 hover:bg-zinc-50",
                    ].join(" ")}
                  >
                    <span className="mr-1 text-zinc-400">{i + 1}.</span>
                    {q.title?.text || "Untitled"}
                  </button>
                ))}
              </div>
            </div>

            <div className="min-w-0 flex-1 overflow-y-auto bg-zinc-50 p-4 md:p-6">
              <div className="mx-auto w-full max-w-3xl">
                <SurveyEditor
                  survey={schema}
                  selection={selection}
                  onSelect={setSelection}
                  onDeleteQuestion={deleteQuestion}
                  onReorderQuestions={reorderQuestions}
                  questionTypeLabels={Object.fromEntries(questionTypes.map((qt) => [qt.type, qt.label]))}
                />
              </div>
            </div>
          </div>

          <div className="w-full shrink-0 overflow-y-auto border-t border-zinc-200 bg-white p-4 xl:w-80 xl:border-l xl:border-t-0">
            <SettingsPanel
              survey={schema}
              selection={selection}
              onSurveyChange={(next) => setSchema(next)}
            />
          </div>
        </div>
      )}

      {ConfirmDialogRender}

      {pendingDraft && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl">
            <h2 className="mb-2 text-lg font-semibold text-zinc-900">Draft Available</h2>
            <p className="mb-4 text-sm text-zinc-600">
              A draft version of this survey exists.
            </p>
            <div className="flex justify-end gap-2">
              <button
                onClick={() => {
                  deleteSurveyDraft(surveyId)
                  setPendingDraft(null)
                  setLastDraftSavedAt(null)
                }}
                className="rounded-xl px-4 py-2 text-sm text-zinc-600 hover:bg-zinc-100"
              >
                Discard Draft
              </button>
              <button
                onClick={() => {
                  setSchema(pendingDraft)
                  setPendingDraft(null)
                }}
                className="rounded-xl bg-violet-600 px-4 py-2 text-sm font-semibold text-white hover:bg-violet-700"
              >
                Restore Draft
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
