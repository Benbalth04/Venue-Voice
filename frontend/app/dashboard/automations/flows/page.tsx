"use client"

import { useRouter } from "next/navigation"
import { useEffect, useMemo, useState } from "react"
import { ArrowRight, Loader2, Pencil, Plus, Save, ToggleLeft, ToggleRight, Trash2, X } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { useConfirm } from "@/components/ui/ConfirmDialog"
import { SingleSelectDropdown } from "@/components/ui/DropdownSelect"
import { supabase } from "@/lib/supabase/client"
import {
  deleteSurveyFlow,
  extractErrorMessage,
  fetchFlowRuns,
  fetchFlows,
  fetchSurveys,
  updateSurveyFlow,
  type FlowPayload,
  type FlowResponse,
  type FlowRunResponse,
  type SurveySummary,
} from "@/lib/api/client"

function truncateDescription(value: string | null, maxLength = 120) {
  if (!value?.trim()) return ""
  if (value.length <= maxLength) return value
  return `${value.slice(0, maxLength).trimEnd()}...`
}

function plural(n: number, singular: string, pluralForm?: string) {
  return `${n} ${n === 1 ? singular : (pluralForm ?? `${singular}s`)}`
}

function flowCounts(flow: FlowResponse) {
  return {
    rules: flow.nodes.filter((node) => node.node_type === "rule").length,
    actions: flow.nodes.filter((node) => node.node_type === "action").length,
    branches: flow.nodes.filter((node) => node.node_type === "branch").length,
  }
}

function flowToPayload(flow: FlowResponse, isActive: boolean): FlowPayload {
  return {
    name: flow.name,
    description: flow.description,
    is_active: isActive,
    location_survey_ids: flow.location_survey_ids,
    nodes: flow.nodes.map((node) => ({
      id: node.id,
      parent_id: node.parent_id,
      node_type: node.node_type,
      rule_id: node.rule_id,
      branch_type: node.branch_type,
      action_type: node.action_type,
      config: node.config,
      position: node.position,
    })),
  }
}

function CreateFlowModal({
  open,
  surveys,
  existingFlows,
  onClose,
  onCreate,
}: {
  open: boolean
  surveys: SurveySummary[]
  existingFlows: FlowResponse[]
  onClose: () => void
  onCreate: (payload: { name: string; surveyId: string }) => void
}) {
  const [name, setName] = useState("")
  const [surveyId, setSurveyId] = useState(surveys[0]?.id ?? "")
  const [error, setError] = useState<string | null>(null)

  const duplicateName = useMemo(() => {
    const normalized = name.trim().toLowerCase()
    if (!normalized) return false
    return existingFlows.some((flow) => flow.name.trim().toLowerCase() === normalized)
  }, [existingFlows, name])

  if (!open) return null

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 p-4" onClick={onClose}>
      <div
        className="w-full max-w-lg rounded-3xl bg-white p-6 shadow-xl"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="text-xl font-semibold text-zinc-950">Create flow</h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-xl p-2 text-zinc-400 transition hover:bg-zinc-100 hover:text-zinc-700"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="mt-6 space-y-4">
          <label className="block">
            <span className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Flow name</span>
            <input
              className="mt-1 w-full rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-violet-500"
              value={name}
              onChange={(event) => {
                setName(event.target.value)
                setError(null)
              }}
              placeholder="Redirect happy customers to Google"
            />
          </label>

          <label className="block">
            <span className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Survey</span>
            <div className="mt-1">
              <SingleSelectDropdown
                options={surveys.map((survey) => ({ value: survey.id, label: survey.name }))}
                value={surveyId}
                onChange={(nextValue) => {
                  setSurveyId(nextValue)
                  setError(null)
                }}
              />
            </div>
          </label>

          {duplicateName ? (
            <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
              A flow with that name already exists for this company.
            </div>
          ) : null}

          {error ? (
            <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
              {error}
            </div>
          ) : null}
        </div>

        <div className="mt-6 flex justify-end gap-2">
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button
            onClick={() => {
              const normalizedName = name.trim()
              if (!normalizedName) {
                setError("Flow name is required.")
                return
              }
              if (!surveyId) {
                setError("Choose a survey for this flow.")
                return
              }
              if (duplicateName) {
                setError("A flow with that name already exists for this company.")
                return
              }
              onCreate({ name: normalizedName, surveyId })
            }}
          >
            Continue
          </Button>
        </div>
      </div>
    </div>
  )
}

function EditFlowModal({
  flow,
  existingFlows,
  saving,
  onClose,
  onSave,
  onEditFlow,
}: {
  flow: FlowResponse
  existingFlows: FlowResponse[]
  saving: boolean
  onClose: () => void
  onSave: (name: string, description: string) => void
  onEditFlow: () => void
}) {
  const [name, setName] = useState(flow.name)
  const [description, setDescription] = useState(flow.description ?? "")
  const [error, setError] = useState<string | null>(null)

  const duplicateName = useMemo(() => {
    const normalized = name.trim().toLowerCase()
    if (!normalized || normalized === flow.name.trim().toLowerCase()) return false
    return existingFlows.some((f) => f.id !== flow.id && f.name.trim().toLowerCase() === normalized)
  }, [existingFlows, flow, name])

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 p-4" onClick={onClose}>
      <div
        className="w-full max-w-lg rounded-3xl bg-white p-6 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="text-xl font-semibold text-zinc-950">Edit flow</h2>
            <p className="mt-1 text-sm text-zinc-500">Update the name or description for this flow.</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-xl p-2 text-zinc-400 transition hover:bg-zinc-100 hover:text-zinc-700"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="mt-6 space-y-4">
          <label className="block">
            <span className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Flow name</span>
            <input
              className="mt-1 w-full rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-violet-500"
              value={name}
              onChange={(e) => { setName(e.target.value); setError(null) }}
            />
          </label>

          <label className="block">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Description</span>
              <span className="text-xs text-zinc-400">{description.length}/240</span>
            </div>
            <textarea
              rows={3}
              maxLength={240}
              className="mt-1 w-full rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-violet-500"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
          </label>

          {duplicateName ? (
            <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
              A flow with that name already exists for this company.
            </div>
          ) : null}
          {error ? (
            <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
              {error}
            </div>
          ) : null}
        </div>

        <div className="mt-6 flex items-center justify-between gap-2">
          <Button variant="outline" onClick={onEditFlow}>
            <ArrowRight className="mr-1.5 h-4 w-4" />
            Edit flow actions
          </Button>
          <div className="flex gap-2">
            <Button variant="outline" onClick={onClose}>Cancel</Button>
            <Button
              disabled={saving || duplicateName}
              onClick={() => {
                const trimmed = name.trim()
                if (!trimmed) { setError("Flow name is required."); return }
                if (duplicateName) { setError("A flow with that name already exists."); return }
                onSave(trimmed, description.trim())
              }}
            >
              {saving ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <Save className="mr-1.5 h-4 w-4" />}
              Save
            </Button>
          </div>
        </div>
      </div>
    </div>
  )
}

export default function FlowsPage() {
  const router = useRouter()
  const { confirm, ConfirmDialogRender } = useConfirm()
  const [surveys, setSurveys] = useState<SurveySummary[]>([])
  const [flows, setFlows] = useState<FlowResponse[]>([])
  const [flowRuns, setFlowRuns] = useState<FlowRunResponse[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [createOpen, setCreateOpen] = useState(false)
  const [editFlow, setEditFlow] = useState<FlowResponse | null>(null)
  const [editSaving, setEditSaving] = useState(false)

  async function getToken() {
    const {
      data: { session },
    } = await supabase.auth.getSession()
    return session?.access_token ?? null
  }

  useEffect(() => {
    async function load() {
      const token = await getToken()
      if (!token) return
      try {
        const [surveyRows, flowRows, flowRunRows] = await Promise.all([
          fetchSurveys(token),
          fetchFlows(token),
          fetchFlowRuns(token),
        ])
        setSurveys(surveyRows)
        setFlows(flowRows)
        setFlowRuns(flowRunRows)
      } catch (err) {
        setError(extractErrorMessage(err, "Failed to load flows"))
      } finally {
        setLoading(false)
      }
    }
    void load()
  }, [])

  async function saveFlowEdits(name: string, description: string) {
    if (!editFlow) return
    const token = await getToken()
    if (!token) return
    setEditSaving(true)
    try {
      const updated = await updateSurveyFlow(
        token,
        editFlow.survey_id,
        editFlow.id,
        { ...flowToPayload(editFlow, editFlow.is_active), name, description: description || null },
      )
      setFlows((current) => current.map((f) => (f.id === updated.id ? updated : f)))
      setEditFlow(null)
    } catch (err) {
      setError(extractErrorMessage(err, "Failed to update flow"))
    } finally {
      setEditSaving(false)
    }
  }

  async function toggleFlow(flow: FlowResponse) {
    const token = await getToken()
    if (!token) return
    try {
      const updated = await updateSurveyFlow(token, flow.survey_id, flow.id, flowToPayload(flow, !flow.is_active))
      setFlows((current) => current.map((item) => (item.id === updated.id ? updated : item)))
    } catch (err) {
      setError(extractErrorMessage(err, "Failed to update flow"))
    }
  }

  async function deleteFlow(flow: FlowResponse) {
    const ok = await confirm({
      title: "Delete flow",
      message: `Delete "${flow.name}"?`,
      confirmLabel: "Delete",
      variant: "danger",
    })
    if (!ok) return
    const token = await getToken()
    if (!token) return
    try {
      await deleteSurveyFlow(token, flow.survey_id, flow.id)
      setFlows((current) => current.filter((item) => item.id !== flow.id))
    } catch (err) {
      setError(extractErrorMessage(err, "Failed to delete flow"))
    }
  }

  if (loading) {
    return (
      <div className="flex min-h-[220px] items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-violet-500" />
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {ConfirmDialogRender}
      {editFlow ? (
        <EditFlowModal
          flow={editFlow}
          existingFlows={flows}
          saving={editSaving}
          onClose={() => setEditFlow(null)}
          onSave={(name, description) => void saveFlowEdits(name, description)}
          onEditFlow={() => { setEditFlow(null); router.push(`/dashboard/automations/flows/${editFlow.id}`) }}
        />
      ) : null}
      {createOpen ? (
        <CreateFlowModal
          key={surveys[0]?.id ?? "empty"}
          open={createOpen}
          surveys={surveys}
          existingFlows={flows}
          onClose={() => setCreateOpen(false)}
          onCreate={({ name, surveyId }) => {
            setCreateOpen(false)
            router.push(
              `/dashboard/automations/flows/new?surveyId=${encodeURIComponent(surveyId)}&name=${encodeURIComponent(name)}`,
            )
          }}
        />
      ) : null}

      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-zinc-950">Flows</h1>
          <p className="mt-1 text-sm text-zinc-500">
            Build automation pipelines for redirects, routing, and notifications.
          </p>
        </div>
        <Button onClick={() => setCreateOpen(true)}>
          <Plus className="mr-1.5 h-4 w-4" />
          Create a flow
        </Button>
      </div>

      {error ? (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      ) : null}

      <Card>
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold text-zinc-900">Saved flows</h2>
            <span className="text-sm text-zinc-500">{flows.length}</span>
          </div>

          {flows.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-zinc-200 bg-zinc-50 px-4 py-8 text-center text-sm text-zinc-500">
              No flows have been created yet.
            </div>
          ) : (
            <div className="space-y-3">
              {flows.map((flow) => {
                const counts = flowCounts(flow)
                return (
                  <div key={flow.id} className="rounded-2xl border border-zinc-200 bg-white px-4 py-4">
                    <div className="flex items-start justify-between gap-4">
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <p className="truncate font-semibold text-zinc-900">{flow.name}</p>
                          <span
                            className={[
                              "rounded-full px-2 py-0.5 text-xs font-medium",
                              flow.is_active ? "bg-emerald-50 text-emerald-700" : "bg-zinc-100 text-zinc-500",
                            ].join(" ")}
                          >
                            {flow.is_active ? "Active" : "Disabled"}
                          </span>
                          <span className="rounded-full bg-violet-50 px-2 py-0.5 text-xs font-medium text-violet-700">
                            {flow.survey_name}
                          </span>
                        </div>
                        {truncateDescription(flow.description) ? (
                          <p className="mt-1 text-sm text-zinc-600">{truncateDescription(flow.description)}</p>
                        ) : null}
                        <div className="mt-3 flex flex-wrap gap-4 text-sm text-zinc-500">
                          <span>{plural(counts.rules, "rule")}</span>
                          <span>{plural(counts.branches, "branch", "branches")}</span>
                          <span>{plural(counts.actions, "action")}</span>
                          <span>{plural(flow.location_survey_ids.length, "trigger")}</span>
                        </div>
                      </div>

                      <div className="flex items-center gap-1">
                        <Button variant="ghost" onClick={() => setEditFlow(flow)}>
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button variant="ghost" onClick={() => void toggleFlow(flow)}>
                          {flow.is_active ? (
                            <ToggleRight className="h-4 w-4 text-emerald-500" />
                          ) : (
                            <ToggleLeft className="h-4 w-4" />
                          )}
                        </Button>
                        <Button variant="ghost" onClick={() => void deleteFlow(flow)}>
                          <Trash2 className="h-4 w-4 text-red-500" />
                        </Button>
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </Card>

      <Card>
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold text-zinc-900">Recent flow runs</h2>
            <span className="text-sm text-zinc-500">{flowRuns.length}</span>
          </div>

          {flowRuns.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-zinc-200 bg-zinc-50 px-4 py-8 text-center text-sm text-zinc-500">
              No flow runs recorded yet.
            </div>
          ) : (
            <div className="space-y-3">
              {flowRuns.slice(0, 8).map((run) => (
                <details key={run.id} className="rounded-2xl border border-zinc-200 bg-white px-4 py-3">
                  <summary className="cursor-pointer list-none">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="font-medium text-zinc-900">{run.flow_name}</p>
                        <p className="mt-1 text-sm text-zinc-500">
                          {run.survey_name} · {run.location_name ?? "Unknown location"} ·{" "}
                          {run.action_executed ?? "No action"}
                        </p>
                      </div>
                      <span className="text-sm text-zinc-500">
                        {run.runtime_ms != null ? `${run.runtime_ms} ms` : "n/a"}
                      </span>
                    </div>
                  </summary>
                  <pre className="mt-3 overflow-x-auto rounded-xl bg-zinc-950 p-3 text-xs text-zinc-100">
                    {JSON.stringify(run.execution_trace, null, 2)}
                  </pre>
                </details>
              ))}
            </div>
          )}
        </div>
      </Card>
    </div>
  )
}
