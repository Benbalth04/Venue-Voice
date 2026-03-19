"use client"

import { useEffect, useState } from "react"
import { MapPin, Pencil, Plus, ToggleLeft, ToggleRight, X } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { DataTable, type DataTableColumn } from "@/components/ui/DataTable"
import { supabase } from "@/lib/supabase/client"
import {
  createLocation,
  fetchLocations,
  updateLocation,
  extractErrorMessage,
  type LocationCreate,
  type LocationResponse,
} from "@/lib/api/client"

// ─── Modal ────────────────────────────────────────────────────────────────────

interface LocationFormData {
  name: string
  state: string
  country: string
  google_business_url: string
}

const emptyForm = (): LocationFormData => ({
  name: "",
  state: "",
  country: "",
  google_business_url: "",
})

function LocationModal({
  initial,
  onSave,
  onClose,
  loading,
  error,
}: {
  initial?: LocationResponse | null
  onSave: (data: LocationFormData) => void
  onClose: () => void
  loading: boolean
  error: string | null
}) {
  const [form, setForm] = useState<LocationFormData>(
    initial
      ? {
          name: initial.name,
          state: initial.state ?? "",
          country: initial.country ?? "",
          google_business_url: initial.google_business_url ?? "",
        }
      : emptyForm(),
  )

  function set(field: keyof LocationFormData, value: string) {
    setForm((f) => ({ ...f, [field]: value }))
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
      <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-base font-semibold text-zinc-900">
            {initial ? "Edit Location" : "Add Location"}
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
              Name <span className="text-red-500">*</span>
            </span>
            <input
              className="mt-1 w-full rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-violet-500"
              placeholder="e.g. Main Cafe"
              value={form.name}
              onChange={(e) => set("name", e.target.value)}
            />
          </label>

          <div className="grid grid-cols-2 gap-3">
            <label className="block">
              <span className="text-sm font-medium text-zinc-700">State</span>
              <input
                className="mt-1 w-full rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-violet-500"
                placeholder="e.g. NSW"
                value={form.state}
                onChange={(e) => set("state", e.target.value)}
              />
            </label>
            <label className="block">
              <span className="text-sm font-medium text-zinc-700">Country</span>
              <input
                className="mt-1 w-full rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-violet-500"
                placeholder="e.g. AU"
                value={form.country}
                onChange={(e) => set("country", e.target.value)}
              />
            </label>
          </div>

          <label className="block">
            <span className="text-sm font-medium text-zinc-700">Google Business URL</span>
            <input
              className="mt-1 w-full rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-violet-500"
              placeholder="https://maps.google.com/..."
              value={form.google_business_url}
              onChange={(e) => set("google_business_url", e.target.value)}
            />
          </label>

          {error && (
            <div className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
              {error}
            </div>
          )}

          <div className="flex gap-2 pt-1">
            <Button
              variant="ghost"
              className="flex-1"
              onClick={onClose}
              disabled={loading}
            >
              Cancel
            </Button>
            <Button
              className="flex-1"
              onClick={() => onSave(form)}
              disabled={loading || !form.name.trim()}
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

export default function LocationsPage() {
  const [locations, setLocations] = useState<LocationResponse[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const [modalOpen, setModalOpen] = useState(false)
  const [editTarget, setEditTarget] = useState<LocationResponse | null>(null)
  const [formError, setFormError] = useState<string | null>(null)
  const [formLoading, setFormLoading] = useState(false)

  const [sortKey, setSortKey] = useState<string>("name")
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc")

  async function getToken() {
    const { data: { session } } = await supabase.auth.getSession()
    return session?.access_token ?? null
  }

  async function load() {
    const token = await getToken()
    if (!token) return
    try {
      const data = await fetchLocations(token)
      setLocations(data)
    } catch (err) {
      setError(extractErrorMessage(err, "Failed to load locations"))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [])

  function openCreate() {
    setEditTarget(null)
    setFormError(null)
    setModalOpen(true)
  }

  function openEdit(loc: LocationResponse) {
    setEditTarget(loc)
    setFormError(null)
    setModalOpen(true)
  }

  async function handleSave(form: LocationFormData) {
    const token = await getToken()
    if (!token) return
    setFormLoading(true)
    setFormError(null)
    try {
      const payload: LocationCreate = {
        name: form.name.trim(),
        state: form.state.trim() || null,
        country: form.country.trim() || null,
        google_business_url: form.google_business_url.trim() || null,
      }
      if (editTarget) {
        const updated = await updateLocation(token, editTarget.id, payload)
        setLocations((prev) => prev.map((l) => (l.id === updated.id ? updated : l)))
        setModalOpen(false)
      } else {
        const created = await createLocation(token, payload)
        setLocations((prev) => [created, ...prev])
        setModalOpen(false)
      }
    } catch (err) {
      const msg = extractErrorMessage(err, "Something went wrong")
      if (msg.toLowerCase().includes("not found") || msg.includes("404")) {
        setModalOpen(false)
        await load()
        setError("Location no longer exists. Data has been refreshed.")
        setTimeout(() => setError(null), 1000)
      } else {
        setFormError(msg)
      }
    } finally {
      setFormLoading(false)
    }
  }

  async function handleToggleActive(loc: LocationResponse) {
    const token = await getToken()
    if (!token) return
    try {
      const updated = await updateLocation(token, loc.id, { is_active: !loc.is_active })
      setLocations((prev) => prev.map((l) => (l.id === updated.id ? updated : l)))
    } catch (err) {
      const msg = extractErrorMessage(err, "Something went wrong")
      if (msg.toLowerCase().includes("not found") || msg.includes("404")) {
        await load()
        setError("Location no longer exists. Data has been refreshed.")
        setTimeout(() => setError(null), 4000)
      } else {
        setError(msg)
      }
    }
  }

  function regionLabel(loc: LocationResponse) {
    const parts = [loc.state, loc.country].filter(Boolean)
    return parts.length > 0 ? parts.join(", ") : "—"
  }

  const sortedLocations = [...locations].sort((a, b) => {
    let cmp = 0
    if (sortKey === "name") cmp = a.name.localeCompare(b.name)
    else if (sortKey === "region") cmp = regionLabel(a).localeCompare(regionLabel(b))
    else if (sortKey === "status") cmp = (a.is_active ? 1 : 0) - (b.is_active ? 1 : 0)
    return sortDir === "asc" ? cmp : -cmp
  })

  const columns: DataTableColumn<LocationResponse>[] = [
    {
      key: "name",
      label: "Name",
      sortable: true,
      align: "center",
      render: (loc) => (
        <div className="flex flex-col gap-0.5">
          <div className="flex items-center gap-2">
            <MapPin className="h-3.5 w-3.5 shrink-0 text-zinc-400" />
            <span className="font-medium text-zinc-900">{loc.name}</span>
          </div>
          {loc.google_business_url && (
            <a
              href={loc.google_business_url}
              target="_blank"
              rel="noopener noreferrer"
              className="text-xs text-violet-600 hover:underline"
            >
              Google Business Page ↗
            </a>
          )}
        </div>
      ),
    },
    {
      key: "region",
      label: "Region",
      sortable: true,
      align: "center",
      render: (loc) => <span className="text-zinc-600">{regionLabel(loc)}</span>,
    },
    {
      key: "status",
      label: "Status",
      sortable: true,
      align: "center",
      render: (loc) => (
        <span
          className={[
            "inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium",
            loc.is_active ? "bg-emerald-50 text-emerald-700" : "bg-zinc-100 text-zinc-500",
          ].join(" ")}
        >
          <span
            className={[
              "inline-block h-1.5 w-1.5 rounded-full",
              loc.is_active ? "bg-emerald-500" : "bg-zinc-400",
            ].join(" ")}
          />
          {loc.is_active ? "Active" : "Inactive"}
        </span>
      ),
    },
    {
      key: "actions",
      label: "Actions",
      sortable: false,
      align: "center",
      render: (loc) => (
        <div className="flex items-center justify-end gap-1">
          <button
            type="button"
            onClick={() => openEdit(loc)}
            className="rounded-lg p-1.5 text-zinc-400 hover:bg-zinc-100 hover:text-zinc-700"
            title="Edit"
          >
            <Pencil className="h-3.5 w-3.5" />
          </button>
          <button
            type="button"
            onClick={() => handleToggleActive(loc)}
            className="rounded-lg p-1.5 text-zinc-400 hover:bg-zinc-100 hover:text-zinc-700"
            title={loc.is_active ? "Deactivate" : "Activate"}
          >
            {loc.is_active ? (
              <ToggleRight className="h-3.5 w-3.5 text-emerald-500" />
            ) : (
              <ToggleLeft className="h-3.5 w-3.5" />
            )}
          </button>
        </div>
      ),
    },
  ]

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-zinc-950">Locations</h1>
          <p className="mt-1 text-sm text-zinc-500">
            Manage your physical business locations.
          </p>
        </div>
        <Button onClick={openCreate}>
          <Plus className="mr-1.5 h-4 w-4" />
          Add Location
        </Button>
      </div>

      {/* Content */}
      {loading ? (
        <div className="flex min-h-[200px] items-center justify-center">
          <p className="text-sm text-zinc-500">Loading locations…</p>
        </div>
      ) : error ? (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      ) : locations.length === 0 ? (
        <Card className="flex flex-col items-center gap-3 py-16">
          <MapPin className="h-8 w-8 text-zinc-300" />
          <p className="text-sm font-medium text-zinc-500">No locations yet</p>
          <Button variant="ghost" onClick={openCreate}>
            Add your first location
          </Button>
        </Card>
      ) : (
        <DataTable<LocationResponse>
          data={sortedLocations}
          columns={columns}
          getRowKey={(loc) => loc.id}
          sortKey={sortKey}
          sortDir={sortDir}
          onSort={(key) => {
            setSortKey(key)
            setSortDir((d) => (sortKey === key && d === "asc" ? "desc" : "asc"))
          }}
        />
      )}

      {/* Modal */}
      {modalOpen && (
        <LocationModal
          initial={editTarget}
          onSave={handleSave}
          onClose={() => setModalOpen(false)}
          loading={formLoading}
          error={formError}
        />
      )}
    </div>
  )
}
