"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { MapPin, Pencil, Plus, ToggleLeft, ToggleRight, X } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { DropdownSelect } from "@/components/ui/DropdownSelect"
import { DataTable, type DataTableColumn } from "@/components/ui/DataTable"
import { LoadingBlock } from "@/components/ui/LoadingSpinner"
import { useConfirm } from "@/components/ui/ConfirmDialog"
import { useQRSubmissionBlocked } from "@/components/layout/QRSubmissionBlockedContext"
import { supabase } from "@/lib/supabase/client"
import {
  createLocation,
  fetchLocations,
  fetchNotificationGroups,
  getLocationFlowDependencies,
  isNormalizedError,
  isStaleObjectError,
  syncLocationNotificationGroups,
  updateLocation,
  extractErrorMessage,
  type LocationCreate,
  type LocationResponse,
  type LocationUpdate,
  type NotificationGroupResponse,
} from "@/lib/api/client"

/** Shown when PATCH is_active would exceed plan max **active** locations (backend: LIMIT_EXCEEDED / resource locations). */
const ACTIVE_LOCATION_PLAN_LIMIT_MESSAGE =
  "You've reached the maximum number of active locations for your plan. Deactivate another location first, or upgrade your subscription."

function formatLocationActivationError(err: unknown): string {
  if (
    isNormalizedError(err) &&
    err.code === "LIMIT_EXCEEDED" &&
    err.details?.resource === "locations"
  ) {
    return ACTIVE_LOCATION_PLAN_LIMIT_MESSAGE
  }
  return extractErrorMessage(err, "Something went wrong")
}

// ─── Modal ────────────────────────────────────────────────────────────────────

interface LocationFormData {
  name: string
  state: string
  country: string
  google_business_url: string
  notification_group_ids: string[]
}

const emptyForm = (): LocationFormData => ({
  name: "",
  state: "",
  country: "",
  google_business_url: "",
  notification_group_ids: [],
})

function LocationModal({
  initial,
  onSave,
  onClose,
  loading,
  error,
  notificationGroups,
  selectedNotificationGroupIds,
}: {
  initial?: LocationResponse | null
  onSave: (data: LocationFormData) => void
  onClose: () => void
  loading: boolean
  error: string | null
  notificationGroups: NotificationGroupResponse[]
  selectedNotificationGroupIds: string[]
}) {
  const [form, setForm] = useState<LocationFormData>(
    initial
      ? {
          name: initial.name,
          state: initial.state ?? "",
          country: initial.country ?? "",
          google_business_url: initial.google_business_url ?? "",
          notification_group_ids: selectedNotificationGroupIds,
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

          {initial ? (
            <label className="block">
              <span className="text-sm font-medium text-zinc-700">Notification Groups</span>
              <div className="mt-1">
                <DropdownSelect
                  multiple
                  options={notificationGroups.map((group) => ({ value: group.id, label: group.name }))}
                  value={form.notification_group_ids}
                  onChange={(next) => setForm((current) => ({ ...current, notification_group_ids: next as string[] }))}
                  placeholder="Assign notification groups"
                />
              </div>
            </label>
          ) : null}

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
  const { confirm, ConfirmDialogRender } = useConfirm()
  const { refreshSubmissionBlockedQrCount } = useQRSubmissionBlocked()
  const [locations, setLocations] = useState<LocationResponse[]>([])
  const [notificationGroups, setNotificationGroups] = useState<NotificationGroupResponse[]>([])
  const [loading, setLoading] = useState(true)
  /** Set only from initial load failure — replaces main content until refresh/reload. */
  const [error, setError] = useState<string | null>(null)
  /** Inline banner for toggle/save failures; does not hide the locations table. */
  const [pageBanner, setPageBanner] = useState<string | null>(null)
  const pageBannerTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const showTransientPageBanner = useCallback((message: string, durationMs = 5000) => {
    if (pageBannerTimeoutRef.current) {
      clearTimeout(pageBannerTimeoutRef.current)
      pageBannerTimeoutRef.current = null
    }
    setPageBanner(message)
    pageBannerTimeoutRef.current = setTimeout(() => {
      setPageBanner(null)
      pageBannerTimeoutRef.current = null
    }, durationMs)
  }, [])

  useEffect(() => {
    return () => {
      if (pageBannerTimeoutRef.current) {
        clearTimeout(pageBannerTimeoutRef.current)
      }
    }
  }, [])

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

  const load = useCallback(async () => {
    const token = await getToken()
    if (!token) return
    try {
      const [locationRows, notificationGroupRows] = await Promise.all([
        fetchLocations(token),
        fetchNotificationGroups(token),
      ])
      setLocations(locationRows)
      setNotificationGroups(notificationGroupRows)
    } catch (err) {
      setError(extractErrorMessage(err, "Failed to load locations"))
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
      const basePayload: LocationCreate = {
        name: form.name.trim(),
        state: form.state.trim() || null,
        country: form.country.trim() || null,
        google_business_url: form.google_business_url.trim() || null,
      }
      if (editTarget) {
        const isRemovingGBUrl = !!editTarget.google_business_url && !form.google_business_url.trim()
        const currentGroupIds = notificationGroups
          .filter((g) => g.location_ids.includes(editTarget.id))
          .map((g) => g.id)
        const isRemovingAllGroups = currentGroupIds.length > 0 && form.notification_group_ids.length === 0

        if (isRemovingGBUrl || isRemovingAllGroups) {
          const deps = await getLocationFlowDependencies(token, editTarget.id)

          if (isRemovingGBUrl && deps.google_business_url_flows.length > 0) {
            await confirm({
              title: "Cannot remove Google Business URL",
              message: `This URL is required by the following flows:\n${deps.google_business_url_flows.map((f) => `- ${f.name}`).join("\n")}`,
              confirmLabel: "OK",
            })
            return
          }

          if (isRemovingAllGroups && deps.notification_group_flows.length > 0) {
            await confirm({
              title: "Cannot remove notification groups",
              message: `Notification groups are required by the following flows:\n${deps.notification_group_flows.map((f) => `- ${f.name}`).join("\n")}`,
              confirmLabel: "OK",
            })
            return
          }
        }

        const payload: LocationUpdate = { ...basePayload, updated_at: editTarget.updated_at }
        const updated = await updateLocation(token, editTarget.id, payload)
        await syncLocationNotificationGroups(token, editTarget.id, form.notification_group_ids)
        setLocations((prev) => prev.map((l) => (l.id === updated.id ? updated : l)))
        setNotificationGroups(await fetchNotificationGroups(token))
        setModalOpen(false)
      } else {
        const created = await createLocation(token, basePayload)
        await syncLocationNotificationGroups(token, created.id, form.notification_group_ids)
        setLocations((prev) => [created, ...prev])
        setNotificationGroups(await fetchNotificationGroups(token))
        setModalOpen(false)
      }
    } catch (err) {
      if (isStaleObjectError(err)) {
        setModalOpen(false)
        await load()
        setFormError("This location was updated. Please try again.")
      } else {
        const msg = extractErrorMessage(err, "Something went wrong")
        if (msg.toLowerCase().includes("not found") || msg.includes("404")) {
          setModalOpen(false)
          await load()
          showTransientPageBanner("Location no longer exists. Data has been refreshed.")
        } else {
          setFormError(msg)
        }
      }
    } finally {
      setFormLoading(false)
    }
  }

  async function handleToggleActive(loc: LocationResponse) {
    if (loc.is_active) {
      const ok = await confirm({
        title: "Deactivate location",
        message: "This will deactivate all associated QR codes. Continue?",
        confirmLabel: "Deactivate",
        cancelLabel: "Cancel",
        variant: "danger",
      })
      if (!ok) return
    }
    const token = await getToken()
    if (!token) return
    try {
      const updated = await updateLocation(token, loc.id, { is_active: !loc.is_active, updated_at: loc.updated_at })
      setLocations((prev) => prev.map((l) => (l.id === updated.id ? updated : l)))
      void refreshSubmissionBlockedQrCount()
    } catch (err) {
      if (isStaleObjectError(err)) {
        await load()
        showTransientPageBanner("This location was updated. Please try again.")
      } else {
        const msg = formatLocationActivationError(err)
        if (msg.toLowerCase().includes("not found") || msg.includes("404")) {
          await load()
          showTransientPageBanner("Location no longer exists. Data has been refreshed.")
        } else {
          showTransientPageBanner(msg)
        }
      }
    }
  }

  function regionLabel(loc: LocationResponse) {
    const parts = [loc.state, loc.country].filter(Boolean)
    return parts.length > 0 ? parts.join(", ") : "—"
  }

  function notificationGroupNames(locationId: string) {
    return notificationGroups
      .filter((group) => group.location_ids.includes(locationId))
      .map((group) => group.name)
      .sort((a, b) => a.localeCompare(b))
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
      key: "notification_groups",
      label: "Notification Groups",
      sortable: false,
      align: "center",
      render: (loc) => {
        const names = notificationGroupNames(loc.id)
        if (names.length === 0) return <span className="text-zinc-400">—</span>
        if (names.length > 3) return <span className="text-zinc-600">{`Assigned to ${names.length} groups`}</span>
        return <span className="text-zinc-600">{names.join(", ")}</span>
      },
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
      {ConfirmDialogRender}
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-zinc-950">Locations</h1>
          <p className="mt-1 text-sm text-zinc-500">
            Manage your physical business locations. New locations start inactive; your plan limits how many can be active at once.
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
          <LoadingBlock message="Loading locations…" />
        </div>
      ) : error ? (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      ) : (
        <div className="space-y-4">
          {pageBanner ? (
            <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
              {pageBanner}
            </div>
          ) : null}
          {locations.length === 0 ? (
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
        </div>
      )}

      {/* Modal */}
      {modalOpen && (
        <LocationModal
          initial={editTarget}
          onSave={handleSave}
          onClose={() => setModalOpen(false)}
          loading={formLoading}
          error={formError}
          notificationGroups={notificationGroups}
          selectedNotificationGroupIds={editTarget ? notificationGroups.filter((group) => group.location_ids.includes(editTarget.id)).map((group) => group.id) : []}
        />
      )}
    </div>
  )
}
