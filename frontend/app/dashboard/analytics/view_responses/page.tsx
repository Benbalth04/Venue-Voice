"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import {
  ChevronLeft,
  ChevronRight,
  Download,
  FileSpreadsheet,
  Filter,
  Loader2,
  X,
} from "lucide-react"
import { supabase } from "@/lib/supabase/client"
import {
  downloadAnalyticsExport,
  fetchAnalyticsFilters,
  fetchAnalyticsResponseDetail,
  fetchAnalyticsResponses,
  extractErrorMessage,
  type AnalyticsAnswerDetail,
  type AnalyticsFilterOption,
  type AnalyticsFilters,
  type AnalyticsResponseRow,
} from "@/lib/api/client"
import { DataTable } from "@/components/ui/DataTable"
import { useUnreadResponses } from "@/components/layout/UnreadResponsesContext"

// ─── Helpers ─────────────────────────────────────────────────────────────────

function formatSeconds(s: number | null | undefined): string {
  if (s == null) return "—"
  const m = Math.floor(s / 60)
  const sec = s % 60
  return `${m}:${String(sec).padStart(2, "0")}`
}

function formatDate(iso: string): string {
  if (!iso) return "—"
  return new Date(iso).toLocaleString(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  })
}

async function getToken(): Promise<string | null> {
  const { data } = await supabase.auth.getSession()
  return data.session?.access_token ?? null
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
}: {
  responseId: string
  onClose: () => void
  onMarkRead?: (id: string) => void
}) {
  const [answers, setAnswers] = useState<AnalyticsAnswerDetail[]>([])
  const [surveyName, setSurveyName] = useState("")
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [sortKey, setSortKey] = useState<string>("question")
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc")

  useEffect(() => {
    let cancelled = false
    async function load() {
      const token = await getToken()
      if (!token) { setError("Not authenticated"); setLoading(false); return }
      try {
        const detail = await fetchAnalyticsResponseDetail(token, responseId)
        if (cancelled) return
        setSurveyName(detail.survey_name)
        setAnswers(detail.answers)
        onMarkRead?.(responseId)
      } catch (e) {
        if (!cancelled) setError(extractErrorMessage(e, "Failed to load response"))
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    load()
    return () => { cancelled = true }
  }, [onMarkRead, responseId])

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-4"
      onClick={(e) => { if (e.target === e.currentTarget) onClose() }}
    >
      <div className="relative w-full max-w-2xl rounded-2xl bg-white shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-zinc-200 px-6 py-4">
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
        <div className="max-h-[60vh] overflow-y-auto px-6 py-4">
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
          {!loading && !error && answers.length === 0 && (
            <p className="py-8 text-center text-sm text-zinc-400">No answers recorded.</p>
          )}
          {!loading && !error && answers.length > 0 && (() => {
            const sorted = [...answers].sort((a, b) => {
              const cmp =
                sortKey === "question"
                  ? a.question_text.localeCompare(b.question_text)
                  : (a.answer_value ?? "").localeCompare(b.answer_value ?? "")
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
                    render: (a) => <span className="text-zinc-700">{a.question_text}</span>,
                  },
                  {
                    key: "answer",
                    label: "Answer",
                    sortable: true,
                    align: "left",
                    render: (a) => (
                      <span className="font-medium text-zinc-900">{a.answer_value || "—"}</span>
                    ),
                  },
                ]}
                getRowKey={(a) => `${a.question_text}-${a.answer_value ?? ""}`}
                sortKey={sortKey}
                sortDir={sortDir}
                onSort={(key) => {
                  setSortKey(key)
                  setSortDir((d) => (sortKey === key && d === "asc" ? "desc" : "asc"))
                }}
              />
            )
          })()}
        </div>

        <div className="border-t border-zinc-100 px-6 py-3 text-right">
          <button
            onClick={onClose}
            className="rounded-xl bg-zinc-100 px-4 py-2 text-sm font-semibold text-zinc-700 hover:bg-zinc-200"
          >
            Close
          </button>
        </div>
      </div>
    </div>
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
    <div className="rounded-xl border border-zinc-200 bg-white p-4 shadow-sm">
      <div className="mb-3 flex items-center justify-between">
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

      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6">
        {/* Survey */}
        <div>
          <label className="mb-1 block text-xs font-medium text-zinc-600">Survey</label>
          <select
            value={filters.survey_id}
            onChange={(e) => onChange("survey_id", e.target.value)}
            className="w-full rounded-lg border border-zinc-200 bg-white px-2 py-1.5 text-sm text-zinc-800 focus:outline-none focus:ring-2 focus:ring-violet-400"
          >
            <option value="">All surveys</option>
            {surveys.map((s) => (
              <option key={s.id} value={s.id}>{s.name}</option>
            ))}
          </select>
        </div>

        {/* QR Code */}
        <div>
          <label className="mb-1 block text-xs font-medium text-zinc-600">QR Code</label>
          <select
            value={filters.qr_code_id}
            onChange={(e) => onChange("qr_code_id", e.target.value)}
            className="w-full rounded-lg border border-zinc-200 bg-white px-2 py-1.5 text-sm text-zinc-800 focus:outline-none focus:ring-2 focus:ring-violet-400"
          >
            <option value="">All QR codes</option>
            {qrCodes.map((q) => (
              <option key={q.id} value={q.id}>{q.name}</option>
            ))}
          </select>
        </div>

        {/* Location */}
        <div>
          <label className="mb-1 block text-xs font-medium text-zinc-600">Location</label>
          <select
            value={filters.location_id}
            onChange={(e) => onChange("location_id", e.target.value)}
            className="w-full rounded-lg border border-zinc-200 bg-white px-2 py-1.5 text-sm text-zinc-800 focus:outline-none focus:ring-2 focus:ring-violet-400"
          >
            <option value="">All locations</option>
            <option value="__none__">No Location</option>
            {locations.map((l) => (
              <option key={l.id} value={l.id}>{l.name}</option>
            ))}
          </select>
        </div>

        {/* Completed */}
        <div>
          <label className="mb-1 block text-xs font-medium text-zinc-600">Completed</label>
          <select
            value={filters.completed}
            onChange={(e) => onChange("completed", e.target.value)}
            className="w-full rounded-lg border border-zinc-200 bg-white px-2 py-1.5 text-sm text-zinc-800 focus:outline-none focus:ring-2 focus:ring-violet-400"
          >
            <option value="">All</option>
            <option value="true">Yes</option>
            <option value="false">No</option>
          </select>
        </div>

        {/* Date start */}
        <div>
          <label className="mb-1 block text-xs font-medium text-zinc-600">From date</label>
          <input
            type="date"
            value={filters.date_start}
            onChange={(e) => onChange("date_start", e.target.value)}
            className="w-full rounded-lg border border-zinc-200 bg-white px-2 py-1.5 text-sm text-zinc-800 focus:outline-none focus:ring-2 focus:ring-violet-400"
          />
        </div>

        {/* Date end */}
        <div>
          <label className="mb-1 block text-xs font-medium text-zinc-600">To date</label>
          <input
            type="date"
            value={filters.date_end}
            onChange={(e) => onChange("date_end", e.target.value)}
            className="w-full rounded-lg border border-zinc-200 bg-white px-2 py-1.5 text-sm text-zinc-800 focus:outline-none focus:ring-2 focus:ring-violet-400"
          />
        </div>
      </div>
    </div>
  )
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function AnalyticsPage() {
  const { markResponseRead } = useUnreadResponses()
  const [rows, setRows] = useState<AnalyticsResponseRow[]>([])
  const [totalCount, setTotalCount] = useState(0)
  const [page, setPage] = useState(1)
  const PAGE_SIZE = 100

  const [filters, setFilters] = useState<FiltersState>(DEFAULT_FILTERS)
  const [surveys, setSurveys] = useState<AnalyticsFilterOption[]>([])
  const [qrCodes, setQrCodes] = useState<AnalyticsFilterOption[]>([])
  const [locations, setLocations] = useState<AnalyticsFilterOption[]>([])

  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [filtersError, setFiltersError] = useState<string | null>(null)

  const [reviewId, setReviewId] = useState<string | null>(null)
  const [exporting, setExporting] = useState<"csv" | "excel" | null>(null)

  const abortRef = useRef<AbortController | null>(null)

  // Build API filter object from state
  function buildApiFilters(): AnalyticsFilters {
    const f: AnalyticsFilters = {
      page,
      page_size: PAGE_SIZE,
      sort_column: filters.sort_column,
      sort_direction: filters.sort_direction,
    }
    if (filters.survey_id) f.survey_id = filters.survey_id
    if (filters.qr_code_id) f.qr_code_id = filters.qr_code_id
    if (filters.location_id) f.location_id = filters.location_id
    if (filters.completed !== "") f.completed = filters.completed === "true"
    if (filters.date_start) f.date_start = filters.date_start
    if (filters.date_end) f.date_end = filters.date_end
    return f
  }

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

  // Load table data whenever filters or page changes
  const loadData = useCallback(async () => {
    abortRef.current?.abort()
    abortRef.current = new AbortController()
    setLoading(true)
    setError(null)
    const token = await getToken()
    if (!token) { setError("Not authenticated"); setLoading(false); return }
    try {
      const data = await fetchAnalyticsResponses(token, buildApiFilters())
      setRows(data.rows)
      setTotalCount(data.total_count)
    } catch (e) {
      if ((e as Error).name === "AbortError") return
      setError(extractErrorMessage(e, "Something went wrong while loading analytics."))
    } finally {
      setLoading(false)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filters, page])

  useEffect(() => { loadData() }, [loadData])

  function handleFilterChange(key: keyof FiltersState, value: string) {
    setPage(1)
    setFilters((prev) => ({ ...prev, [key]: value }))
  }

  function handleResetFilters() {
    setPage(1)
    setFilters(DEFAULT_FILTERS)
  }

  function handleSort(col: string) {
    setPage(1)
    setFilters((prev) => ({
      ...prev,
      sort_column: col,
      sort_direction: prev.sort_column === col && prev.sort_direction === "desc" ? "asc" : "desc",
    }))
  }

  async function handleExport(format: "csv" | "excel") {
    setExporting(format)
    try {
      const token = await getToken()
      if (!token) throw new Error("Not authenticated")
      await downloadAnalyticsExport(token, format, buildApiFilters())
    } catch (e) {
      alert(extractErrorMessage(e, "Export failed"))
    } finally {
      setExporting(null)
    }
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
    <div className="flex flex-col gap-4 p-6">
      {/* Page header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-zinc-900">Analytics</h1>
          <p className="text-sm text-zinc-500">Survey response data across your company.</p>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => handleExport("csv")}
            disabled={exporting != null}
            className="inline-flex items-center gap-1.5 rounded-xl border border-zinc-200 bg-white px-3 py-1.5 text-sm font-medium text-zinc-700 hover:bg-zinc-50 disabled:opacity-50"
          >
            {exporting === "csv" ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Download className="h-3.5 w-3.5" />
            )}
            Export CSV
          </button>
          <button
            type="button"
            onClick={() => handleExport("excel")}
            disabled={exporting != null}
            className="inline-flex items-center gap-1.5 rounded-xl border border-zinc-200 bg-white px-3 py-1.5 text-sm font-medium text-zinc-700 hover:bg-zinc-50 disabled:opacity-50"
          >
            {exporting === "excel" ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <FileSpreadsheet className="h-3.5 w-3.5" />
            )}
            Export Excel
          </button>
        </div>
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
            cellClassName: "font-medium text-zinc-800 max-w-[160px]",
            render: (row) => <span className="break-words">{row.survey_name}</span>,
          },
          {
            key: "qr_code_name",
            label: "QR Code",
            sortable: true,
            align: "left",
            cellClassName: "text-zinc-600 max-w-[140px]",
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
            render: (row) => formatDate(row.scan_time),
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
        minWidth="900px"
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
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
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
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
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
        />
      )}
    </div>
  )
}
