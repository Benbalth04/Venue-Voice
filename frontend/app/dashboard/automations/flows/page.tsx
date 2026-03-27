"use client"

import { useRouter } from "next/navigation"
import { useEffect, useState } from "react"
import {
  AlertTriangle,
  ArrowRight,
  ArrowUpRight,
  CheckCircle2,
  ChevronDown,
  Clock,
  ExternalLink,
  Loader2,
  Mail,
  MapPin,
  Pencil,
  Plus,
  QrCode,
  Save,
  ToggleLeft,
  ToggleRight,
  Trash2,
  X,
  XCircle,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { LoadingSpinner } from "@/components/ui/LoadingSpinner"
import { Card } from "@/components/ui/card"
import { useConfirm } from "@/components/ui/ConfirmDialog"
import { SingleSelectDropdown } from "@/components/ui/DropdownSelect"
import { supabase } from "@/lib/supabase/client"

import { draftFromFlow, preorderDraftNodesWithPositions } from "@/components/flow-editor/draftUtils"
import { FlowExecutionPreview } from "@/components/flow-editor/FlowExecutionPreview"
import {
  deleteSurveyFlow,
  extractErrorMessage,
  fetchFlow,
  fetchFlowRuns,
  fetchFlows,
  fetchNotificationGroups,
  fetchRuleBundleDirect,
  fetchSurveys,
  isStaleObjectError,
  setSurveyFlowActive,
  updateSurveyFlow,
  type FlowPayload,
  type FlowResponse,
  type FlowRunAction,
  type FlowRunResponse,
  type FlowUpdatePayload,
  type NotificationGroupResponse,
  type RuleBundleData,
  type SurveySummary,
} from "@/lib/api/client"
import type { RuleInfo } from "@/components/flow-editor/buildReadOnlyCanvas"

function formatDateTime(iso: string) {
  const d = new Date(iso)
  return d.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  })
}

function ActionPill({
  action,
  locationId,
  notificationGroups,
}: {
  action: FlowRunAction
  locationId: string | null
  notificationGroups: NotificationGroupResponse[]
}) {
  const [open, setOpen] = useState(false)
  const isRedirect = action.action_type === "redirect"

  // Build the list of detail lines to show in the popover
  const detailLines: string[] = []
  if (isRedirect) {
    const url = action.config.url as string | null | undefined
    detailLines.push(url ? url : "Google Business URL")
  } else {
    const target = action.config.email_target as string | undefined
    const email = action.config.recipient_email as string | null | undefined
    const groupId = action.config.notification_group_id as string | null | undefined

    if (target === "custom_email" && email) {
      detailLines.push(email)
    } else if (target === "notification_group" && groupId) {
      const group = notificationGroups.find((g) => g.id === groupId)
      detailLines.push(group?.name ?? groupId)
    } else {
      // location_notification_groups — show every group tied to this location
      const locationGroups = locationId
        ? notificationGroups.filter((g) => g.location_ids.includes(locationId))
        : []
      if (locationGroups.length > 0) {
        for (const g of locationGroups) detailLines.push(g.name)
      } else {
        detailLines.push("Location notification groups")
      }
    }
  }

  return (
    <div className="relative">
      {open ? (
        <div
          className="fixed inset-0 z-10"
          onClick={(e) => {
            e.stopPropagation()
            setOpen(false)
          }}
        />
      ) : null}
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation()
          setOpen((v) => !v)
        }}
        className="relative z-20 inline-flex items-center gap-1.5 rounded-full border border-zinc-200 bg-zinc-50 px-2.5 py-1 text-xs font-medium text-zinc-700 transition hover:border-zinc-300 hover:bg-zinc-100"
      >
        {isRedirect ? (
          <ArrowUpRight className="h-3 w-3 text-violet-500" />
        ) : (
          <Mail className="h-3 w-3 text-emerald-600" />
        )}
        {isRedirect ? "Redirect" : "Email"}
        <ChevronDown className="h-3 w-3 text-zinc-400" />
      </button>
      {open ? (
        <div className="absolute left-0 top-full z-30 mt-1 w-max min-w-[220px] rounded-xl border border-zinc-200 bg-white p-3 shadow-xl">
          <p className="mb-2 text-[10px] font-semibold uppercase tracking-wide text-zinc-400">
            {isRedirect ? "Redirect target" : "Email recipients"}
          </p>
          <div className="space-y-1">
            {detailLines.map((line, i) => (
              <p key={i} className="whitespace-nowrap text-sm text-zinc-900">
                {line}
              </p>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  )
}

function truncateDescription(value: string | null, maxLength = 120) {
  if (!value?.trim()) return ""
  if (value.length <= maxLength) return value
  return `${value.slice(0, maxLength).trimEnd()}...`
}

function plural(n: number, singular: string, pluralForm?: string) {
  return `${n} ${n === 1 ? singular : (pluralForm ?? `${singular}s`)}`
}

function flowHasBrokenRule(flow: FlowResponse, brokenIds: Set<string>): boolean {
  return flow.nodes.some(
    (n) => n.node_type === "rule" && n.rule_id !== null && brokenIds.has(n.rule_id),
  )
}

function flowCounts(flow: FlowResponse) {
  return {
    rules: flow.nodes.filter((node) => node.node_type === "rule").length,
    actions: flow.nodes.filter((node) => node.node_type === "action").length,
    branches: flow.nodes.filter((node) => node.node_type === "branch").length,
  }
}

function flowToPayload(flow: FlowResponse, isActive: boolean): FlowPayload {
  const ordered = preorderDraftNodesWithPositions(draftFromFlow(flow).nodes)
  return {
    name: flow.name,
    description: flow.description,
    is_active: isActive,
    location_survey_ids: flow.location_survey_ids,
    nodes: ordered.map((node) => ({
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
              const nameTaken = existingFlows.some(
                (flow) => flow.name.trim().toLowerCase() === normalizedName.toLowerCase(),
              )
              if (nameTaken) {
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

          {error ? (
            <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
              {error}
            </div>
          ) : null}
        </div>

        <div className="mt-6 flex items-center justify-between gap-2">
          <Button variant="outline" onClick={onEditFlow}>
            <ArrowRight className="mr-1.5 h-4 w-4" />
            Edit flow steps
          </Button>
          <div className="flex gap-2">
            <Button variant="outline" onClick={onClose}>Cancel</Button>
            <Button
              disabled={saving}
              onClick={() => {
                const trimmed = name.trim()
                if (!trimmed) {
                  setError("Flow name is required.")
                  return
                }
                const taken = existingFlows.some(
                  (f) => f.id !== flow.id && f.name.trim().toLowerCase() === trimmed.toLowerCase(),
                )
                if (taken) {
                  setError("A flow with that name already exists for this company.")
                  return
                }
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
  const [brokenRuleIds, setBrokenRuleIds] = useState<Set<string>>(new Set())
  const [rulesById, setRulesById] = useState<Map<string, RuleInfo>>(new Map())
  const [notificationGroups, setNotificationGroups] = useState<NotificationGroupResponse[]>([])
  const [createOpen, setCreateOpen] = useState(false)
  const [editFlow, setEditFlow] = useState<FlowResponse | null>(null)
  const [editSaving, setEditSaving] = useState(false)
  const [previewState, setPreviewState] = useState<{ run: FlowRunResponse; flow: FlowResponse } | null>(null)
  const [previewLoading, setPreviewLoading] = useState<string | null>(null)

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
        const [surveyRows, flowRows, flowRunRows, notifGroups] = await Promise.all([
          fetchSurveys(token),
          fetchFlows(token),
          fetchFlowRuns(token),
          fetchNotificationGroups(token),
        ])
        setSurveys(surveyRows)
        setFlows(flowRows)
        setFlowRuns(flowRunRows)
        setNotificationGroups(notifGroups)

        // Fetch rule bundles for each unique survey to find broken rules + build rulesById map
        const uniqueSurveyIds = [...new Set(flowRows.map((f) => f.survey_id))]
        const results = await Promise.allSettled(
          uniqueSurveyIds.map((sid) => fetchRuleBundleDirect(token, sid) as Promise<RuleBundleData>),
        )
        const broken = new Set<string>()
        const ruleMap = new Map<string, RuleInfo>()
        for (const r of results) {
          if (r.status === "fulfilled") {
            for (const rule of r.value.rules) {
              ruleMap.set(rule.id, { name: rule.name, description: rule.description ?? null })
              if (rule.status === "broken") broken.add(rule.id)
            }
          }
        }
        setBrokenRuleIds(broken)
        setRulesById(ruleMap)
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
      const payload: FlowUpdatePayload = {
        ...flowToPayload(editFlow, editFlow.is_active),
        name,
        description: description || null,
        updated_at: editFlow.updated_at,
      }
      const updated = await updateSurveyFlow(token, editFlow.survey_id, editFlow.id, payload)
      setFlows((current) => current.map((f) => (f.id === updated.id ? updated : f)))
      setEditFlow(null)
    } catch (err) {
      if (isStaleObjectError(err)) {
        setError("This flow was updated elsewhere. Please refresh.")
      } else {
        setError(extractErrorMessage(err, "Failed to update flow"))
      }
    } finally {
      setEditSaving(false)
    }
  }

  async function toggleFlow(flow: FlowResponse) {
    const token = await getToken()
    if (!token) {
      setError("You must be signed in to update flows.")
      return
    }
    const nextActive = !flow.is_active
    if (flow.is_active) {
      const ok = await confirm({
        title: `Disable Flow - ${flow.name}`,
        message: "Are you sure you want to disable this flow?",
        confirmLabel: "Disable",
      })
      if (!ok) return
    }
    try {
      const updated = await setSurveyFlowActive(token, flow.survey_id, flow.id, { is_active: nextActive, updated_at: flow.updated_at })
      setFlows((current) => current.map((item) => (item.id === updated.id ? updated : item)))
    } catch (err) {
      if (isStaleObjectError(err)) {
        setError("This flow was updated elsewhere. Please refresh.")
      } else {
        setError(extractErrorMessage(err, "Failed to update flow"))
      }
    }
  }

  async function deleteFlow(flow: FlowResponse) {
    const ok = await confirm({
      title: `Delete Flow - ${flow.name}`,
      message: `Are you sure you want to delete this flow? This cannot be undone.`,
      confirmLabel: "Delete",
      variant: "danger",
    })
    if (!ok) return
    const token = await getToken()
    if (!token) return
    try {
      await deleteSurveyFlow(token, flow.survey_id, flow.id, flow.updated_at)
      setFlows((current) => current.filter((item) => item.id !== flow.id))
    } catch (err) {
      if (isStaleObjectError(err)) {
        setError("This flow was updated. Please refresh.")
      } else {
        setError(extractErrorMessage(err, "Failed to delete flow"))
      }
    }
  }

  async function openPreview(run: FlowRunResponse) {
    const existing = flows.find((f) => f.id === run.flow_id)
    if (existing) {
      setPreviewState({ run, flow: existing })
      return
    }
    const token = await getToken()
    if (!token) return
    setPreviewLoading(run.id)
    try {
      const flow = await fetchFlow(token, run.flow_id)
      setPreviewState({ run, flow })
    } catch {
      // flow may have been deleted
    } finally {
      setPreviewLoading(null)
    }
  }

  if (loading) {
    return (
      <div className="flex min-h-[220px] items-center justify-center">
        <LoadingSpinner size="lg" />
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {ConfirmDialogRender}
      {previewState ? (
        <FlowExecutionPreview
          run={previewState.run}
          flow={previewState.flow}
          rulesById={rulesById}
          onClose={() => setPreviewState(null)}
        />
      ) : null}
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
                          {flowHasBrokenRule(flow, brokenRuleIds) && (
                            <span className="inline-flex items-center gap-1 rounded-full bg-red-50 px-2 py-0.5 text-xs font-medium text-red-600">
                              <AlertTriangle className="h-3 w-3" />
                              Contains broken rules
                            </span>
                          )}
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
                <div key={run.id} className="rounded-2xl border border-zinc-200 bg-white px-4 py-4">
                  {/* Top row: name + status + run time */}
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex min-w-0 items-center gap-2">
                      {run.success ? (
                        <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-500" />
                      ) : (
                        <XCircle className="h-4 w-4 shrink-0 text-red-500" />
                      )}
                      <p className="truncate font-semibold text-zinc-900">{run.flow_name}</p>
                    </div>
                    {run.runtime_ms != null ? (
                      <span className="shrink-0 rounded-full bg-zinc-100 px-2.5 py-0.5 text-xs font-medium text-zinc-600">
                        {run.runtime_ms} ms
                      </span>
                    ) : null}
                  </div>

                  {/* Meta */}
                  <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-zinc-500">
                    <span className="flex items-center gap-1">
                      <Clock className="h-3.5 w-3.5 shrink-0" />
                      {formatDateTime(run.created_at)}
                    </span>
                    <span className="flex items-center gap-1">
                      <MapPin className="h-3.5 w-3.5 shrink-0" />
                      {run.survey_name}
                      {run.location_name ? ` · ${run.location_name}` : ""}
                    </span>
                    {run.qr_code_title ? (
                      <span className="flex items-center gap-1">
                        <QrCode className="h-3.5 w-3.5 shrink-0" />
                        {run.qr_code_title}
                      </span>
                    ) : null}
                  </div>

                  {/* Actions + view button */}
                  <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
                    <div className="flex flex-wrap items-center gap-2">
                      {run.actions.length > 0 ? (
                        run.actions.map((action) => (
                          <ActionPill
                            key={action.id}
                            action={action}
                            locationId={run.location_id}
                            notificationGroups={notificationGroups}
                          />
                        ))
                      ) : (
                        <span className="text-xs text-zinc-400">No actions taken</span>
                      )}
                    </div>
                    <button
                      type="button"
                      disabled={previewLoading === run.id}
                      onClick={() => void openPreview(run)}
                      className="inline-flex items-center gap-1.5 rounded-xl border border-zinc-200 bg-white px-3 py-1.5 text-xs font-medium text-zinc-700 transition hover:border-zinc-300 hover:bg-zinc-50 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      {previewLoading === run.id ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      ) : (
                        <ExternalLink className="h-3.5 w-3.5" />
                      )}
                      View execution
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </Card>
    </div>
  )
}
