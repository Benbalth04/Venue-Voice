"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import {
  Camera,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Clock,
  ExternalLink,
  Filter,
  Loader2,
  MapPin,
  QrCode,
  Trash2,
  X,
  XCircle,
} from "lucide-react"
import { supabase } from "@/lib/supabase/client"
import {
  fetchAnalyticsFilters,
  fetchAnalyticsResponseDetail,
  fetchAnalyticsResponses,
  fetchFlow,
  fetchNotificationGroups,
  fetchPhotoSignedUrl,
  fetchRuleBundleDirect,
  extractErrorMessage,
  type AnalyticsAnswerDetail,
  type AnalyticsFilterOption,
  type AnalyticsFilters,
  type AnalyticsResponseRow,
  type FlowResponse,
  type FlowRunResponse,
  type NotificationGroupResponse,
} from "@/lib/api/client"
import {
  AdvancedFiltersPanel,
  advancedFilterToApiPayload,
  hasActiveAdvancedFilter,
  DEFAULT_ADV_FILTER,
  type AdvancedFilterState,
} from "@/components/analytics/AdvancedFiltersPanel"
import type { RuleInfo } from "@/components/flow-editor/buildReadOnlyCanvas"
import { FlowExecutionPreview } from "@/components/flow-editor/FlowExecutionPreview"
import { FlowRunActionPill } from "@/components/flows/FlowRunActionPill"
import { AiAnalysisInfoTooltip } from "@/components/analytics/AiAnalysisInfoTooltip"
import { DataTable } from "@/components/ui/DataTable"
import { DeleteResponseDialog } from "@/components/ui/DeleteResponseDialog"
import { DatePicker } from "@/components/ui/DatePicker"
import { SingleSelectDropdown } from "@/components/ui/DropdownSelect"
import { useUnreadResponses } from "@/components/layout/UnreadResponsesContext"
import { useAuth } from "@/contexts/AuthContext"
import { formatIsoInUserTimeZone } from "@/lib/datetime/formatInUserTz"
import { DEFAULT_USER_TIMEZONE } from "@/lib/timezone/australia"

// ─── Helpers ─────────────────────────────────────────────────────────────────

function formatSeconds(s: number | null | undefined): string {
  if (s == null) return "—"
  const m = Math.floor(s / 60)
  const sec = s % 60
  return `${m}:${String(sec).padStart(2, "0")}`
}

async function getToken(): Promise<string | null> {
  const { data } = await supabase.auth.getSession()
  return data.session?.access_token ?? null
}

function sentimentPillClass(sentiment: string): string {
  const s = sentiment.toLowerCase()
  if (s === "positive") return "bg-emerald-50 text-emerald-700"
  if (s === "negative") return "bg-red-50 text-red-700"
  return "bg-zinc-100 text-zinc-600"
}

function formatSentimentLabel(sentiment: string): string {
  const s = sentiment.toLowerCase()
  if (s === "positive" || s === "negative" || s === "neutral") {
    return s.charAt(0).toUpperCase() + s.slice(1)
  }
  return sentiment
}

function showSentimentPill(a: AnalyticsAnswerDetail): boolean {
  const t = a.question_type
  if (t !== "text" && t !== "long_text") return false
  return Boolean(a.sentiment && String(a.sentiment).trim())
}

function formatFlowRunDateTime(iso: string) {
  const d = new Date(iso)
  return d.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  })
}

// ─── Types ────────────────────────────────────────────────────────────────────

interface FiltersState {
  survey_id: string
  qr_code_id: string
  location_id: string   // UUID, "__none__", or ""
  completed: string     // "true" | "false" | ""
  date_start: string
  date_end: string
  sort_column: string
  sort_direction: "asc" | "desc"
}

const DEFAULT_FILTERS: FiltersState = {
  survey_id: "",
  qr_code_id: "",
  location_id: "",
  completed: "",
  date_start: "",
  date_end: "",
  sort_column: "scan_time",
  sort_direction: "desc",
}

// ─── Review Modal ─────────────────────────────────────────────────────────────

function ReviewModal({
  responseId,
  onClose,
  onMarkRead,
  onRequestDelete,
}: {
  responseId: string
  onClose: () => void
  onMarkRead?: (id: string) => void
  onRequestDelete?: () => void
}) {
  const { activeMembership } = useAuth()
  const isViewer = activeMembership?.role === "viewer"

  const [answers, setAnswers] = useState<AnalyticsAnswerDetail[]>([])
  const [flowRuns, setFlowRuns] = useState<FlowRunResponse[]>([])
  const [notificationGroups, setNotificationGroups] = useState<NotificationGroupResponse[]>([])
  const [surveyName, setSurveyName] = useState("")
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [sortKey, setSortKey] = useState<string>("question")
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc")
  const [lightboxUrl, setLightboxUrl] = useState<string | null>(null)
  const [lightboxLoading, setLightboxLoading] = useState(false)
  const [previewState, setPreviewState] = useState<{
    run: FlowRunResponse
    flow: FlowResponse
  } | null>(null)
  const [previewRulesById, setPreviewRulesById] = useState<Map<string, RuleInfo>>(new Map())
  const [previewLoading, setPreviewLoading] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    async function load() {
      const token = await getToken()
      if (!token) { setError("Not authenticated"); setLoading(false); return }
      try {
        if (isViewer) {
          const detail = await fetchAnalyticsResponseDetail(token, responseId)
          if (cancelled) return
          setSurveyName(detail.survey_name)
          setAnswers(detail.answers)
          setFlowRuns([])
          setNotificationGroups([])
        } else {
          const [detail, groups] = await Promise.all([
            fetchAnalyticsResponseDetail(token, responseId),
            fetchNotificationGroups(token),
          ])
          if (cancelled) return
          setSurveyName(detail.survey_name)
          setAnswers(detail.answers)
          setFlowRuns(detail.flow_runs ?? [])
          setNotificationGroups(groups)
        }
        onMarkRead?.(responseId)
      } catch (e) {
        if (!cancelled) setError(extractErrorMessage(e, "Failed to load response"))
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    load()
    return () => { cancelled = true }
  }, [isViewer, onMarkRead, responseId])

  async function openExecutionPreview(run: FlowRunResponse) {
    const token = await getToken()
    if (!token) return
    setPreviewLoading(run.id)
    try {
      const [flow, bundle] = await Promise.all([
        fetchFlow(token, run.flow_id),
        fetchRuleBundleDirect(token, run.survey_id),
      ])
      const ruleMap = new Map<string, RuleInfo>()
      for (const rule of bundle.rules) {
        ruleMap.set(rule.id, { name: rule.name, description: rule.description ?? null })
      }
      setPreviewRulesById(ruleMap)
      setPreviewState({ run, flow })
    } catch {
      // flow deleted or rules unavailable
    } finally {
      setPreviewLoading(null)
    }
  }

  return (
    <>
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-4"
      onClick={(e) => { if (e.target === e.currentTarget) onClose() }}
    >
      <div className="relative w-full max-w-5xl rounded-2xl bg-white shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-zinc-200 px-6 py-4 sm:px-8">
          <div>
            <p className="text-xs text-zinc-500 uppercase tracking-wide">Response Review</p>
            <h2 className="text-base font-semibold text-zinc-900">
              {surveyName || "Survey Response"}
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1.5 text-zinc-400 hover:bg-zinc-100 hover:text-zinc-700"
            aria-label="Close"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Body */}
        <div className="max-h-[72vh] overflow-y-auto px-6 py-4 sm:px-8">
          {loading && (
            <div className="flex items-center justify-center py-10">
              <Loader2 className="h-5 w-5 animate-spin text-violet-500" />
              <span className="ml-2 text-sm text-zinc-500">Loading answers…</span>
            </div>
          )}
          {error && (
            <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
              {error}
            </div>
          )}
          {!loading && !error && (
            <>
              {answers.length > 0 ? (
                (() => {
                  const sorted = [...answers].sort((a, b) => {
                    if (sortKey === "question") {
                      const cmp = a.position - b.position
                      return sortDir === "asc" ? cmp : -cmp
                    }
                    const cmp = (a.answer_value ?? "").localeCompare(b.answer_value ?? "")
                    return sortDir === "asc" ? cmp : -cmp
                  })
                  return (
                    <DataTable<AnalyticsAnswerDetail>
                      data={sorted}
                      columns={[
                        {
                          key: "question",
                          label: "Question",
                          sortable: true,
                          align: "left",
                          render: (a) => {
                            const isText =
                              a.question_type === "text" || a.question_type === "long_text"
                            return (
                              <span className="flex flex-wrap items-center gap-2 text-zinc-700">
                                <span>{a.question_text}</span>
                                {showSentimentPill(a) && a.sentiment ? (
                                  <span
                                    className={[
                                      "inline-flex shrink-0 rounded-full px-2.5 py-0.5 text-xs font-semibold",
                                      sentimentPillClass(a.sentiment),
                                    ].join(" ")}
                                  >
                                    {formatSentimentLabel(a.sentiment)}
                                  </span>
                                ) : null}
                                {isText ? (
                                  <AiAnalysisInfoTooltip variant="past" />
                                ) : null}
                              </span>
                            )
                          },
                        },
                        {
                          key: "answer",
                          label: "Answer",
                          sortable: true,
                          align: "left",
                          render: (a) => {
                            if (a.has_photo && a.question_id) {
                              return (
                                <button
                                  type="button"
                                  disabled={lightboxLoading}
                                  className="inline-flex items-center gap-1.5 rounded-lg border border-zinc-200 px-2.5 py-1 text-xs font-medium text-violet-700 hover:border-violet-300 hover:bg-violet-50 disabled:opacity-60"
                                  onClick={async () => {
                                    if (lightboxLoading) return
                                    setLightboxLoading(true)
                                    try {
                                      const token = await getToken()
                                      if (!token) return
                                      const { signed_url } = await fetchPhotoSignedUrl(
                                        token,
                                        responseId,
                                        a.question_id!,
                                      )
                                      setLightboxUrl(signed_url)
                                    } catch {
                                      // silently ignore — the icon will re-enable
                                    } finally {
                                      setLightboxLoading(false)
                                    }
                                  }}
                                >
                                  {lightboxLoading ? (
                                    <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
                                  ) : (
                                    <Camera className="h-3.5 w-3.5" aria-hidden />
                                  )}
                                  View photo
                                </button>
                              )
                            }
                            const text = a.answer_value ?? ""
                            return (
                              <span className="font-medium text-zinc-900">
                                {text === "" ? "—" : text}
                              </span>
                            )
                          },
                        },
                      ]}
                      getRowKey={(a) => a.question_id ?? `p-${a.position}-${a.question_text}`}
                      sortKey={sortKey}
                      sortDir={sortDir}
                      onSort={(key) => {
                        setSortKey(key)
                        setSortDir((d) => (sortKey === key && d === "asc" ? "desc" : "asc"))
                      }}
                    />
                  )
                })()
              ) : (
                <p className="py-6 text-center text-sm text-zinc-400">No answers recorded.</p>
              )}

              {!isViewer && <div className="mt-6 border-t border-zinc-200 pt-4">
                <h3 className="text-xs font-semibold uppercase tracking-wide text-zinc-500">
                  Automation runs
                </h3>
                {flowRuns.length === 0 ? (
                  <p className="mt-2 text-sm text-zinc-400">No flows ran for this submission.</p>
                ) : (
                  <div className="mt-3 space-y-2">
                    {flowRuns.map((run) => (
                      <div
                        key={run.id}
                        className="rounded-xl border border-zinc-200 bg-zinc-50/80 px-3 py-2.5"
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div className="flex min-w-0 items-center gap-1.5">
                            {run.success ? (
                              <CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-emerald-500" />
                            ) : (
                              <XCircle className="h-3.5 w-3.5 shrink-0 text-red-500" />
                            )}
                            <p className="truncate text-sm font-semibold text-zinc-900">
                              {run.flow_name}
                            </p>
                          </div>
                          {run.runtime_ms != null ? (
                            <span className="shrink-0 rounded-full bg-zinc-200/80 px-2 py-0.5 text-[10px] font-medium text-zinc-600">
                              {run.runtime_ms} ms
                            </span>
                          ) : null}
                        </div>
                        <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[11px] text-zinc-500">
                          <span className="inline-flex items-center gap-0.5">
                            <Clock className="h-3 w-3 shrink-0" />
                            {formatFlowRunDateTime(run.created_at)}
                          </span>
                          <span className="inline-flex items-center gap-0.5">
                            <MapPin className="h-3 w-3 shrink-0" />
                            {run.survey_name}
                            {run.location_name ? ` · ${run.location_name}` : ""}
                          </span>
                          {run.qr_code_title ? (
                            <span className="inline-flex items-center gap-0.5">
                              <QrCode className="h-3 w-3 shrink-0" />
                              {run.qr_code_title}
                            </span>
                          ) : null}
                        </div>
                        <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
                          <div className="flex flex-wrap items-center gap-1.5">
                            {run.actions.length > 0 ? (
                              run.actions.map((action) => (
                                <FlowRunActionPill
                                  key={action.id}
                                  action={action}
                                  locationId={run.location_id}
                                  notificationGroups={notificationGroups}
                                  compact
                                />
                              ))
                            ) : (
                              <span className="text-[11px] text-zinc-400">No actions taken</span>
                            )}
                          </div>
                          <button
                            type="button"
                            disabled={previewLoading === run.id}
                            onClick={() => void openExecutionPreview(run)}
                            className="inline-flex items-center gap-1 rounded-lg border border-zinc-200 bg-white px-2 py-1 text-[11px] font-medium text-zinc-700 transition hover:border-zinc-300 hover:bg-zinc-50 disabled:cursor-not-allowed disabled:opacity-50"
                          >
                            {previewLoading === run.id ? (
                              <Loader2 className="h-3 w-3 animate-spin" />
                            ) : (
                              <ExternalLink className="h-3 w-3" />
                            )}
                            View execution
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>}
            </>
          )}
        </div>

        <div className="flex items-center justify-end border-t border-zinc-100 px-6 py-3 sm:px-8">
          {!isViewer && (
            <button
              type="button"
              onClick={onRequestDelete}
              className="mr-auto flex items-center gap-1.5 rounded-xl px-3 py-2 text-sm font-semibold text-red-600 hover:bg-red-50"
            >
              <Trash2 className="h-3.5 w-3.5" />
              Delete response
            </button>
          )}
          <button
            onClick={onClose}
            className="rounded-xl bg-zinc-100 px-4 py-2 text-sm font-semibold text-zinc-700 hover:bg-zinc-200"
          >
            Close
          </button>
        </div>
      </div>

      {/* Photo lightbox — rendered above the modal (z-[60]) */}
      {lightboxUrl && (
        <div
          className="fixed inset-0 z-[60] flex items-center justify-center bg-black/80"
          onClick={() => setLightboxUrl(null)}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={lightboxUrl}
            alt="Survey response photo"
            className="max-h-[90vh] max-w-[90vw] rounded-xl object-contain shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          />
          <button
            type="button"
            aria-label="Close photo"
            className="absolute right-4 top-4 rounded-full bg-white/20 p-2 text-white hover:bg-white/40"
            onClick={() => setLightboxUrl(null)}
          >
            <X className="h-5 w-5" />
          </button>
        </div>
      )}
    </div>

    {previewState ? (
      <FlowExecutionPreview
        run={previewState.run}
        flow={previewState.flow}
        rulesById={previewRulesById}
        onClose={() => setPreviewState(null)}
      />
    ) : null}
    </>
  )
}

// ─── Filters Panel ────────────────────────────────────────────────────────────

function FiltersPanel({
  filters,
  surveys,
  qrCodes,
  locations,
  onChange,
  onReset,
}: {
  filters: FiltersState
  surveys: AnalyticsFilterOption[]
  qrCodes: AnalyticsFilterOption[]
  locations: AnalyticsFilterOption[]
  onChange: (key: keyof FiltersState, value: string) => void
  onReset: () => void
}) {
  const hasActive =
    filters.survey_id ||
    filters.qr_code_id ||
    filters.location_id ||
    filters.completed ||
    filters.date_start ||
    filters.date_end

  return (
    <div className="rounded-xl border border-zinc-200 bg-white p-5 shadow-sm sm:p-6">
      <div className="mb-4 flex items-center justify-between">
        <div className="flex items-center gap-2 text-sm font-semibold text-zinc-700">
          <Filter className="h-4 w-4" />
          Filters
          {hasActive && (
            <span className="ml-1 rounded-full bg-violet-100 px-2 py-0.5 text-xs font-semibold text-violet-700">
              Active
            </span>
          )}
        </div>
        {hasActive && (
          <button
            type="button"
            onClick={onReset}
            className="text-xs text-zinc-500 hover:text-zinc-700 underline"
          >
            Reset all
          </button>
        )}
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-6">
        {/* Survey */}
        <div>
          <label className="mb-1 block text-xs font-medium text-zinc-600">Survey</label>
          <SingleSelectDropdown
            value={filters.survey_id}
            onChange={(v) => onChange("survey_id", v === "__all__" ? "" : v)}
            options={[
              { value: "__all__", label: "All surveys" },
              ...surveys.map((s) => ({ value: s.id, label: s.name })),
            ]}
            placeholder="All surveys"
          />
        </div>

        {/* QR Code */}
        <div>
          <label className="mb-1 block text-xs font-medium text-zinc-600">QR Code</label>
          <SingleSelectDropdown
            value={filters.qr_code_id}
            onChange={(v) => onChange("qr_code_id", v === "__all__" ? "" : v)}
            options={[
              { value: "__all__", label: "All QR codes" },
              ...qrCodes.map((q) => ({ value: q.id, label: q.name })),
            ]}
            placeholder="All QR codes"
          />
        </div>

        {/* Location */}
        <div>
          <label className="mb-1 block text-xs font-medium text-zinc-600">Location</label>
          <SingleSelectDropdown
            value={filters.location_id}
            onChange={(v) => onChange("location_id", v === "__all__" ? "" : v)}
            options={[
              { value: "__all__", label: "All locations" },
              { value: "__none__", label: "No Location" },
              ...locations.map((l) => ({ value: l.id, label: l.name })),
            ]}
            placeholder="All locations"
          />
        </div>

        {/* Completed */}
        <div>
          <label className="mb-1 block text-xs font-medium text-zinc-600">Completed</label>
          <SingleSelectDropdown
            value={filters.completed}
            onChange={(v) => onChange("completed", v === "__all__" ? "" : v)}
            options={[
              { value: "__all__", label: "All" },
              { value: "true", label: "Yes" },
              { value: "false", label: "No" },
            ]}
            placeholder="All"
          />
        </div>

        {/* Date start */}
        <div>
          <label className="mb-1 block text-xs font-medium text-zinc-600">From date</label>
          <DatePicker
            className="w-full"
            value={filters.date_start}
            onChange={(next) => onChange("date_start", next)}
            placeholder="Any"
          />
        </div>

        {/* Date end */}
        <div>
          <label className="mb-1 block text-xs font-medium text-zinc-600">To date</label>
          <DatePicker
            className="w-full"
            value={filters.date_end}
            onChange={(next) => onChange("date_end", next)}
            placeholder="Any"
          />
        </div>
      </div>
    </div>
  )
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function AnalyticsPage() {
  const { user } = useAuth()
  const userTimeZone = user?.timezone ?? DEFAULT_USER_TIMEZONE
  const { markResponseRead } = useUnreadResponses()
  const [rows, setRows] = useState<AnalyticsResponseRow[]>([])
  const [totalCount, setTotalCount] = useState(0)
  const [page, setPage] = useState(1)
  const PAGE_SIZE = 100

  const [filters, setFilters] = useState<FiltersState>(DEFAULT_FILTERS)
  const [advFilter, setAdvFilter] = useState<AdvancedFilterState>(DEFAULT_ADV_FILTER)
  const [surveys, setSurveys] = useState<AnalyticsFilterOption[]>([])
  const [qrCodes, setQrCodes] = useState<AnalyticsFilterOption[]>([])
  const [locations, setLocations] = useState<AnalyticsFilterOption[]>([])

  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [filtersError, setFiltersError] = useState<string | null>(null)

  const [reviewId, setReviewId] = useState<string | null>(null)
  const [deleteId, setDeleteId] = useState<string | null>(null)

  const abortRef = useRef<AbortController | null>(null)

  // Refs so the stable loadData callback always reads fresh filter/page values
  const filtersRef = useRef(filters)
  const advFilterRef = useRef(advFilter)
  const pageRef = useRef(page)
  filtersRef.current = filters
  advFilterRef.current = advFilter
  pageRef.current = page

  // Load filter options once
  useEffect(() => {
    let cancelled = false
    async function loadFilters() {
      const token = await getToken()
      if (!token) return
      try {
        const data = await fetchAnalyticsFilters(token)
        if (cancelled) return
        setSurveys(data.surveys)
        setQrCodes(data.qr_codes)
        setLocations(data.locations)
      } catch {
        if (!cancelled) setFiltersError("Failed to load filter options")
      }
    }
    loadFilters()
    return () => { cancelled = true }
  }, [])

  // Stable — reads current values from refs; pageOverride used when page state hasn't settled yet
  const loadData = useCallback(async (pageOverride?: number) => {
    abortRef.current?.abort()
    abortRef.current = new AbortController()
    setLoading(true)
    setError(null)
    const token = await getToken()
    if (!token) { setError("Not authenticated"); setLoading(false); return }
    const f = filtersRef.current
    const af = advFilterRef.current
    const p = pageOverride ?? pageRef.current
    const apiFilters: AnalyticsFilters = {
      page: p,
      page_size: PAGE_SIZE,
      sort_column: f.sort_column,
      sort_direction: f.sort_direction,
    }
    if (f.survey_id) apiFilters.survey_id = f.survey_id
    if (f.qr_code_id) apiFilters.qr_code_id = f.qr_code_id
    if (f.location_id) apiFilters.location_id = f.location_id
    if (f.completed !== "") apiFilters.completed = f.completed === "true"
    if (f.date_start) apiFilters.date_start = f.date_start
    if (f.date_end) apiFilters.date_end = f.date_end
    try {
      const data = await fetchAnalyticsResponses(
        token,
        apiFilters,
        hasActiveAdvancedFilter(af) ? advancedFilterToApiPayload(af) : null,
      )
      setRows(data.rows)
      setTotalCount(data.total_count)
    } catch (e) {
      if ((e as Error).name === "AbortError") return
      setError(extractErrorMessage(e, "Something went wrong while loading analytics."))
    } finally {
      setLoading(false)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Initial load only — loadData is stable so this fires exactly once
  useEffect(() => { loadData() }, [loadData])

  function handleFilterChange(key: keyof FiltersState, value: string) {
    setPage(1)
    setFilters((prev) => ({ ...prev, [key]: value }))
  }

  function handleResetFilters() {
    setPage(1)
    setFilters(DEFAULT_FILTERS)
    filtersRef.current = DEFAULT_FILTERS
    loadData(1)
  }

  function handleSort(col: string) {
    setPage(1)
    setFilters((prev) => ({
      ...prev,
      sort_column: col,
      sort_direction: prev.sort_column === col && prev.sort_direction === "desc" ? "asc" : "desc",
    }))
  }

  function handleGetResults() {
    setPage(1)
    loadData(1)
  }

  const totalPages = Math.max(1, Math.ceil(totalCount / PAGE_SIZE))

  const handleMarkResponseRead = useCallback(
    (id: string) => {
      markResponseRead(id)
      setRows((prev) =>
        prev.map((r) => (r.response_id === id ? { ...r, unread: false } : r)),
      )
    },
    [markResponseRead],
  )

  return (
    <div className="flex w-full max-w-full flex-col gap-5 px-4 py-6 sm:px-6 lg:px-8">
      {/* Page header */}
      <div>
        <h1 className="text-xl font-semibold text-zinc-900">Analytics</h1>
        <p className="text-sm text-zinc-500">Survey response data across your company.</p>
      </div>

      {/* Filters */}
      {filtersError && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-2 text-sm text-amber-700">
          {filtersError}
        </div>
      )}
      <FiltersPanel
        filters={filters}
        surveys={surveys}
        qrCodes={qrCodes}
        locations={locations}
        onChange={handleFilterChange}
        onReset={handleResetFilters}
      />
      <AdvancedFiltersPanel
        state={advFilter}
        onChange={(next) => { setPage(1); setAdvFilter(next) }}
        onReset={() => { setPage(1); setAdvFilter(DEFAULT_ADV_FILTER); advFilterRef.current = DEFAULT_ADV_FILTER; loadData(1) }}
        surveys={surveys}
        mainSurveyId={filters.survey_id}
      />

      {/* Get Results */}
      <div className="flex justify-center">
        <button
          type="button"
          onClick={handleGetResults}
          disabled={loading}
          className="rounded-xl bg-violet-600 px-6 py-2.5 text-sm font-semibold text-white hover:bg-violet-700 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : "Get Results"}
        </button>
      </div>

      {/* Summary bar */}
      <div className="flex items-center justify-between text-sm text-zinc-500">
        <span>
          {loading
            ? "Loading responses…"
            : `${totalCount.toLocaleString()} result${totalCount !== 1 ? "s" : ""}`}
        </span>
        {totalPages > 1 && (
          <span>Page {page} of {totalPages}</span>
        )}
      </div>

      {/* Error */}
      {error && !loading && (
        <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          {error}
        </div>
      )}

      {/* Table */}
      <DataTable<AnalyticsResponseRow>
        data={rows}
        columns={[
          {
            key: "unread",
            label: "",
            sortable: false,
            align: "center",
            headerClassName: "w-3",
            cellClassName: "w-3 px-2",
            render: (row) =>
              row.completed && row.unread ? (
                <span
                  className="inline-block h-2.5 w-2.5 rounded-full bg-violet-500"
                  title="Unread"
                  aria-hidden
                />
              ) : null,
          },
          {
            key: "survey_name",
            label: "Survey",
            sortable: true,
            align: "left",
            cellClassName: "font-medium text-zinc-800 min-w-[10rem] max-w-md",
            render: (row) => <span className="break-words">{row.survey_name}</span>,
          },
          {
            key: "qr_code_name",
            label: "QR Code",
            sortable: true,
            align: "left",
            cellClassName: "text-zinc-600 min-w-[9rem] max-w-md",
            render: (row) => <span className="break-words">{row.qr_code_name}</span>,
          },
          {
            key: "location_name",
            label: "Location",
            sortable: false,
            align: "left",
            cellClassName: "text-zinc-500",
            render: (row) =>
              row.location_name ?? (
                <span className="italic text-zinc-400">No Location</span>
              ),
          },
          {
            key: "scan_time",
            label: "Date Scanned",
            sortable: true,
            align: "left",
            cellClassName: "text-zinc-600",
            render: (row) => formatIsoInUserTimeZone(row.scan_time, userTimeZone),
          },
          {
            key: "completed",
            label: "Completed",
            sortable: false,
            align: "left",
            render: (row) => (
              <span
                className={[
                  "inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold",
                  row.completed ? "bg-emerald-50 text-emerald-700" : "bg-zinc-100 text-zinc-600",
                ].join(" ")}
              >
                {row.completed ? "Yes" : "No"}
              </span>
            ),
          },
          {
            key: "time_to_complete",
            label: "Time",
            sortable: true,
            align: "left",
            cellClassName: "text-zinc-600 tabular-nums",
            render: (row) => formatSeconds(row.time_to_complete_seconds),
          },
          {
            key: "questions_answered",
            label: "Questions",
            sortable: true,
            align: "center",
            cellClassName: "text-zinc-600 tabular-nums",
            render: (row) => row.questions_answered,
          },
          {
            key: "actions",
            label: "",
            sortable: false,
            align: "right",
            render: (row) =>
              row.completed && row.response_id ? (
                <button
                  type="button"
                  onClick={() => setReviewId(row.response_id)}
                  className="rounded-lg border border-zinc-200 px-3 py-1 text-xs font-semibold text-zinc-700 hover:bg-violet-50 hover:border-violet-300 hover:text-violet-700"
                >
                  Review
                </button>
              ) : (
                <span className="text-xs text-zinc-300">—</span>
              ),
          },
        ]}
        getRowKey={(row) => `${row.session_id}-${row.response_id ?? ""}`}
        sortKey={filters.sort_column}
        sortDir={filters.sort_direction}
        onSort={(key) => handleSort(key)}
        emptyMessage="No responses found matching the selected filters."
        loading={loading}
        minWidth="max(100%, 1280px)"
        footer={
          totalPages > 1 ? (
            <div className="flex items-center justify-between border-t border-zinc-200 bg-zinc-50 px-4 py-3">
              <span className="text-xs text-zinc-500">
                Showing {((page - 1) * PAGE_SIZE) + 1}–
                {Math.min(page * PAGE_SIZE, totalCount)} of {totalCount.toLocaleString()}
              </span>
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => { const p = Math.max(1, page - 1); setPage(p); loadData(p) }}
                  disabled={page <= 1 || loading}
                  className="rounded-lg border border-zinc-200 p-1.5 text-zinc-600 hover:bg-white disabled:opacity-40"
                  aria-label="Previous page"
                >
                  <ChevronLeft className="h-4 w-4" />
                </button>
                <span className="px-2 text-xs text-zinc-600">
                  {page} / {totalPages}
                </span>
                <button
                  type="button"
                  onClick={() => { const p = Math.min(totalPages, page + 1); setPage(p); loadData(p) }}
                  disabled={page >= totalPages || loading}
                  className="rounded-lg border border-zinc-200 p-1.5 text-zinc-600 hover:bg-white disabled:opacity-40"
                  aria-label="Next page"
                >
                  <ChevronRight className="h-4 w-4" />
                </button>
              </div>
            </div>
          ) : undefined
        }
      />

      {/* Review Modal */}
      {reviewId && (
        <ReviewModal
          responseId={reviewId}
          onClose={() => setReviewId(null)}
          onMarkRead={handleMarkResponseRead}
          onRequestDelete={() => { setDeleteId(reviewId); setReviewId(null) }}
        />
      )}
      <DeleteResponseDialog
        open={deleteId !== null}
        responseId={deleteId}
        onClose={() => setDeleteId(null)}
        onDeleted={(id) => {
          setDeleteId(null)
          setRows((prev) => prev.filter((r) => r.response_id !== id))
        }}
      />
    </div>
  )
}
