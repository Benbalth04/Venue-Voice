"use client"

import "@xyflow/react/dist/style.css"

import { useParams, useRouter, useSearchParams } from "next/navigation"
import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { Background, ReactFlow, type Edge, type Node, type ReactFlowInstance } from "@xyflow/react"
import { ArrowLeft, Loader2, RotateCcw, Save } from "lucide-react"
import { Button } from "@/components/ui/button"
import { LoadingSpinner } from "@/components/ui/LoadingSpinner"
import { Card } from "@/components/ui/card"
import { useConfirm } from "@/components/ui/ConfirmDialog"
import { supabase } from "@/lib/supabase/client"
import {
  createSurveyFlow,
  extractErrorMessage,
  fetchFlow,
  fetchFlows,
  fetchLocationSurveys,
  fetchNotificationGroups,
  fetchSurveyLogicRules,
  fetchSurveys,
  isStaleObjectError,
  updateSurveyFlow,
  type FlowBranchType,
  type FlowPayload,
  type FlowResponse,
  type FlowUpdatePayload,
  type LocationSurveyResponse,
  type NotificationGroupResponse,
  type SurveySummary,
} from "@/lib/api/client"
import { LEAVE_MESSAGE, TRIGGER_NODE_ID } from "./constants"
import { buildFlowCanvas } from "./buildFlowCanvas"
import {
  canonicalParentId,
  draftFromFlow,
  hasUnsavedNewDraft,
  makeDraftNode,
  normalizeActionConfig,
  normalizeBranchConfig,
  normalizeNode,
  preorderDraftNodesWithPositions,
  redirectActionCountOnPathFromRootTo,
  serializeDraft,
  sortDraftNodes,
} from "./draftUtils"
import { FLOW_EDITOR_EDGE_TYPES, FLOW_EDITOR_NODE_TYPES } from "./flow-canvas-registry"
import { FlowActionInspector } from "./inspector/action-node"
import { FlowBranchInspector } from "./inspector/branch-node"
import { FlowRuleInspector } from "./inspector/rule-node"
import { FlowTerminateInspector } from "./inspector/terminate-node"
import { FlowTriggerInspector } from "./inspector/trigger-node"
import type { DraftNode, FlowDraft, RuleSummary } from "./types"
import { validateFlowDraft } from "./validateFlowDraft"

export function FlowEditor() {
  const params = useParams<{ flowId: string }>()
  const searchParams = useSearchParams()
  const router = useRouter()
  const { confirm, ConfirmDialogRender } = useConfirm()
  const flowId = String(params.flowId)
  const isNew = flowId === "new"
  const initialSurveyId = searchParams.get("surveyId") ?? ""
  const initialName = searchParams.get("name") ?? ""

  const [surveys, setSurveys] = useState<SurveySummary[]>([])
  const [existingFlows, setExistingFlows] = useState<FlowResponse[]>([])
  const [rules, setRules] = useState<RuleSummary[]>([])
  const [locationSurveys, setLocationSurveys] = useState<LocationSurveyResponse[]>([])
  const [notificationGroups, setNotificationGroups] = useState<NotificationGroupResponse[]>([])
  const [draft, setDraft] = useState<FlowDraft | null>(null)
  const [selectedNodeId, setSelectedNodeId] = useState<string>(TRIGGER_NODE_ID)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [saveBanner, setSaveBanner] = useState<string | null>(null)
  const [savedSnapshot, setSavedSnapshot] = useState("")
  const [flowMissing, setFlowMissing] = useState(false)
  const [isMobileViewport, setIsMobileViewport] = useState(false)
  const [validationHighlightNodeId, setValidationHighlightNodeId] = useState<string | null>(null)
  const flowRef = useRef<ReactFlowInstance<Node, Edge> | null>(null)
  const hasFitView = useRef(false)

  async function getToken() {
    const {
      data: { session },
    } = await supabase.auth.getSession()
    return session?.access_token ?? null
  }

  async function loadSurveyContext(token: string, surveyId: string) {
    const [ruleBundle, locationSurveyRows] = await Promise.all([
      fetchSurveyLogicRules(token, surveyId),
      fetchLocationSurveys(token, { survey_id: surveyId }),
    ])
    setRules(
      ruleBundle.rules.map((rule) => ({
        id: rule.id,
        name: rule.name,
        description: rule.description,
      })),
    )
    setLocationSurveys(locationSurveyRows)
  }

  useEffect(() => {
    async function load() {
      const token = await getToken()
      if (!token) return
      try {
        const [surveyRows, flowRows, notificationGroupRows] = await Promise.all([
          fetchSurveys(token),
          fetchFlows(token),
          fetchNotificationGroups(token),
        ])
        setSurveys(surveyRows)
        setExistingFlows(flowRows)
        setNotificationGroups(notificationGroupRows)

        if (!surveyRows.length) {
          setDraft(null)
          setFlowMissing(false)
          return
        }

        if (isNew) {
          const resolvedSurveyId = initialSurveyId || surveyRows[0]?.id || ""
          await loadSurveyContext(token, resolvedSurveyId)
          const nextDraft: FlowDraft = {
            survey_id: resolvedSurveyId,
            name: initialName,
            description: "",
            is_active: true,
            location_survey_ids: [],
            nodes: [],
          }
          setDraft(nextDraft)
          setSavedSnapshot("")
          setFlowMissing(false)
        } else {
          const flow = await fetchFlow(token, flowId)
          await loadSurveyContext(token, flow.survey_id)
          const nextDraft = draftFromFlow(flow)
          setDraft(nextDraft)
          setSavedSnapshot(serializeDraft(nextDraft))
          setFlowMissing(false)
        }
      } catch (err) {
        const message = extractErrorMessage(err, "Failed to load flow editor")
        if (!isNew && message.toLowerCase().includes("not found")) {
          setFlowMissing(true)
          setDraft(null)
        } else {
          setError(message)
        }
      } finally {
        setLoading(false)
      }
    }
    void load()
  }, [flowId, initialName, initialSurveyId, isNew])

  const rulesById = useMemo(() => new Map(rules.map((rule) => [rule.id, rule])), [rules])
  const surveyName = useMemo(
    () => surveys.find((survey) => survey.id === draft?.survey_id)?.name ?? "Unknown survey",
    [draft?.survey_id, surveys],
  )
  const selectedNode = useMemo(
    () => draft?.nodes.find((node) => node.id === selectedNodeId) ?? null,
    [draft?.nodes, selectedNodeId],
  )
  const selectedTriggerLocations = useMemo(
    () => locationSurveys.filter((item) => draft?.location_survey_ids.includes(item.id)),
    [draft?.location_survey_ids, locationSurveys],
  )
  const locationSurveySelectOptions = useMemo(() => {
    const blocked = new Set<string>()
    for (const flow of existingFlows) {
      if (flow.id === draft?.id) continue
      for (const lsid of flow.location_survey_ids) blocked.add(lsid)
    }
    return locationSurveys
      .filter((item) => !blocked.has(item.id) || (draft?.location_survey_ids.includes(item.id) ?? false))
      .map((item) => ({
        value: item.id,
        label: `${item.location_name} · ${item.survey_name}`,
      }))
  }, [locationSurveys, existingFlows, draft?.id, draft?.location_survey_ids])

  useEffect(() => {
    const mq = window.matchMedia("(max-width: 767px)")
    const apply = () => setIsMobileViewport(mq.matches)
    apply()
    mq.addEventListener("change", apply)
    return () => mq.removeEventListener("change", apply)
  }, [])

  useEffect(() => {
    if (!saveBanner) return
    const t = window.setTimeout(() => setSaveBanner(null), 4000)
    return () => window.clearTimeout(t)
  }, [saveBanner])

  useEffect(() => {
    if (!validationHighlightNodeId) return
    const t = window.setTimeout(() => setValidationHighlightNodeId(null), 10_000)
    return () => window.clearTimeout(t)
  }, [validationHighlightNodeId])

  const selectNodeOnCanvas = useCallback((id: string) => {
    setValidationHighlightNodeId((h) => (h === id ? null : h))
    setSelectedNodeId(id)
  }, [])

  const isDirty = useMemo(() => {
    if (!draft) return false
    return draft.id ? serializeDraft(draft) !== savedSnapshot : hasUnsavedNewDraft(draft)
  }, [draft, savedSnapshot])

  function setNodes(update: (nodes: DraftNode[]) => DraftNode[]) {
    setDraft((current) => (current ? { ...current, nodes: sortDraftNodes(update(current.nodes)) } : current))
  }

  function updateSelectedNode(update: (node: DraftNode) => DraftNode) {
    setNodes((nodes) => nodes.map((node) => (node.id === selectedNodeId ? normalizeNode(update(node)) : node)))
  }

  function addNode(parentId: string | null, kind: "rule" | "branch" | "action" | "terminate", branchType: FlowBranchType | null) {
    const normalizedParentId = parentId === TRIGGER_NODE_ID ? null : parentId
    const existingNodes = draft?.nodes ?? []
    const redirectPathToParent = redirectActionCountOnPathFromRootTo(existingNodes, normalizedParentId)
    const node =
      kind === "rule"
        ? makeDraftNode({
            parent_id: normalizedParentId,
            node_type: "rule",
            rule_id: null,
            branch_type: branchType,
          })
        : kind === "branch"
          ? makeDraftNode({
              parent_id: normalizedParentId,
              node_type: "branch",
              rule_id: null,
              branch_type: branchType,
              config: { rule_conditions: [], match_type: "all" },
            })
          : kind === "terminate"
            ? makeDraftNode({
                parent_id: normalizedParentId,
                node_type: "terminate",
                rule_id: null,
                branch_type: branchType,
              })
            : redirectPathToParent >= 1
              ? makeDraftNode({
                  parent_id: normalizedParentId,
                  node_type: "action",
                  rule_id: null,
                  branch_type: branchType,
                  action_type: "email",
                  config: { target: "location_notification_groups" },
                })
              : makeDraftNode({
                  parent_id: normalizedParentId,
                  node_type: "action",
                  rule_id: null,
                  branch_type: branchType,
                  action_type: "redirect",
                  config: { target: "google_business_url" },
                })

    setNodes((nodes) => [...nodes, normalizeNode(node)])
    setSelectedNodeId(node.id)
    setError(null)
  }

  async function removeNodeCascade(nodeId: string) {
    const ok = await confirm({
      title: "Delete node",
      message: "Are you sure you want to delete this node and everything following it?",
      confirmLabel: "Delete",
      variant: "danger",
    })
    if (!ok) return

    setNodes((nodes) => {
      const idsToDelete = new Set<string>()
      const walk = (targetId: string) => {
        idsToDelete.add(targetId)
        nodes.filter((node) => node.parent_id === targetId).forEach((node) => walk(node.id))
      }
      walk(nodeId)
      queueMicrotask(() => {
        setValidationHighlightNodeId((h) => (h && idsToDelete.has(h) ? null : h))
      })
      return nodes.filter((node) => !idsToDelete.has(node.id))
    })
    setSelectedNodeId(TRIGGER_NODE_ID)
  }

  function insertNodeBetween(targetNodeId: string, kind: "rule" | "branch" | "action" | "terminate") {
    const newNodeId = crypto.randomUUID()
    setNodes((nodes) => {
      const target = nodes.find((n) => n.id === targetNodeId)
      if (!target) return nodes
      const redirectPathToParent = redirectActionCountOnPathFromRootTo(
        nodes,
        canonicalParentId(target.parent_id),
      )
      const newNode = normalizeNode(
        makeDraftNode(
          kind === "branch"
            ? {
                id: newNodeId,
                parent_id: target.parent_id,
                node_type: "branch",
                branch_type: target.branch_type,
                config: { rule_conditions: [], match_type: "all" },
              }
            : kind === "action"
              ? {
                  id: newNodeId,
                  parent_id: target.parent_id,
                  node_type: "action",
                  branch_type: target.branch_type,
                  action_type: redirectPathToParent >= 1 ? "email" : "redirect",
                  config:
                    redirectPathToParent >= 1
                      ? { target: "location_notification_groups" }
                      : { target: "google_business_url" },
                }
              : kind === "terminate"
                ? {
                    id: newNodeId,
                    parent_id: target.parent_id,
                    node_type: "terminate",
                    branch_type: target.branch_type,
                  }
                : {
                    id: newNodeId,
                    parent_id: target.parent_id,
                    node_type: "rule",
                    branch_type: target.branch_type,
                  },
        ),
      )
      return sortDraftNodes([
        ...nodes.map((n) =>
          n.id === targetNodeId
            ? {
                ...n,
                parent_id: newNodeId,
                branch_type:
                  kind === "branch" ? ("TRUE" as FlowBranchType) : (target.branch_type as FlowBranchType | null),
              }
            : n,
        ),
        newNode,
      ])
    })
    setSelectedNodeId(newNodeId)
    setError(null)
  }

  async function saveFlow() {
    const token = await getToken()
    if (!token || !draft) return

    const validation = validateFlowDraft(draft, {
      existingFlows,
      selectedTriggerLocations,
    })
    if (validation.message) {
      setError(validation.message)
      setValidationHighlightNodeId(validation.highlightNodeId)
      return
    }

    setSaving(true)
    setError(null)
    setValidationHighlightNodeId(null)
    setSaveBanner(null)
    try {
      const basePayload: FlowPayload = {
        name: draft.name.trim(),
        description: draft.description.trim() || null,
        is_active: draft.is_active,
        location_survey_ids: draft.location_survey_ids,
        nodes: preorderDraftNodesWithPositions(draft.nodes),
      }
      const saved = draft.id
        ? await updateSurveyFlow(token, draft.survey_id, draft.id, { ...basePayload, updated_at: draft.updated_at ?? "" } as FlowUpdatePayload)
        : await createSurveyFlow(token, draft.survey_id, basePayload)
      const nextDraft = draftFromFlow(saved)
      setDraft(nextDraft)
      setSavedSnapshot(serializeDraft(nextDraft))
      setSelectedNodeId(TRIGGER_NODE_ID)
      hasFitView.current = false
      router.replace(`/dashboard/automations/flows/${saved.id}`)
      setSaveBanner("Changes saved.")
    } catch (err) {
      if (isStaleObjectError(err)) {
        setError("This flow was updated elsewhere. Please refresh.")
      } else {
        setError(extractErrorMessage(err, "Failed to save flow"))
      }
    } finally {
      setSaving(false)
    }
  }

  async function navigateWithGuard(href: string) {
    if (!isDirty) {
      router.push(href)
      return
    }
    const ok = await confirm({ title: "Unsaved changes", message: LEAVE_MESSAGE })
    if (ok) router.push(href)
  }

  useEffect(() => {
    const onBeforeUnload = (event: BeforeUnloadEvent) => {
      if (!isDirty) return
      event.preventDefault()
      event.returnValue = LEAVE_MESSAGE
      return LEAVE_MESSAGE
    }
    window.addEventListener("beforeunload", onBeforeUnload)
    return () => window.removeEventListener("beforeunload", onBeforeUnload)
  }, [isDirty])

  useEffect(() => {
    const onClick = async (event: MouseEvent) => {
      if (!isDirty) return
      if (event.defaultPrevented || event.button !== 0) return
      if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return
      const target = event.target as Element | null
      const anchor = target?.closest("a[href]") as HTMLAnchorElement | null
      if (!anchor) return
      const href = anchor.getAttribute("href")
      if (!href || !href.startsWith("/")) return
      const next = new URL(href, window.location.origin)
      if (next.pathname === window.location.pathname && next.search === window.location.search) return
      event.preventDefault()
      event.stopPropagation()
      const ok = await confirm({ title: "Unsaved changes", message: LEAVE_MESSAGE })
      if (ok) router.push(href)
    }
    document.addEventListener("click", onClick, true)
    return () => document.removeEventListener("click", onClick, true)
  }, [confirm, isDirty, router])

  useEffect(() => {
    const onPopState = async () => {
      if (!isDirty) return
      window.history.go(1)
      const ok = await confirm({ title: "Unsaved changes", message: LEAVE_MESSAGE })
      if (ok) window.history.back()
    }
    window.addEventListener("popstate", onPopState)
    return () => window.removeEventListener("popstate", onPopState)
  }, [confirm, isDirty])

  const canvas = draft
    ? buildFlowCanvas({
        draft,
        selectedNodeId,
        validationHighlightNodeId,
        rulesById,
        locationSurveys,
        notificationGroups,
        setSelectedNodeId: selectNodeOnCanvas,
        addNode,
        insertNodeBetween,
        removeNodeCascade,
      })
    : { nodes: [] as Node[], edges: [] as Edge[] }

  useEffect(() => {
    if (!canvas.nodes.length || !flowRef.current || hasFitView.current) return
    const frame = window.requestAnimationFrame(() => {
      flowRef.current?.fitView({ padding: 0.45, duration: 350 })
      hasFitView.current = true
    })
    return () => window.cancelAnimationFrame(frame)
  }, [canvas.nodes])

  if (loading) {
    return (
      <div className="flex min-h-[320px] items-center justify-center">
        <LoadingSpinner size="lg" />
      </div>
    )
  }

  if (flowMissing || !draft) {
    return (
      <div className="space-y-4 p-6">
        <Button variant="ghost" onClick={() => void navigateWithGuard("/dashboard/automations/flows")}>
          <ArrowLeft className="mr-1.5 h-4 w-4" />
          Back to flows
        </Button>
        <Card>
          <p className="text-sm text-zinc-600">
            {flowMissing ? "This flow could not be found." : "There is no survey available for this flow."}
          </p>
        </Card>
      </div>
    )
  }

  if (isMobileViewport) {
    return (
      <div className="flex min-h-[60vh] flex-col items-center justify-center gap-4 bg-zinc-50 p-6">
        <Card className="max-w-md p-6 text-center shadow-sm">
          <p className="text-sm leading-relaxed text-zinc-700">
            The flow editor is not available on small screens. Use a larger display to build and edit flows.
          </p>
          <Button className="mt-5" onClick={() => router.push("/dashboard/automations/flows")}>
            Go to flows overview
          </Button>
        </Card>
      </div>
    )
  }

  const selectedBranchConfig = selectedNode?.node_type === "branch" ? normalizeBranchConfig(selectedNode.config) : null
  const selectedActionConfig =
    selectedNode?.node_type === "action" ? normalizeActionConfig(selectedNode.action_type, selectedNode.config) : null

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden bg-zinc-50">
      {ConfirmDialogRender}

      <div className="flex items-center gap-3 border-b border-zinc-200 bg-white px-6 py-3">
        <Button variant="ghost" onClick={() => void navigateWithGuard("/dashboard/automations/flows")}>
          <ArrowLeft className="mr-1.5 h-4 w-4" />
          Back to flows
        </Button>
        <div className="min-w-0 flex-1 text-center">
          <p className="truncate text-sm font-semibold text-zinc-950">{draft.name || "Untitled flow"}</p>
          <p className="text-xs text-zinc-400">{surveyName}</p>
        </div>
        <div className="flex flex-col items-end gap-1">
          {saveBanner ? <span className="text-xs font-medium text-emerald-600">{saveBanner}</span> : null}
          <Button onClick={() => void saveFlow()} disabled={saving}>
            {saving ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <Save className="mr-1.5 h-4 w-4" />}
            Save flow
          </Button>
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-6 py-6">
        {error ? (
          <div className="mb-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>
        ) : null}

        <Card className="relative mb-6 flex min-h-[540px] flex-col overflow-hidden p-0 lg:flex-row">
          <div className="relative min-h-[360px] min-w-0 flex-1 bg-[radial-gradient(circle_at_1px_1px,rgba(113,113,122,0.18)_1px,transparent_0)] bg-[size:28px_28px] lg:min-h-[540px]">
            <div className="absolute right-4 top-4 z-10">
              <Button variant="outline" onClick={() => flowRef.current?.fitView({ padding: 0.45, duration: 300 })}>
                <RotateCcw className="mr-1.5 h-4 w-4" />
                Reset view
              </Button>
            </div>
            <div className="h-[min(540px,calc(100vh-220px))] min-h-[320px] w-full lg:h-[540px] lg:min-h-[540px]">
              <ReactFlow
                className="h-full w-full [&_.react-flow__edgelabel-renderer]:z-[1000]"
                nodes={canvas.nodes}
                edges={canvas.edges}
                nodeTypes={FLOW_EDITOR_NODE_TYPES}
                edgeTypes={FLOW_EDITOR_EDGE_TYPES}
                nodeOrigin={[0, 0.5]}
                defaultEdgeOptions={{ selectable: false, focusable: false, interactionWidth: 0 }}
                edgesFocusable={false}
                fitView
                fitViewOptions={{ padding: 0.45 }}
                minZoom={0.35}
                maxZoom={1.4}
                proOptions={{ hideAttribution: true }}
                onInit={(instance) => {
                  flowRef.current = instance
                }}
                onPaneClick={() => selectNodeOnCanvas(TRIGGER_NODE_ID)}
                onNodeClick={() => {}}
              >
                <Background gap={28} size={1} color="#d4d4d8" />
              </ReactFlow>
            </div>
          </div>

          <aside className="flex w-full max-w-full flex-col border-t border-zinc-200 bg-white lg:w-[400px] lg:max-w-[400px] lg:shrink-0 lg:border-l lg:border-t-0">
            <div className="flex max-h-[min(480px,50vh)] flex-1 flex-col overflow-y-auto p-4 lg:max-h-none lg:min-h-[540px]">
              <div className="space-y-5">
                {selectedNode?.node_type !== "terminate" ? (
                  <h3 className="text-sm font-semibold uppercase tracking-wide text-zinc-500">
                    {selectedNodeId === TRIGGER_NODE_ID
                      ? "Trigger"
                      : selectedNode?.node_type === "rule"
                        ? "Rule"
                        : selectedNode?.node_type === "branch"
                          ? "Branch"
                          : selectedNode?.node_type === "action"
                            ? "Action"
                            : "Settings"}
                  </h3>
                ) : null}

                {selectedNodeId === TRIGGER_NODE_ID ? (
                  <FlowTriggerInspector
                    draft={draft}
                    setDraft={setDraft}
                    locationSurveySelectOptions={locationSurveySelectOptions}
                    locationSurveys={locationSurveys}
                  />
                ) : null}

                {selectedNode && selectedNode.node_type === "rule" ? (
                  <FlowRuleInspector
                    draftNodes={draft.nodes}
                    selectedNodeId={selectedNodeId}
                    selectedNode={selectedNode}
                    rules={rules}
                    rulesById={rulesById}
                    updateSelectedNode={updateSelectedNode}
                  />
                ) : null}

                {selectedNode && selectedNode.node_type === "branch" && selectedBranchConfig ? (
                  <FlowBranchInspector
                    draftNodes={draft.nodes}
                    selectedNode={selectedNode}
                    branchConfig={selectedBranchConfig}
                    rules={rules}
                    rulesById={rulesById}
                    updateSelectedNode={updateSelectedNode}
                  />
                ) : null}

                {selectedNode?.node_type === "terminate" ? <FlowTerminateInspector /> : null}

                {selectedNode && selectedNode.node_type === "action" && selectedActionConfig ? (
                  <FlowActionInspector
                    draftNodes={draft.nodes}
                    selectedNode={selectedNode}
                    selectedActionConfig={selectedActionConfig}
                    selectedTriggerLocations={selectedTriggerLocations}
                    notificationGroups={notificationGroups}
                    updateSelectedNode={updateSelectedNode}
                  />
                ) : null}
              </div>
            </div>
          </aside>
        </Card>
      </div>
    </div>
  )
}
