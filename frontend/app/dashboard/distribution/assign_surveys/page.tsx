"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import { Pencil, Plus, Save, Trash2 } from "lucide-react"

import { Button } from "@/components/ui/button"
import { useConfirm } from "@/components/ui/ConfirmDialog"
import { DataTable, type DataTableColumn } from "@/components/ui/DataTable"
import { DropdownSelect, SingleSelectDropdown } from "@/components/ui/DropdownSelect"
import { supabase } from "@/lib/supabase/client"
import {
  bulkAssignLocationSurveys,
  deleteLocationSurvey,
  extractErrorMessage,
  fetchLocationSurveys,
  fetchLocations,
  fetchSurveys,
  isStaleObjectError,
  updateLocationSurvey,
  type LocationResponse,
  type LocationSurveyBulkAssignCreate,
  type LocationSurveyResponse,
  type SurveySummary,
} from "@/lib/api/client"

function toDatetimeLocalValue(iso: string | null | undefined) {
  if (!iso) return ""
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return ""
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60_000)
  return local.toISOString().slice(0, 16)
}

function toIsoOrNull(value: string) {
  if (!value.trim()) return null
  return new Date(value).toISOString()
}

function statusBadge(status: LocationSurveyResponse["status"]) {
  const map: Record<LocationSurveyResponse["status"], { label: string; cls: string }> = {
    active: { label: "Active", cls: "bg-emerald-50 text-emerald-700" },
    scheduled: { label: "Scheduled", cls: "bg-sky-50 text-sky-700" },
    inactive: { label: "Inactive", cls: "bg-zinc-100 text-zinc-600" },
    deleted: { label: "Deleted", cls: "bg-red-50 text-red-700" },
  }
  const resolved = map[status]
  return (
    <span className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium ${resolved.cls}`}>
      {resolved.label}
    </span>
  )
}

function CreateAssignmentsModal({
  surveys,
  locations,
  assignments,
  loading,
  error,
  onClose,
  onSave,
}: {
  surveys: SurveySummary[]
  locations: LocationResponse[]
  assignments: LocationSurveyResponse[]
  loading: boolean
  error: string | null
  onClose: () => void
  onSave: (payload: { survey_id: string; location_ids: string[]; start_date: string; end_date: string }) => void
}) {
  const [surveyId, setSurveyId] = useState(surveys[0]?.id ?? "")
  const [locationIds, setLocationIds] = useState<string[]>([])
  const [startDate, setStartDate] = useState(() => toDatetimeLocalValue(new Date().toISOString()))
  const [endDate, setEndDate] = useState("")

  const activeLocations = useMemo(
    () => locations.filter((location) => location.is_active),
    [locations],
  )

  const assignedLocationIds = useMemo(
    () =>
      new Set(
        assignments
          .filter((assignment) => assignment.survey_id === surveyId)
          .map((assignment) => assignment.location_id),
      ),
    [assignments, surveyId],
  )

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
      <div className="w-full max-w-2xl rounded-2xl bg-white p-6 shadow-xl">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="text-base font-semibold text-zinc-900">Create assignment(s)</h2>
            <p className="mt-1 text-sm text-zinc-500">
              Assign a published survey to one or more active locations.
            </p>
          </div>
          <Button variant="ghost" onClick={onClose} disabled={loading}>
            Cancel
          </Button>
        </div>

        <div className="mt-4 grid gap-4 md:grid-cols-3">
          <label className="block">
            <span className="text-sm font-medium text-zinc-700">Survey</span>
            <div className="mt-1">
              <SingleSelectDropdown
                options={surveys.map((survey) => ({ value: survey.id, label: survey.name }))}
                value={surveyId}
                onChange={(next) => {
                  setSurveyId(next)
                  setLocationIds([])
                }}
              />
            </div>
          </label>
          <label className="block">
            <span className="text-sm font-medium text-zinc-700">Start date</span>
            <input
              type="datetime-local"
              className="mt-1 w-full rounded-xl border border-zinc-200 px-3 py-2 text-sm"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
            />
          </label>
          <label className="block">
            <span className="text-sm font-medium text-zinc-700">End date</span>
            <input
              type="datetime-local"
              className="mt-1 w-full rounded-xl border border-zinc-200 px-3 py-2 text-sm"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
            />
          </label>
        </div>

        <label className="mt-4 block">
          <span className="text-sm font-medium text-zinc-700">Locations</span>
          <div className="mt-1">
            <DropdownSelect
              multiple
              value={locationIds}
              onChange={(next) => setLocationIds(next as string[])}
              placeholder="Select locations"
              options={activeLocations.map((location) => ({
                value: location.id,
                label: assignedLocationIds.has(location.id) ? `${location.name} (Assigned)` : location.name,
                disabled: assignedLocationIds.has(location.id),
              }))}
            />
          </div>
        </label>

        {error ? (
          <div className="mt-4 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
            {error}
          </div>
        ) : null}

        <div className="mt-6 flex justify-end gap-2">
          <Button variant="ghost" onClick={onClose} disabled={loading}>
            Close
          </Button>
          <Button
            onClick={() => onSave({ survey_id: surveyId, location_ids: locationIds, start_date: startDate, end_date: endDate })}
            disabled={loading || !surveyId || !startDate || locationIds.length === 0}
          >
            {loading ? "Creating…" : "Create assignment(s)"}
          </Button>
        </div>
      </div>
    </div>
  )
}

function EditAssignmentModal({
  title,
  initial,
  loading,
  error,
  onClose,
  onSave,
}: {
  title: string
  initial: { start_date: string; end_date: string | null; is_active: boolean }
  loading: boolean
  error: string | null
  onClose: () => void
  onSave: (payload: { start_date: string; end_date: string; is_active: boolean }) => void
}) {
  const [startDate, setStartDate] = useState(toDatetimeLocalValue(initial.start_date))
  const [endDate, setEndDate] = useState(toDatetimeLocalValue(initial.end_date))
  const [isActive, setIsActive] = useState(initial.is_active)

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
      <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl">
        <h2 className="text-base font-semibold text-zinc-900">{title}</h2>
        <div className="mt-4 space-y-4">
          <label className="block">
            <span className="text-sm font-medium text-zinc-700">Start date</span>
            <input
              type="datetime-local"
              className="mt-1 w-full rounded-xl border border-zinc-200 px-3 py-2 text-sm"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
            />
          </label>
          <label className="block">
            <span className="text-sm font-medium text-zinc-700">End date</span>
            <input
              type="datetime-local"
              className="mt-1 w-full rounded-xl border border-zinc-200 px-3 py-2 text-sm"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
            />
          </label>
          <label className="flex items-center gap-2 text-sm text-zinc-700">
            <input type="checkbox" checked={isActive} onChange={(e) => setIsActive(e.target.checked)} />
            Assignment active
          </label>
          {error ? (
            <div className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
              {error}
            </div>
          ) : null}
          <div className="flex gap-2">
            <Button variant="ghost" className="flex-1" onClick={onClose} disabled={loading}>
              Cancel
            </Button>
            <Button
              className="flex-1"
              onClick={() => onSave({ start_date: startDate, end_date: endDate, is_active: isActive })}
              disabled={loading || !startDate}
            >
              {loading ? "Saving…" : "Save"}
            </Button>
          </div>
        </div>
      </div>
    </div>
  )
}

export default function AssignSurveysPage() {
  const { confirm, ConfirmDialogRender } = useConfirm()
  const [surveys, setSurveys] = useState<SurveySummary[]>([])
  const [locations, setLocations] = useState<LocationResponse[]>([])
  const [assignments, setAssignments] = useState<LocationSurveyResponse[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const [createModalOpen, setCreateModalOpen] = useState(false)
  const [saving, setSaving] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)

  const [selectedAssignmentIds, setSelectedAssignmentIds] = useState<string[]>([])
  const [editTarget, setEditTarget] = useState<LocationSurveyResponse | null>(null)
  const [bulkEditOpen, setBulkEditOpen] = useState(false)
  const [editError, setEditError] = useState<string | null>(null)
  const [editLoading, setEditLoading] = useState(false)
  const [sortKey, setSortKey] = useState<string>("survey")
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc")

  async function getToken() {
    const {
      data: { session },
    } = await supabase.auth.getSession()
    return session?.access_token ?? null
  }

  const load = useCallback(async () => {
    const token = await getToken()
    if (!token) return
    try {
      const [surveysData, locationsData, assignmentsData] = await Promise.all([
        fetchSurveys(token, { activeOnly: true }),
        fetchLocations(token),
        fetchLocationSurveys(token),
      ])
      setSurveys(surveysData)
      setLocations(locationsData)
      setAssignments(assignmentsData)
    } catch (err) {
      setError(extractErrorMessage(err, "Failed to load survey assignments"))
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    load()
  }, [load])

  async function handleAssign(payload: {
    survey_id: string
    location_ids: string[]
    start_date: string
    end_date: string
  }) {
    const token = await getToken()
    if (!token) return
    setSaving(true)
    setFormError(null)
    try {
      const requestPayload: LocationSurveyBulkAssignCreate = {
        survey_id: payload.survey_id,
        location_ids: payload.location_ids,
        start_date: new Date(payload.start_date).toISOString(),
        end_date: toIsoOrNull(payload.end_date),
      }
      const created = await bulkAssignLocationSurveys(token, requestPayload)
      setAssignments((current) => [...created, ...current])
      setCreateModalOpen(false)
    } catch (err) {
      setFormError(extractErrorMessage(err, "Failed to assign survey"))
    } finally {
      setSaving(false)
    }
  }

  async function saveAssignments(ids: string[], payload: { start_date: string; end_date: string; is_active: boolean }) {
    const token = await getToken()
    if (!token) return
    setEditLoading(true)
    setEditError(null)
    try {
      const updatedRows = await Promise.all(
        ids.map((id) => {
          const current = assignments.find((a) => a.id === id)
          return updateLocationSurvey(token, id, {
            is_active: payload.is_active,
            start_date: new Date(payload.start_date).toISOString(),
            end_date: toIsoOrNull(payload.end_date),
            updated_at: current?.updated_at ?? "",
          })
        }),
      )
      setAssignments((current) =>
        current.map((assignment) => {
          const updated = updatedRows.find((row) => row.id === assignment.id)
          return updated ?? assignment
        }),
      )
      setEditTarget(null)
      setBulkEditOpen(false)
      setSelectedAssignmentIds([])
    } catch (err) {
      if (isStaleObjectError(err)) {
        setEditError("One or more assignments were updated. Please refresh.")
      } else {
        setEditError(extractErrorMessage(err, "Failed to update assignment"))
      }
    } finally {
      setEditLoading(false)
    }
  }

  async function handleDeleteAssignment(assignment: LocationSurveyResponse) {
    const ok = await confirm({
      title: "Delete assignment",
      message: `Delete the assignment for ${assignment.location_name}? Existing QR codes linked to it may stop working.`,
      confirmLabel: "Delete",
      variant: "danger",
    })
    if (!ok) return
    const token = await getToken()
    if (!token) return
    try {
      await deleteLocationSurvey(token, assignment.id, assignment.updated_at)
      setAssignments((current) => current.filter((item) => item.id !== assignment.id))
      setSelectedAssignmentIds((current) => current.filter((id) => id !== assignment.id))
    } catch (err) {
      if (isStaleObjectError(err)) {
        setError("This assignment was updated. Please refresh.")
      } else {
        setError(extractErrorMessage(err, "Failed to delete assignment"))
      }
    }
  }

  const sortedAssignments = useMemo(() => {
    const rows = [...assignments]
    rows.sort((a, b) => {
      let cmp = 0
      if (sortKey === "survey") cmp = a.survey_name.localeCompare(b.survey_name)
      else if (sortKey === "location") cmp = a.location_name.localeCompare(b.location_name)
      else if (sortKey === "status") cmp = a.status.localeCompare(b.status)
      else if (sortKey === "start") cmp = new Date(a.start_date).getTime() - new Date(b.start_date).getTime()
      else if (sortKey === "end") cmp = (new Date(a.end_date ?? 0).getTime()) - (new Date(b.end_date ?? 0).getTime())
      return sortDir === "asc" ? cmp : -cmp
    })
    return rows
  }, [assignments, sortDir, sortKey])

  const columns: DataTableColumn<LocationSurveyResponse>[] = [
    {
      key: "select",
      label: (
        <input
          type="checkbox"
          className="h-4 w-4 accent-violet-600"
          checked={assignments.length > 0 && selectedAssignmentIds.length === assignments.length}
          onChange={(event) =>
            setSelectedAssignmentIds(event.target.checked ? assignments.map((assignment) => assignment.id) : [])
          }
        />
      ),
      sortable: false,
      align: "left",
      headerClassName: "w-12",
      render: (assignment) => (
        <input
          type="checkbox"
          className="h-4 w-4 accent-violet-600"
          checked={selectedAssignmentIds.includes(assignment.id)}
          onChange={() =>
            setSelectedAssignmentIds((current) =>
              current.includes(assignment.id)
                ? current.filter((id) => id !== assignment.id)
                : [...current, assignment.id],
            )
          }
        />
      ),
    },
    {
      key: "survey",
      label: "Survey",
      sortable: true,
      align: "left",
      render: (assignment) => <span className="font-medium text-zinc-900">{assignment.survey_name}</span>,
    },
    {
      key: "location",
      label: "Location",
      sortable: true,
      align: "left",
      render: (assignment) => assignment.location_name,
    },
    {
      key: "status",
      label: "Status",
      sortable: true,
      align: "left",
      render: (assignment) => statusBadge(assignment.status),
    },
    {
      key: "start",
      label: "Start",
      sortable: true,
      align: "left",
      render: (assignment) => (
        <span className="text-zinc-600">{new Date(assignment.start_date).toLocaleString()}</span>
      ),
    },
    {
      key: "end",
      label: "End",
      sortable: true,
      align: "left",
      render: (assignment) => (
        <span className="text-zinc-600">
          {assignment.end_date ? new Date(assignment.end_date).toLocaleString() : "-"}
        </span>
      ),
    },
    {
      key: "actions",
      label: "Actions",
      sortable: false,
      align: "right",
      render: (assignment) => (
        <div className="flex items-center justify-end gap-1">
          <button
            type="button"
            onClick={() => {
              setEditError(null)
              setEditTarget(assignment)
            }}
            className="rounded-lg p-1.5 text-zinc-400 hover:bg-zinc-100 hover:text-zinc-700"
          >
            <Pencil className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={() => void handleDeleteAssignment(assignment)}
            className="rounded-lg p-1.5 text-zinc-400 hover:bg-red-50 hover:text-red-600"
          >
            <Trash2 className="h-4 w-4" />
          </button>
        </div>
      ),
    },
  ]

  return (
    <div className="space-y-6">
      {ConfirmDialogRender}
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-zinc-950">Assign Surveys</h1>
          <p className="mt-1 text-sm text-zinc-500">
            Manage active survey assignments across your locations.
          </p>
        </div>
        <div className="flex gap-2">
          <Button onClick={() => {
            setFormError(null)
            setCreateModalOpen(true)
          }}>
            <Plus className="mr-1.5 h-4 w-4" />
            Create assignment(s)
          </Button>
          <Button
            variant="ghost"
            onClick={() => setBulkEditOpen(true)}
            disabled={selectedAssignmentIds.length === 0}
          >
            <Save className="mr-1.5 h-4 w-4" />
            Bulk edit selected
          </Button>
        </div>
      </div>

      {error ? (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      ) : null}

      <DataTable<LocationSurveyResponse>
        data={sortedAssignments}
        columns={columns}
        getRowKey={(assignment) => assignment.id}
        sortKey={sortKey}
        sortDir={sortDir}
        loading={loading}
        emptyMessage="No assignments yet."
        onSort={(key) => {
          setSortKey(key)
          setSortDir((current) => (sortKey === key && current === "asc" ? "desc" : "asc"))
        }}
      />

      {createModalOpen ? (
        <CreateAssignmentsModal
          surveys={surveys}
          locations={locations}
          assignments={assignments}
          loading={saving}
          error={formError}
          onClose={() => setCreateModalOpen(false)}
          onSave={(payload) => void handleAssign(payload)}
        />
      ) : null}

      {editTarget ? (
        <EditAssignmentModal
          title={`Edit assignment for ${editTarget.location_name}`}
          initial={editTarget}
          loading={editLoading}
          error={editError}
          onClose={() => setEditTarget(null)}
          onSave={(payload) => saveAssignments([editTarget.id], payload)}
        />
      ) : null}

      {bulkEditOpen && selectedAssignmentIds.length > 0 ? (
        <EditAssignmentModal
          title={`Bulk edit ${selectedAssignmentIds.length} assignments`}
          initial={{
            start_date: assignments.find((assignment) => assignment.id === selectedAssignmentIds[0])?.start_date ?? new Date().toISOString(),
            end_date: assignments.find((assignment) => assignment.id === selectedAssignmentIds[0])?.end_date ?? null,
            is_active: true,
          }}
          loading={editLoading}
          error={editError}
          onClose={() => setBulkEditOpen(false)}
          onSave={(payload) => saveAssignments(selectedAssignmentIds, payload)}
        />
      ) : null}
    </div>
  )
}
