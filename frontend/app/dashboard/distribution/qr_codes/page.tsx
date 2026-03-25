"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { Download, Link2, Pencil, Plus, ToggleLeft, ToggleRight, Trash2, X, QrCode } from "lucide-react"
import { useConfirm } from "@/components/ui/ConfirmDialog"
import { QRCodeCanvas, QRCodeSVG } from "qrcode.react"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { DataTable, type DataTableColumn } from "@/components/ui/DataTable"
import { LoadingBlock } from "@/components/ui/LoadingSpinner"
import { SingleSelectDropdown } from "@/components/ui/DropdownSelect"
import { supabase } from "@/lib/supabase/client"
import {
  createQRCode,
  deleteQRCode,
  extractErrorMessage,
  fetchLocationSurveys,
  fetchQRCodes,
  isStaleObjectError,
  updateQRCode,
  type LocationSurveyResponse,
  type QRCodeCreate,
  type QRCodeResponse,
  type QRCodeUpdate,
} from "@/lib/api/client"

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

  function downloadJPEG() {
    if (assets) {
      downloadFromUrl(assets.jpeg, `qr-${qr.id}.jpeg`)
      return
    }
    const canvas = canvasRef.current
    if (!canvas) return
    const link = document.createElement("a")
    link.download = `qr-${qr.id}.jpeg`
    link.href = canvas.toDataURL("image/jpeg", 0.95)
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
              onClick={downloadJPEG}
              className="flex flex-1 items-center justify-center gap-1.5 rounded-xl border border-zinc-200 px-3 py-2 text-xs font-medium text-zinc-700 hover:bg-zinc-50"
            >
              <Download className="h-3.5 w-3.5" /> JPEG
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
  location_survey_id: string
}

function qrStatusBadge(status: QRCodeResponse["qr_status"]) {
  const map: Record<QRCodeResponse["qr_status"], { label: string; cls: string }> = {
    active: { label: "True", cls: "bg-emerald-50 text-emerald-700" },
    inactive: { label: "False", cls: "bg-red-50 text-red-700" },
    deleted: { label: "False", cls: "bg-red-50 text-red-700" },
  }
  const resolved = map[status]
  return (
    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium ${resolved.cls}`}>
      {resolved.label}
    </span>
  )
}

function assignmentStatusBadge(status: QRCodeResponse["location_survey_status"]) {
  const map: Record<QRCodeResponse["location_survey_status"], { label: string; cls: string }> = {
    active: { label: "True", cls: "bg-emerald-50 text-emerald-700" },
    scheduled: { label: "False", cls: "bg-red-50 text-red-700" },
    inactive: { label: "False", cls: "bg-red-50 text-red-700" },
    deleted: { label: "False", cls: "bg-red-50 text-red-700" },
  }
  const resolved = map[status]
  return (
    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium ${resolved.cls}`}>
      {resolved.label}
    </span>
  )
}

function QRModal({
  initial,
  locationSurveys,
  onSave,
  onClose,
  loading,
  error,
}: {
  initial?: QRCodeResponse | null
  locationSurveys: LocationSurveyResponse[]
  onSave: (data: QRFormData) => void
  onClose: () => void
  loading: boolean
  error: string | null
}) {
  const [form, setForm] = useState<QRFormData>(
    initial
      ? {
          title: initial.title,
          location_survey_id: initial.location_survey_id,
        }
      : {
          title: "",
          location_survey_id: locationSurveys[0]?.id ?? "",
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
              Survey & location assignment <span className="text-red-500">*</span>
            </span>
            {locationSurveys.length === 0 ? (
              <p className="mt-1 rounded-xl border border-zinc-200 bg-zinc-50 px-3 py-2 text-sm text-zinc-500">
                No active survey assignments are available yet.
              </p>
            ) : (
              <div className="mt-1">
                <SingleSelectDropdown
                  options={locationSurveys.map((locationSurvey) => ({
                    value: locationSurvey.id,
                    label: `${locationSurvey.survey_name} - ${locationSurvey.location_name}`,
                  }))}
                  value={form.location_survey_id}
                  onChange={(next) => set("location_survey_id", next)}
                />
              </div>
            )}
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
              disabled={loading || !form.title.trim() || !form.location_survey_id}
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
  const { confirm, ConfirmDialogRender } = useConfirm()
  const [qrCodes, setQRCodes] = useState<QRCodeResponse[]>([])
  const [locationSurveys, setLocationSurveys] = useState<LocationSurveyResponse[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

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
      const [qrs, assignments] = await Promise.all([
        fetchQRCodes(token),
        fetchLocationSurveys(token),
      ])
      setQRCodes(qrs)
      setLocationSurveys(assignments)
    } catch (err) {
      setError(extractErrorMessage(err, "Failed to load"))
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

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
      const basePayload: QRCodeCreate = {
        title: form.title.trim(),
        location_survey_id: form.location_survey_id,
      }
      if (editTarget) {
        const updatePayload: QRCodeUpdate = { ...basePayload, updated_at: editTarget.updated_at }
        const updated = await updateQRCode(token, editTarget.id, updatePayload)
        setQRCodes((prev) => prev.map((q) => (q.id === updated.id ? updated : q)))
      } else {
        const created = await createQRCode(token, basePayload)
        setQRCodes((prev) => [created, ...prev])
      }
      setModalOpen(false)
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
    } catch (err) {
      if (isStaleObjectError(err)) {
        setError("This QR code was updated. Please refresh.")
      } else {
        load()
      }
    }
  }

  async function handleDelete(qr: QRCodeResponse) {
    const ok = await confirm({
      title: `Delete QR code - ${qr.title}`,
      message: `Are you sure you want to delete this QR code? This cannot be undone.`,
      confirmLabel: "Delete",
      variant: "danger",
    })
    if (!ok) return
    const token = await getToken()
    if (!token) return
    try {
      await deleteQRCode(token, qr.id, qr.updated_at)
      setQRCodes((prev) => prev.filter((q) => q.id !== qr.id))
    } catch (err) {
      if (isStaleObjectError(err)) {
        setError("This QR code was updated. Please refresh.")
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
        cmp = `${a.qr_status}|${a.location_survey_status}`.localeCompare(`${b.qr_status}|${b.location_survey_status}`)
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
      align: "center",
      render: (qr) => (
        <div className="flex items-center justify-center gap-3">
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
            {assignmentStatusBadge(qr.location_survey_status)}
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
            onClick={() => handleDelete(qr)}
            className="rounded-lg p-1.5 text-zinc-400 hover:bg-red-50 hover:text-red-600"
            title="Delete QR code"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
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
            Create and manage QR codes that point to assigned surveys.
          </p>
        </div>
        <Button onClick={openCreate}>
          <Plus className="mr-1.5 h-4 w-4" />
          Create QR Code
        </Button>
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
      ) : qrCodes.length === 0 ? (
        <Card className="flex flex-col items-center gap-3 py-16">
          <Link2 className="h-8 w-8 text-zinc-300" />
          <p className="text-sm font-medium text-zinc-500">No QR codes yet</p>
          <Button variant="ghost" onClick={openCreate}>
            Create your first QR code
          </Button>
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

      {/* QR Download Panel */}
      {qrPanel && <QRPanel qr={qrPanel} onClose={() => setQRPanel(null)} />}

      {/* Form Modal */}
      {modalOpen && (
        <QRModal
          initial={editTarget}
          locationSurveys={locationSurveys}
          onSave={handleSave}
          onClose={() => setModalOpen(false)}
          loading={formLoading}
          error={formError}
        />
      )}
    </div>
  )
}
