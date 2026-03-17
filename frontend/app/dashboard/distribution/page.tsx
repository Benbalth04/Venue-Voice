"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { Download, Link2, Pencil, Plus, ToggleLeft, ToggleRight, Trash2, X, QrCode } from "lucide-react"
import { useConfirm } from "@/components/ui/ConfirmDialog"
import { QRCodeCanvas, QRCodeSVG } from "qrcode.react"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { supabase } from "@/lib/supabase/client"
import {
  createQRCode,
  deleteQRCode,
  fetchLocations,
  fetchQRCodes,
  fetchSurveys,
  updateQRCode,
  type LocationResponse,
  type QRCodeCreate,
  type QRCodeResponse,
  type SurveySummary,
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
  const url = qrUrl(qr.id)

  function downloadPNG() {
    const canvas = canvasRef.current
    if (!canvas) return
    const link = document.createElement("a")
    link.download = `qr-${qr.id}.png`
    link.href = canvas.toDataURL("image/png")
    link.click()
  }

  function downloadJPEG() {
    const canvas = canvasRef.current
    if (!canvas) return
    const link = document.createElement("a")
    link.download = `qr-${qr.id}.jpeg`
    link.href = canvas.toDataURL("image/jpeg", 0.95)
    link.click()
  }

  function downloadSVG() {
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
          <h2 className="text-base font-semibold text-zinc-900">QR Code — {qr.title}</h2>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1 text-zinc-400 hover:bg-zinc-100"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="flex flex-col items-center gap-4">
          {/* Visible QR (canvas for download) */}
          <div className="rounded-xl border border-zinc-200 bg-white p-3">
            <QRCodeCanvas
              ref={(el) => {
                if (el) canvasRef.current = el
              }}
              value={url}
              size={200}
              level="H"
              includeMargin={false}
            />
          </div>

          {/* Hidden SVG for SVG download */}
          <div ref={svgContainerRef} className="hidden">
            <QRCodeSVG value={url} size={200} level="H" includeMargin={false} />
          </div>

          <p className="break-all text-center text-xs text-zinc-500">{url}</p>

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
  survey_id: string
  location_id: string
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
          survey_id: initial.survey_id ?? "",   // convert null to ""
          location_id: initial.location_id ?? "",
        }
      : {
          title: "",
          survey_id: surveys[0]?.id ?? "",      // keep as fallback
          location_id: "",
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
              placeholder="e.g. cafe-table-1"
              value={form.title}
              onChange={(e) =>
                set("title", e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, "-"))
              }
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
                No surveys available. Create a survey first.
              </p>
            ) : (
              <select
                className="mt-1 w-full rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-violet-500"
                value={form.survey_id}
                onChange={(e) => set("survey_id", e.target.value)}
              >
                {surveys.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name} ({s.status})
                  </option>
                ))}
              </select>
            )}
          </label>

          <label className="block">
            <span className="text-sm font-medium text-zinc-700">Location (optional)</span>
            <select
              className="mt-1 w-full rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-violet-500"
              value={form.location_id}
              onChange={(e) => set("location_id", e.target.value)}
            >
              <option value="">— No location —</option>
              {locations
                .filter((l) => l.is_active)
                .map((l) => (
                  <option key={l.id} value={l.id}>
                    {l.name}
                  </option>
                ))}
            </select>
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
              disabled={loading || !form.title.trim() || !form.survey_id}
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
  const [surveys, setSurveys] = useState<SurveySummary[]>([])
  const [locations, setLocations] = useState<LocationResponse[]>([])
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
      const [qrs, svs, locs] = await Promise.all([
        fetchQRCodes(token),
        fetchSurveys(token),
        fetchLocations(token),
      ])
      setQRCodes(qrs)
      setSurveys(svs)
      setLocations(locs)
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load")
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
      const payload: QRCodeCreate = {
        title: form.title.trim(),
        survey_id: form.survey_id,
        location_id: form.location_id || null,
      }
      if (editTarget) {
        const updated = await updateQRCode(token, editTarget.id, payload)
        setQRCodes((prev) => prev.map((q) => (q.id === updated.id ? updated : q)))
      } else {
        const created = await createQRCode(token, payload)
        setQRCodes((prev) => [created, ...prev])
      }
      setModalOpen(false)
    } catch (err) {
      setFormError(err instanceof Error ? err.message : "Save failed")
    } finally {
      setFormLoading(false)
    }
  }

  async function handleToggleActive(qr: QRCodeResponse) {
    const token = await getToken()
    if (!token) return
    try {
      const updated = await updateQRCode(token, qr.id, { is_active: !qr.is_active })
      setQRCodes((prev) => prev.map((q) => (q.id === updated.id ? updated : q)))
    } catch {
      load()
    }
  }

  async function handleDelete(qr: QRCodeResponse) {
    const ok = await confirm({
      title: "Deactivate QR code",
      message: `Deactivate QR code "${qr.title}"?`,
      confirmLabel: "Deactivate",
      variant: "danger",
    })
    if (!ok) return
    const token = await getToken()
    if (!token) return
    try {
      await deleteQRCode(token, qr.id)
      setQRCodes((prev) => prev.map((q) => (q.id === qr.id ? { ...q, is_active: false } : q)))
    } catch (err) {
      alert(err instanceof Error ? err.message : "Failed")
    }
  }

  function surveyName(name: string | null) {
    if (!name) return "—"
    return surveys.find((s) => s.id === name)?.name ?? name.slice(0, 8) + "…"
  }

  function locationName(id: string | null) {
    if (!id) return "—"
    return locations.find((l) => l.id === id)?.name ?? id.slice(0, 8) + "…"
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
        cmp = surveyName(a.survey_title).localeCompare(surveyName(b.survey_title))
        break
      case "location":
        cmp = locationName(a.location_name).localeCompare(locationName(b.location_name))
        break
      case "status":
        cmp = (a.is_active ? 1 : 0) - (b.is_active ? 1 : 0)
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

  function SortHeader({ colKey, label }: { colKey: QRSortKey; label: string }) {
    const active = sortKey === colKey
    return (
      <th
        className="cursor-pointer select-none px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-zinc-500 hover:text-zinc-600"
        onClick={() => toggleSort(colKey)}
      >
        <span className="inline-flex items-center gap-1">
          {label}
          {active && (sortDir === "asc" ? " ↑" : " ↓")}
        </span>
      </th>
    )
  }

  return (
    <div className="space-y-6">
      {ConfirmDialogRender}
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-zinc-950">
            Distribution
          </h1>
          <p className="mt-1 text-sm text-zinc-500">
            Create and manage QR codes that link to your surveys.
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
          <p className="text-sm text-zinc-500">Loading QR codes…</p>
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
        <Card className="overflow-hidden p-0">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-zinc-100 bg-zinc-50">
                <SortHeader colKey="title" label="Title" />
                <SortHeader colKey="survey" label="Survey" />
                <SortHeader colKey="location" label="Location" />
                <SortHeader colKey="status" label="Status" />
                <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wide text-zinc-500">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody>
              {sortedQRCodes.map((qr) => (
                <tr
                  key={qr.id}
                  className="border-b border-zinc-100 last:border-0 hover:bg-zinc-50"
                >
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-3">
                      {/* Mini QR preview */}
                      <button
                        type="button"
                        onClick={() => setQRPanel(qr)}
                        className="flex-shrink-0 rounded-lg border border-zinc-200 bg-white p-0.5 hover:border-violet-400"
                        title="View & download QR"
                      >
                        <QRCodeCanvas
                          value={qrUrl(qr.title)}
                          size={36}
                          level="M"
                          includeMargin={false}
                        />
                      </button>
                      <div>
                        <span className="font-medium text-zinc-900">{qr.title}</span>
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-zinc-700">{qr.survey_title || "No survey"}</td>
                  <td className="px-4 py-3 text-zinc-600">{qr.location_name || "No location"}</td>
                  <td className="px-4 py-3">
                    <span
                      className={[
                        "inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium",
                        qr.is_active
                          ? "bg-emerald-50 text-emerald-700"
                          : "bg-zinc-100 text-zinc-500",
                      ].join(" ")}
                    >
                      <span
                        className={[
                          "inline-block h-1.5 w-1.5 rounded-full",
                          qr.is_active ? "bg-emerald-500" : "bg-zinc-400",
                        ].join(" ")}
                      />
                      {qr.is_active ? "Active" : "Inactive"}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center justify-end gap-1">
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
                        title="Deactivate"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
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
