"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import {
  Archive,
  ArchiveRestore,
  ChevronDown,
  Download,
  Link2,
  Pencil,
  Plus,
  ToggleLeft,
  ToggleRight,
  Trash2,
  X,
  QrCode,
} from "lucide-react"
import { useConfirm } from "@/components/ui/ConfirmDialog"
import { QRCodeCanvas, QRCodeSVG } from "qrcode.react"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { DataTable, type DataTableColumn } from "@/components/ui/DataTable"
import { LoadingBlock } from "@/components/ui/LoadingSpinner"
import { SingleSelectDropdown } from "@/components/ui/DropdownSelect"
import { supabase } from "@/lib/supabase/client"
import { useQRSubmissionBlocked } from "@/components/layout/QRSubmissionBlockedContext"
import { useAuth } from "@/contexts/AuthContext"
import {
  archiveQRCode,
  createQRCode,
  deleteArchivedQRCode,
  extractErrorMessage,
  fetchLocations,
  fetchQRCodes,
  fetchSurveys,
  isStaleObjectError,
  unarchiveQRCode,
  updateQRCode,
  type LocationResponse,
  type QRCodeCreate,
  type QRCodeResponse,
  type QRCodeUpdate,
  type SurveySummary,
} from "@/lib/api/client"
import { formatIsoInUserTimeZone } from "@/lib/datetime/formatInUserTz"
import { DEFAULT_USER_TIMEZONE } from "@/lib/timezone/australia"

const APP_ORIGIN = process.env.NEXT_PUBLIC_APP_ORIGIN
function qrUrl(qrCodeId: string) {
  return `${APP_ORIGIN}/r/${qrCodeId}`
}

// ─── QR Download Panel ────────────────────────────────────────────────────────

function QRPanel({
  qr,
  onClose,
}: {
  qr: QRCodeResponse
  onClose: () => void
}) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const svgContainerRef = useRef<HTMLDivElement | null>(null)
  const displayUrl = qr.redirect_url ?? qrUrl(qr.id)
  const assets = qr.assets

  async function downloadFromUrl(href: string, filename: string) {
    const res = await fetch(href)
    const blob = await res.blob()

    const url = URL.createObjectURL(blob)

    const link = document.createElement("a")
    link.href = url
    link.download = filename
    link.click()

    URL.revokeObjectURL(url)
  }

  function downloadPNG() {
    if (assets) {
      downloadFromUrl(assets.png, `qr-${qr.id}.png`)
      return
    }
    const canvas = canvasRef.current
    if (!canvas) return
    const link = document.createElement("a")
    link.download = `qr-${qr.id}.png`
    link.href = canvas.toDataURL("image/png")
    link.click()
  }

  function downloadSVG() {
    if (assets) {
      downloadFromUrl(assets.svg, `qr-${qr.id}.svg`)
      return
    }
    const container = svgContainerRef.current
    if (!container) return
    const svgEl = container.querySelector("svg")
    if (!svgEl) return
    const serializer = new XMLSerializer()
    const svgStr = serializer.serializeToString(svgEl)
    const blob = new Blob([svgStr], { type: "image/svg+xml" })
    const link = document.createElement("a")
    link.download = `qr-${qr.id}.svg`
    link.href = URL.createObjectURL(blob)
    link.click()
    URL.revokeObjectURL(link.href)
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
      <div className="w-full max-w-sm rounded-2xl bg-white p-6 shadow-xl">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-base font-semibold text-zinc-900">
            QR Code — {qr.title}
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1 text-zinc-400 hover:bg-zinc-100"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="flex flex-col items-center gap-4">
          <div className="rounded-xl border border-zinc-200 bg-white p-3">
            {assets ? (
              // eslint-disable-next-line @next/next/no-img-element -- remote Supabase asset URL
              <img
                src={assets.png}
                alt=""
                className="h-[200px] w-[200px] object-contain"
              />
            ) : (
              <QRCodeCanvas
                ref={(el) => {
                  if (el) canvasRef.current = el
                }}
                value={displayUrl}
                size={200}
                level="H"
                includeMargin={false}
              />
            )}
          </div>

          {!assets ? (
            <div ref={svgContainerRef} className="hidden">
              <QRCodeSVG value={displayUrl} size={200} level="H" includeMargin={false} />
            </div>
          ) : null}

          <p className="break-all text-center text-xs text-zinc-500">{displayUrl}</p>

          <div className="flex w-full gap-2">
            <button
              type="button"
              onClick={downloadPNG}
              className="flex flex-1 items-center justify-center gap-1.5 rounded-xl border border-zinc-200 px-3 py-2 text-xs font-medium text-zinc-700 hover:bg-zinc-50"
            >
              <Download className="h-3.5 w-3.5" /> PNG
            </button>
            <button
              type="button"
              onClick={downloadSVG}
              className="flex flex-1 items-center justify-center gap-1.5 rounded-xl border border-zinc-200 px-3 py-2 text-xs font-medium text-zinc-700 hover:bg-zinc-50"
            >
              <Download className="h-3.5 w-3.5" /> SVG
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

// ─── QR Form Modal ─────────────────────────────────────────────────────────────

interface QRFormData {
  title: string
  survey_id: string
  location_id: string
  color: string
}

/** Matches backend: `#[0-9A-F]{6}` (case-insensitive while typing). */
function isValidQrColorHex(value: string): boolean {
  return /^#[0-9A-Fa-f]{6}$/.test(value.trim())
}

function normalizeQrColorHex(raw: string): string | null {
  let t = raw.trim()
  if (!t) return null
  if (!t.startsWith("#")) t = `#${t}`
  return isValidQrColorHex(t) ? t.toUpperCase() : null
}

function qrStatusBadge(status: QRCodeResponse["qr_status"]) {
  const map: Record<QRCodeResponse["qr_status"], { label: string; cls: string }> = {
    active: { label: "True", cls: "bg-emerald-50 text-emerald-700" },
    inactive: { label: "False", cls: "bg-red-50 text-red-700" },
    archived: { label: "False", cls: "bg-amber-50 text-amber-800" },
    deleted: { label: "False", cls: "bg-red-50 text-red-700" },
  }
  const resolved = map[status]
  return (
    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium ${resolved.cls}`}>
      {resolved.label}
    </span>
  )
}

function booleanStatusBadge(value: boolean) {
  const resolved = value
    ? { label: "True", cls: "bg-emerald-50 text-emerald-700" }
    : { label: "False", cls: "bg-red-50 text-red-700" }
  return (
    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium ${resolved.cls}`}>
      {resolved.label}
    </span>
  )
}

function QRModal({
  initial,
  surveys,
  locations,
  onSave,
  onClose,
  loading,
  error,
}: {
  initial?: QRCodeResponse | null
  surveys: SurveySummary[]
  locations: LocationResponse[]
  onSave: (data: QRFormData) => void
  onClose: () => void
  loading: boolean
  error: string | null
}) {
  const [form, setForm] = useState<QRFormData>(
    initial
      ? {
          title: initial.title,
          survey_id: initial.survey_id,
          location_id: initial.location_id,
          color: initial.color ?? "#000000",
        }
      : {
          title: "",
          survey_id: surveys[0]?.id ?? "",
          location_id: locations[0]?.id ?? "",
          color: "#000000",
        }
  )

  function set(field: keyof QRFormData, value: string) {
    setForm((f) => ({ ...f, [field]: value }))
  }

  const urlPreview = initial ? qrUrl(initial.id) : null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
      <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-base font-semibold text-zinc-900">
            {initial ? "Edit QR Code" : "Create QR Code"}
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1 text-zinc-400 hover:bg-zinc-100"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="space-y-4">
          <label className="block">
            <span className="text-sm font-medium text-zinc-700">
              Title <span className="text-red-500">*</span>
            </span>
            <input
              className="mt-1 w-full rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-violet-500"
              placeholder="e.g. Survey Title"
              value={form.title}
              onChange={(e) => set("title", e.target.value)}
            />
            {urlPreview && (
              <p className="mt-1 truncate text-xs text-zinc-400">{urlPreview}</p>
            )}
            {!initial && (
              <p className="mt-1 text-xs text-zinc-400">
                QR code URL will be generated when saved
              </p>
            )}
          </label>

          <label className="block">
            <span className="text-sm font-medium text-zinc-700">
              Survey <span className="text-red-500">*</span>
            </span>
            {surveys.length === 0 ? (
              <p className="mt-1 rounded-xl border border-zinc-200 bg-zinc-50 px-3 py-2 text-sm text-zinc-500">
                No active published surveys available.
              </p>
            ) : (
              <div className="mt-1">
                <SingleSelectDropdown
                  options={surveys.map((s) => ({ value: s.id, label: s.name }))}
                  value={form.survey_id}
                  onChange={(next) => set("survey_id", next)}
                />
              </div>
            )}
          </label>

          <label className="block">
            <span className="text-sm font-medium text-zinc-700">
              Location <span className="text-red-500">*</span>
            </span>
            {locations.length === 0 ? (
              <p className="mt-1 rounded-xl border border-zinc-200 bg-zinc-50 px-3 py-2 text-sm text-zinc-500">
                No active locations available.
              </p>
            ) : (
              <div className="mt-1">
                <SingleSelectDropdown
                  options={locations.filter((l) => l.is_active).map((l) => ({ value: l.id, label: l.name }))}
                  value={form.location_id}
                  onChange={(next) => set("location_id", next)}
                />
              </div>
            )}
          </label>

          <label className="block">
            <span className="text-sm font-medium text-zinc-700">QR colour</span>
            <div className="mt-1 flex flex-wrap items-center gap-3">
              <input
                type="color"
                value={isValidQrColorHex(form.color) ? form.color.trim().toUpperCase() : "#000000"}
                onChange={(e) => set("color", e.target.value.toUpperCase())}
                className="h-9 w-12 shrink-0 cursor-pointer rounded-lg border border-zinc-200 bg-white p-0.5"
                title="Pick a colour"
              />
              <input
                type="text"
                inputMode="text"
                spellCheck={false}
                autoCapitalize="characters"
                placeholder="#000000"
                value={form.color}
                onChange={(e) => set("color", e.target.value)}
                onBlur={() => {
                  const normalized = normalizeQrColorHex(form.color)
                  if (normalized) set("color", normalized)
                }}
                aria-invalid={!isValidQrColorHex(form.color)}
                className={`min-w-[7.5rem] flex-1 rounded-xl border bg-white px-3 py-2 font-mono text-sm outline-none focus:ring-2 focus:ring-violet-500 ${
                  isValidQrColorHex(form.color)
                    ? "border-zinc-200"
                    : "border-amber-300 focus:ring-amber-400"
                }`}
              />
            </div>
            <p className="mt-1 text-xs text-zinc-400">
              Enter a hex code with # and six digits (e.g. #1A2B3C), or use the swatch.
            </p>
          </label>

          {error && (
            <div className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
              {error}
            </div>
          )}

          <div className="flex gap-2 pt-1">
            <Button variant="ghost" className="flex-1" onClick={onClose} disabled={loading}>
              Cancel
            </Button>
            <Button
              className="flex-1"
              onClick={() => onSave(form)}
              disabled={
                loading ||
                !form.title.trim() ||
                !form.survey_id ||
                !form.location_id ||
                !isValidQrColorHex(form.color)
              }
            >
              {loading ? "Saving…" : "Save"}
            </Button>
          </div>
        </div>
      </div>
    </div>
  )
}

// ─── Page ─────────────────────────────────────────────────────────────────────

type QRSortKey = "title" | "survey" | "location" | "status"
type SortDir = "asc" | "desc"

export default function DistributionPage() {
  const { activeMembership, user } = useAuth()
  const userTimeZone = user?.timezone ?? DEFAULT_USER_TIMEZONE
  const isViewer = activeMembership?.role === "viewer"
  const { refreshSubmissionBlockedQrCount } = useQRSubmissionBlocked()
  const { confirm, ConfirmDialogRender } = useConfirm()
  const [qrCodes, setQRCodes] = useState<QRCodeResponse[]>([])
  const [surveys, setSurveys] = useState<SurveySummary[]>([])
  const [locations, setLocations] = useState<LocationResponse[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const [archivedOpen, setArchivedOpen] = useState(false)
  const [archivedQRCodes, setArchivedQRCodes] = useState<QRCodeResponse[]>([])
  const [archivedLoading, setArchivedLoading] = useState(false)

  const [modalOpen, setModalOpen] = useState(false)
  const [editTarget, setEditTarget] = useState<QRCodeResponse | null>(null)
  const [formError, setFormError] = useState<string | null>(null)
  const [formLoading, setFormLoading] = useState(false)

  const [qrPanel, setQRPanel] = useState<QRCodeResponse | null>(null)

  async function getToken() {
    const { data: { session } } = await supabase.auth.getSession()
    return session?.access_token ?? null
  }

  const load = useCallback(async () => {
    const token = await getToken()
    if (!token) return
    try {
      const [qrs, surveyRows, locationRows] = await Promise.all([
        fetchQRCodes(token),
        fetchSurveys(token, { activeOnly: true }),
        fetchLocations(token),
      ])
      setQRCodes(qrs)
      setSurveys(surveyRows)
      setLocations(locationRows)
    } catch (err) {
      setError(extractErrorMessage(err, "Failed to load"))
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    load()
  }, [load])

  useEffect(() => {
    if (!archivedOpen) return
    let cancelled = false
    ;(async () => {
      const token = await getToken()
      if (!token || cancelled) return
      setArchivedLoading(true)
      try {
        const rows = await fetchQRCodes(token, { archived: true })
        if (!cancelled) setArchivedQRCodes(rows)
      } catch {
        if (!cancelled) setArchivedQRCodes([])
      } finally {
        if (!cancelled) setArchivedLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [archivedOpen])

  function openCreate() {
    setEditTarget(null)
    setFormError(null)
    setModalOpen(true)
  }

  function openEdit(qr: QRCodeResponse) {
    setEditTarget(qr)
    setFormError(null)
    setModalOpen(true)
  }

  async function handleSave(form: QRFormData) {
    const token = await getToken()
    if (!token) return
    setFormLoading(true)
    setFormError(null)
    try {
      if (editTarget) {
        const updatePayload: QRCodeUpdate = {
          title: form.title.trim(),
          survey_id: form.survey_id,
          location_id: form.location_id,
          color: form.color,
          updated_at: editTarget.updated_at,
        }
        const updated = await updateQRCode(token, editTarget.id, updatePayload)
        setQRCodes((prev) => prev.map((q) => (q.id === updated.id ? updated : q)))
      } else {
        const createPayload: QRCodeCreate = {
          title: form.title.trim(),
          survey_id: form.survey_id,
          location_id: form.location_id,
          color: form.color,
        }
        const created = await createQRCode(token, createPayload)
        setQRCodes((prev) => [created, ...prev])
      }
      setModalOpen(false)
      void refreshSubmissionBlockedQrCount()
    } catch (err) {
      if (isStaleObjectError(err)) {
        setFormError("This QR code was updated. Please try again.")
      } else {
        setFormError(extractErrorMessage(err, "Save failed"))
      }
    } finally {
      setFormLoading(false)
    }
  }

  async function handleToggleActive(qr: QRCodeResponse) {
    const token = await getToken()
    if (!token) return
    try {
      const updated = await updateQRCode(token, qr.id, { is_active: !qr.is_active, updated_at: qr.updated_at })
      setQRCodes((prev) => prev.map((q) => (q.id === updated.id ? updated : q)))
      void refreshSubmissionBlockedQrCount()
    } catch (err) {
      if (isStaleObjectError(err)) {
        setError("This QR code was updated. Please refresh.")
      } else {
        load()
      }
    }
  }

  async function handleArchive(qr: QRCodeResponse) {
    const ok = await confirm({
      title: `Archive QR code — ${qr.title}`,
      message:
        "This QR code will stop accepting scans immediately. Any responses submitted through this QR code will be marked as archived.\n\nYou can restore it from the Archived section at any time.",
      confirmLabel: "Archive",
      variant: "warning",
    })
    if (!ok) return
    const token = await getToken()
    if (!token) return
    try {
      await archiveQRCode(token, qr.id, qr.updated_at)
      setQRCodes((prev) => prev.filter((q) => q.id !== qr.id))
      void refreshSubmissionBlockedQrCount()
      if (archivedOpen) {
        const t = await getToken()
        if (t) setArchivedQRCodes(await fetchQRCodes(t, { archived: true }))
      }
    } catch (err) {
      if (isStaleObjectError(err)) {
        void load()
        alert("This QR code was updated. Please try again.")
      } else {
        alert(extractErrorMessage(err, "Failed to archive QR code"))
      }
    }
  }

  async function handleUnarchive(qr: QRCodeResponse) {
    const token = await getToken()
    if (!token) return
    try {
      const updated = await unarchiveQRCode(token, qr.id, qr.updated_at)
      setArchivedQRCodes((prev) => prev.filter((q) => q.id !== qr.id))
      setQRCodes((prev) => [updated, ...prev])
      void refreshSubmissionBlockedQrCount()
    } catch (err) {
      if (isStaleObjectError(err)) {
        const t = await getToken()
        if (t) setArchivedQRCodes(await fetchQRCodes(t, { archived: true }))
        alert("This QR code was updated. Please try again.")
      } else {
        alert(extractErrorMessage(err, "Failed to unarchive QR code"))
      }
    }
  }

  async function handleDeleteArchived(qr: QRCodeResponse) {
    const ok = await confirm({
      title: `Delete QR code — ${qr.title}`,
      message:
        "This permanently removes this QR code and cannot be undone. The physical QR code will stop working.\n\nDeletion is blocked if any survey sessions or responses are linked to this QR code.",
      confirmLabel: "Delete permanently",
      cancelLabel: "Cancel",
      variant: "danger",
    })
    if (!ok) return
    const token = await getToken()
    if (!token) return
    try {
      await deleteArchivedQRCode(token, qr.id, qr.updated_at)
      setArchivedQRCodes((prev) => prev.filter((q) => q.id !== qr.id))
      void refreshSubmissionBlockedQrCount()
    } catch (err) {
      if (isStaleObjectError(err)) {
        const t = await getToken()
        if (t) setArchivedQRCodes(await fetchQRCodes(t, { archived: true }))
        alert("This QR code was updated. Please try again.")
      } else {
        alert(extractErrorMessage(err, "Failed to delete QR code"))
      }
    }
  }

  const [sortKey, setSortKey] = useState<QRSortKey>("title")
  const [sortDir, setSortDir] = useState<SortDir>("asc")

  const sortedQRCodes = [...qrCodes].sort((a, b) => {
    let cmp = 0
    switch (sortKey) {
      case "title":
        cmp = a.title.localeCompare(b.title)
        break
      case "survey":
        cmp = (a.survey_title ?? "").localeCompare(b.survey_title ?? "")
        break
      case "location":
        cmp = (a.location_name ?? "").localeCompare(b.location_name ?? "")
        break
      case "status":
        cmp = `${a.qr_status}|${a.accepting_submissions_by_survey_and_location ? "1" : "0"}`.localeCompare(
          `${b.qr_status}|${b.accepting_submissions_by_survey_and_location ? "1" : "0"}`,
        )
        break
      default:
        return 0
    }
    return sortDir === "asc" ? cmp : -cmp
  })

  function toggleSort(key: QRSortKey) {
    if (sortKey === key) setSortDir((d) => (d === "asc" ? "desc" : "asc"))
    else {
      setSortKey(key)
      setSortDir("asc")
    }
  }

  const columns: DataTableColumn<QRCodeResponse>[] = [
    {
      key: "title",
      label: "Title",
      sortable: true,
      align: "left",
      render: (qr) => (
        <div className="flex items-center justify-start gap-3">
          <button
            type="button"
            onClick={() => setQRPanel(qr)}
            className="flex-shrink-0 rounded-lg border border-zinc-200 bg-white p-0.5 hover:border-violet-400"
            title="View & download QR"
          >
            {qr.assets ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={qr.assets.png}
                alt=""
                className="h-9 w-9 object-contain"
              />
            ) : (
              <QRCodeCanvas
                value={qrUrl(qr.id)}
                size={36}
                level="M"
                includeMargin={false}
              />
            )}
          </button>
          <span className="break-words font-medium text-zinc-900">
            {qr.title}
          </span>
        </div>
      ),
    },
    {
      key: "survey",
      label: "Assigned Survey",
      sortable: true,
      align: "center",
      render: (qr) => (
        <span className="break-words text-zinc-700">
          {qr.survey_title ?? "—"}
        </span>
      ),
    },
    {
      key: "location",
      label: "Assigned Location",
      sortable: true,
      align: "center",
      render: (qr) => (
        <span className="break-words text-zinc-600">
          {qr.location_name || "—"}
        </span>
      ),
    },
    {
      key: "status",
      label: "Status",
      sortable: true,
      align: "center",
      render: (qr) => (
        <div className="flex flex-col items-center gap-1.5">
          <div className="flex flex-wrap items-center justify-center gap-1">
            <span className="text-[10px] font-medium uppercase tracking-wide text-zinc-400">Accepting Scans</span>
            {qrStatusBadge(qr.qr_status)}
          </div>
          <div className="flex flex-wrap items-center justify-center gap-1">
            <span className="text-[10px] font-medium uppercase tracking-wide text-zinc-400">Accepting Submissions</span>
            {booleanStatusBadge(qr.accepting_submissions_by_survey_and_location)}
          </div>
        </div>
      ),
    },
    {
      key: "actions",
      label: "Actions",
      sortable: false,
      align: "center",
      render: (qr) => (
        <div className="flex items-center justify-center gap-1">
          <button
            type="button"
            onClick={() => setQRPanel(qr)}
            className="rounded-lg p-1.5 text-zinc-400 hover:bg-zinc-100 hover:text-violet-600"
            title="View QR code"
          >
            <QrCode className="h-3.5 w-3.5" />
          </button>
          {!isViewer && (
            <>
              <button
                type="button"
                onClick={() => openEdit(qr)}
                className="rounded-lg p-1.5 text-zinc-400 hover:bg-zinc-100 hover:text-zinc-700"
                title="Edit"
              >
                <Pencil className="h-3.5 w-3.5" />
              </button>
              <button
                type="button"
                onClick={() => handleToggleActive(qr)}
                className="rounded-lg p-1.5 text-zinc-400 hover:bg-zinc-100 hover:text-zinc-700"
                title={qr.is_active ? "Deactivate" : "Activate"}
              >
                {qr.is_active ? (
                  <ToggleRight className="h-3.5 w-3.5 text-emerald-500" />
                ) : (
                  <ToggleLeft className="h-3.5 w-3.5" />
                )}
              </button>
              <button
                type="button"
                onClick={() => handleArchive(qr)}
                className="rounded-lg p-1.5 text-zinc-400 hover:bg-amber-50 hover:text-amber-800"
                title="Archive QR code"
              >
                <Archive className="h-3.5 w-3.5" />
              </button>
            </>
          )}
        </div>
      ),
    },
  ]

  return (
    <div className="space-y-6">
      {ConfirmDialogRender}
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-zinc-950">
            QR Codes
          </h1>
          <p className="mt-1 text-sm text-zinc-500">
            Create and manage QR codes that link surveys to locations.
          </p>
        </div>
        {!isViewer && (
          <Button onClick={openCreate}>
            <Plus className="mr-1.5 h-4 w-4" />
            Create QR Code
          </Button>
        )}
      </div>

      {/* Content */}
      {loading ? (
        <div className="flex min-h-[200px] items-center justify-center">
          <LoadingBlock message="Loading QR codes…" />
        </div>
      ) : error ? (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      ) : (
        <div className="space-y-4">
          {qrCodes.length === 0 ? (
            <Card className="flex flex-col items-center gap-3 py-16">
              <Link2 className="h-8 w-8 text-zinc-300" />
              <p className="text-sm font-medium text-zinc-500">No QR codes yet</p>
              {!isViewer && (
                <Button variant="ghost" onClick={openCreate}>
                  Create your first QR code
                </Button>
              )}
            </Card>
          ) : (
            <DataTable<QRCodeResponse>
              data={sortedQRCodes}
              columns={columns}
              getRowKey={(qr) => qr.id}
              sortKey={sortKey}
              sortDir={sortDir}
              onSort={(key) => toggleSort(key as QRSortKey)}
            />
          )}

          {!isViewer && <details
            className="group rounded-xl border border-zinc-200 bg-zinc-50/50"
            open={archivedOpen}
            onToggle={(e) => setArchivedOpen(e.currentTarget.open)}
          >
            <summary className="flex cursor-pointer list-none items-center justify-between gap-2 px-4 py-3 text-sm font-medium text-zinc-700 [&::-webkit-details-marker]:hidden">
              <span className="flex items-center gap-2">
                <ChevronDown className="h-4 w-4 shrink-0 text-zinc-400 transition-transform group-open:rotate-180" />
                Archived QR codes
              </span>
            </summary>
            <div className="border-t border-zinc-200 px-2 pb-4 pt-2">
              {archivedLoading ? (
                <div className="flex justify-center py-8">
                  <LoadingBlock message="Loading archived QR codes…" />
                </div>
              ) : archivedQRCodes.length === 0 ? (
                <p className="px-2 py-6 text-center text-sm text-zinc-500">No archived QR codes</p>
              ) : (
                <DataTable<QRCodeResponse>
                  data={[...archivedQRCodes].sort((a, b) => a.title.localeCompare(b.title))}
                  columns={[
                    {
                      key: "title",
                      label: "Title",
                      sortable: false,
                      align: "left",
                      render: (qr) => <span className="font-medium text-zinc-800">{qr.title}</span>,
                    },
                    {
                      key: "location",
                      label: "Location",
                      sortable: false,
                      align: "center",
                      render: (qr) => (
                        <span className="text-zinc-600">{qr.location_name ?? "—"}</span>
                      ),
                    },
                    {
                      key: "reason",
                      label: "Note",
                      sortable: false,
                      align: "center",
                      render: (qr) => (
                        <span className="text-xs text-zinc-500">
                          {!qr.archived_at ? "Location archived" : "Archived"}
                        </span>
                      ),
                    },
                    {
                      key: "archived_at",
                      label: "Archived at",
                      sortable: false,
                      align: "center",
                      render: (qr) => (
                        <span className="text-sm text-zinc-600">
                          {formatIsoInUserTimeZone(qr.archived_at ?? "", userTimeZone)}
                        </span>
                      ),
                    },
                    {
                      key: "actions",
                      label: "Actions",
                      sortable: false,
                      align: "center",
                      render: (qr) =>
                        isViewer ? (
                          <span className="text-zinc-400">—</span>
                        ) : (
                          <div className="flex flex-wrap items-center justify-center gap-1">
                            <button
                              type="button"
                              onClick={() => handleUnarchive(qr)}
                              className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-sm text-violet-700 hover:bg-violet-50"
                              title="Unarchive QR code"
                            >
                              <ArchiveRestore className="h-3.5 w-3.5" />
                              Unarchive
                            </button>
                            <button
                              type="button"
                              onClick={() => void handleDeleteArchived(qr)}
                              className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-sm text-red-700 hover:bg-red-50"
                              title="Delete QR code permanently"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                              Delete
                            </button>
                          </div>
                        ),
                    },
                  ]}
                  getRowKey={(qr) => qr.id}
                />
              )}
            </div>
          </details>}
        </div>
      )}

      {/* QR Download Panel */}
      {qrPanel && <QRPanel qr={qrPanel} onClose={() => setQRPanel(null)} />}

      {/* Form Modal */}
      {modalOpen && (
        <QRModal
          initial={editTarget}
          surveys={surveys}
          locations={locations}
          onSave={handleSave}
          onClose={() => setModalOpen(false)}
          loading={formLoading}
          error={formError}
        />
      )}
    </div>
  )
}
