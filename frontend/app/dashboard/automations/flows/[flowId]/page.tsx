"use client"

import "@xyflow/react/dist/style.css"

import { useParams, useRouter, useSearchParams } from "next/navigation"
import { useEffect, useMemo, useRef, useState } from "react"
import type { CSSProperties } from "react"
import {
  Background,
  EdgeLabelRenderer,
  Handle,
  MarkerType,
  Position,
  ReactFlow,
  type Edge,
  type EdgeProps,
  type Node,
  type NodeProps,
  type ReactFlowInstance,
} from "@xyflow/react"
import {
  ArrowLeft,
  GitBranch,
  Loader2,
  Mail,
  Plus,
  RotateCcw,
  Save,
  Trash2,
  Workflow,
  X,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { DropdownSelect, SingleSelectDropdown } from "@/components/ui/DropdownSelect"
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
  updateSurveyFlow,
  type FlowActionType,
  type FlowBranchMatchType,
  type FlowBranchType,
  type FlowEmailTargetType,
  type FlowNodePayload,
  type FlowPayload,
  type FlowRedirectTargetType,
  type FlowResponse,
  type LocationSurveyResponse,
  type NotificationGroupResponse,
  type SurveySummary,
} from "@/lib/api/client"

const TRIGGER_NODE_ID = "__trigger__"
const COL_GAP = 380
const ROW_GAP = 200
const LEAVE_MESSAGE = "You have unsaved changes. Are you sure you want to leave?"

type DraftNode = Omit<FlowNodePayload, "id"> & { id: string }

type FlowDraft = {
  id?: string
  survey_id: string
  name: string
  description: string
  is_active: boolean
  location_survey_ids: string[]
  nodes: DraftNode[]
}

type RuleSummary = {
  id: string
  name: string
  description: string | null
}

type BranchRuleCondition = { rule_id: string; expected: boolean }

type EdgeInsertData = { onInsert?: (kind: "rule" | "branch") => void }

type CanvasNodeData = {
  kind: "trigger" | "rule" | "branch" | "action"
  label: string
  title: string
  subtitle?: string
  selected: boolean
  onSelect: () => void
  onDelete?: () => void
}

type AddNodeData = {
  onAdd: (kind: "rule" | "branch" | "action") => void
}

function makeDraftNode(overrides: Partial<DraftNode>): DraftNode {
  return {
    id: crypto.randomUUID(),
    parent_id: null,
    node_type: "rule",
    rule_id: null,
    branch_type: null,
    action_type: null,
    config: null,
    position: 0,
    ...overrides,
  }
}

function sortDraftNodes(nodes: DraftNode[]) {
  return nodes.map((node, index) => ({ ...node, position: index }))
}

function normalizeActionConfig(
  actionType: FlowActionType | null | undefined,
  config: Record<string, unknown> | null | undefined,
): Record<string, unknown> | null {
  const current = { ...(config ?? {}) }
  if (actionType === "redirect") {
    if (typeof current.url === "string" && !current.target) {
      return { target: "custom_url" satisfies FlowRedirectTargetType, url: current.url }
    }
    return { target: "google_business_url" satisfies FlowRedirectTargetType, ...current }
  }
  if (actionType === "email") {
    if (typeof current.notification_group_id === "string" && !current.target) {
      return { target: "notification_group" satisfies FlowEmailTargetType, ...current }
    }
    if (typeof current.email === "string" && !current.target) {
      return { target: "custom_email" satisfies FlowEmailTargetType, ...current }
    }
    return { target: "location_notification_groups" satisfies FlowEmailTargetType, ...current }
  }
  return current
}

function normalizeBranchConfig(config: Record<string, unknown> | null | undefined): {
  rule_conditions: BranchRuleCondition[]
  match_type: FlowBranchMatchType
} {
  const current = { ...(config ?? {}) }
  const matchType: FlowBranchMatchType = current.match_type === "any" ? "any" : "all"
  // New format
  if (Array.isArray(current.rule_conditions)) {
    const conditions = (current.rule_conditions as Array<Record<string, unknown>>)
      .filter((rc) => typeof rc.rule_id === "string" && rc.rule_id)
      .map((rc) => ({ rule_id: String(rc.rule_id), expected: rc.expected !== false }))
    return { rule_conditions: conditions, match_type: matchType }
  }
  // Legacy format: rule_ids + negate → migrate to rule_conditions
  const ruleIds = Array.isArray(current.rule_ids)
    ? current.rule_ids.map((value) => String(value)).filter(Boolean)
    : []
  const negate = Boolean(current.negate)
  return {
    rule_conditions: ruleIds.map((rule_id) => ({ rule_id, expected: !negate })),
    match_type: matchType,
  }
}

function normalizeNode(node: DraftNode): DraftNode {
  if (node.node_type === "branch") {
    const { rule_conditions, match_type } = normalizeBranchConfig(node.config)
    return { ...node, config: { rule_conditions, match_type } }
  }
  if (node.node_type === "action") {
    return { ...node, config: normalizeActionConfig(node.action_type, node.config) }
  }
  return { ...node, config: node.config ?? null }
}

function childrenOf(nodes: DraftNode[], parentId: string | null) {
  return nodes
    .filter((node) => node.parent_id === parentId)
    .sort((a, b) => {
      if (a.branch_type === "TRUE") return -1
      if (b.branch_type === "TRUE") return 1
      return a.position - b.position
    })
}

function draftFromFlow(flow: FlowResponse): FlowDraft {
  const sourceNodes = flow.nodes
    .slice()
    .sort((a, b) => a.position - b.position)
    .map((node) => ({
      id: node.id,
      parent_id: node.parent_id,
      node_type: node.node_type,
      rule_id: node.rule_id,
      branch_type: node.branch_type,
      action_type: node.action_type,
      config: node.config,
      position: node.position,
    }))

  const childMap = new Map<string | null, DraftNode[]>()
  for (const node of sourceNodes) {
    const list = childMap.get(node.parent_id) ?? []
    list.push(node)
    childMap.set(node.parent_id, list)
  }
  for (const list of childMap.values()) {
    list.sort((a, b) => a.position - b.position)
  }

  const output: DraftNode[] = []
  const visit = (node: DraftNode, parentId: string | null, incomingBranchType: FlowBranchType | null) => {
    const childNodes = childMap.get(node.id) ?? []
    const legacyBranchChildren = childNodes.filter((child) => child.node_type === "branch" && !child.action_type)

    if (node.node_type === "rule" && legacyBranchChildren.length > 0) {
      output.push(
        normalizeNode({
          id: node.id,
          parent_id: parentId,
          node_type: "branch",
          rule_id: null,
          branch_type: incomingBranchType,
          action_type: null,
          config: { rule_ids: node.rule_id ? [node.rule_id] : [], match_type: "all", negate: false },
          position: node.position,
        }),
      )
      for (const branchChild of legacyBranchChildren) {
        const grandChild = (childMap.get(branchChild.id) ?? [])[0]
        if (grandChild) {
          visit(grandChild, node.id, branchChild.branch_type ?? null)
        }
      }
      return
    }

    const normalized: DraftNode = normalizeNode({
      ...node,
      parent_id: parentId,
      branch_type: incomingBranchType,
    })
    output.push(normalized)

    for (const child of childNodes) {
      if (legacyBranchChildren.includes(child)) continue
      visit(child, node.id, child.branch_type ?? null)
    }
  }

  const root = (childMap.get(null) ?? [])[0]
  if (root) {
    visit(root, null, null)
  }

  return {
    id: flow.id,
    survey_id: flow.survey_id,
    name: flow.name,
    description: flow.description ?? "",
    is_active: flow.is_active,
    location_survey_ids: flow.location_survey_ids,
    nodes: sortDraftNodes(output),
  }
}

function serializeDraft(draft: FlowDraft | null) {
  if (!draft) return ""
  return JSON.stringify({
    id: draft.id ?? null,
    survey_id: draft.survey_id,
    name: draft.name.trim(),
    description: draft.description,
    is_active: draft.is_active,
    location_survey_ids: [...draft.location_survey_ids].sort(),
    nodes: sortDraftNodes(draft.nodes.map(normalizeNode)).map((node) => ({
      ...node,
      config: node.config ?? null,
    })),
  })
}

function hasUnsavedNewDraft(draft: FlowDraft | null) {
  if (!draft || draft.id) return false
  return Boolean(
    draft.name.trim() ||
      draft.description.trim() ||
      draft.location_survey_ids.length ||
      draft.nodes.length ||
      draft.is_active !== true,
  )
}

function CanvasFlowNode({ data }: NodeProps<Node<CanvasNodeData>>) {
  const showSource = data.kind !== "action"
  const Icon =
    data.kind === "trigger" ? Workflow : data.kind === "rule" ? Workflow : data.kind === "branch" ? GitBranch : Mail
  const accentClass =
    data.kind === "trigger"
      ? "bg-amber-50 text-amber-700 border-amber-200"
      : data.kind === "rule"
        ? "bg-violet-50 text-violet-700 border-violet-200"
        : data.kind === "branch"
          ? "bg-sky-50 text-sky-700 border-sky-200"
          : "bg-emerald-50 text-emerald-700 border-emerald-200"
  return (
    <div className="relative">
      {data.kind !== "trigger" ? <Handle type="target" position={Position.Left} className="!h-3 !w-3 !bg-zinc-300" /> : null}
      {showSource ? <Handle type="source" position={Position.Right} className="!h-3 !w-3 !bg-violet-500" /> : null}
      <button
        type="button"
        onClick={data.onSelect}
        className={[
          "w-[280px] rounded-2xl border bg-white px-4 py-4 text-left shadow-sm transition",
          data.selected
            ? "border-violet-500 shadow-md ring-2 ring-violet-200"
            : "border-zinc-200 hover:border-zinc-300 hover:shadow-md",
        ].join(" ")}
      >
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <span className={`inline-flex h-8 w-8 items-center justify-center rounded-xl border ${accentClass}`}>
                <Icon className="h-4 w-4" />
              </span>
              <span className="rounded-full bg-zinc-100 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wide text-zinc-600">
                {data.label}
              </span>
            </div>
            <p className="mt-3 font-semibold text-zinc-950">{data.title}</p>
            {data.subtitle ? <p className="mt-1 text-sm leading-5 text-zinc-500">{data.subtitle}</p> : null}
          </div>
          {data.onDelete ? (
            <span
              role="button"
              tabIndex={0}
              onClick={(event) => {
                event.stopPropagation()
                data.onDelete?.()
              }}
              onKeyDown={(event) => {
                if (event.key === "Enter" || event.key === " ") {
                  event.preventDefault()
                  event.stopPropagation()
                  data.onDelete?.()
                }
              }}
              className="rounded-lg p-1 text-zinc-400 hover:bg-zinc-100 hover:text-zinc-700"
            >
              <Trash2 className="h-4 w-4" />
            </span>
          ) : null}
        </div>
      </button>
    </div>
  )
}

function AddCanvasNode({ data }: NodeProps<Node<AddNodeData>>) {
  const [open, setOpen] = useState(false)
  return (
    <div className="relative flex items-center gap-3">
      <Handle type="target" position={Position.Left} className="!h-3 !w-3 !bg-zinc-300" />
      <button
        type="button"
        onClick={() => setOpen((current) => !current)}
        className="inline-flex h-12 w-12 items-center justify-center rounded-full border border-dashed border-violet-300 bg-white text-violet-600 shadow-sm transition hover:border-violet-400 hover:bg-violet-50"
      >
        <Plus className="h-4 w-4" />
      </button>
      <span className="rounded-full border border-zinc-200 bg-white px-3 py-1.5 text-xs font-medium text-zinc-500 shadow-sm">
        Add step
      </span>
      {open ? (
        <div className="absolute left-14 top-1/2 z-20 flex min-w-40 -translate-y-1/2 flex-col rounded-2xl border border-zinc-200 bg-white p-2 shadow-xl">
          {[
            { id: "rule", label: "Rule", icon: Workflow },
            { id: "branch", label: "Branch", icon: GitBranch },
            { id: "action", label: "Action", icon: Mail },
          ].map((item) => {
            const Icon = item.icon
            return (
              <button
                key={item.id}
                type="button"
                onClick={(e) => {
                  e.stopPropagation()
                  data.onAdd(item.id as "rule" | "branch" | "action")
                  setOpen(false)
                }}
                className="flex items-center gap-2 rounded-xl px-3 py-2 text-left text-sm text-zinc-700 hover:bg-zinc-50"
              >
                <Icon className="h-4 w-4 text-zinc-500" />
                <span>{item.label}</span>
              </button>
            )
          })}
        </div>
      ) : null}
    </div>
  )
}

// Orthogonal edge: exits source horizontally, bends once vertically, arrives at target horizontally.
// Exactly 2 right angles for any non-horizontal connection; a straight line when sourceY === targetY.
// When data.onInsert is present a small + pill is shown on the first horizontal segment, allowing
// a rule or branch node to be inserted between the source and target without needing to re-wire.
function OrthoEdge({ id, sourceX, sourceY, targetX, targetY, markerEnd, label, data }: EdgeProps) {
  const [insertOpen, setInsertOpen] = useState(false)
  const midX = (sourceX + targetX) / 2
  const edgePath = `M ${sourceX} ${sourceY} H ${midX} V ${targetY} H ${targetX}`
  const onInsert = (data as EdgeInsertData | undefined)?.onInsert
  // Insert pill sits on the first horizontal segment (avoids overlapping the Yes/No label on the vertical part)
  const pillX = (sourceX + midX) / 2
  const pillY = sourceY
  // Branch Yes/No label sits on the vertical segment
  const labelX = midX
  const labelY = (sourceY + targetY) / 2
  return (
    <>
      <path
        id={id}
        className="react-flow__edge-path"
        d={edgePath}
        fill="none"
        stroke="#a1a1aa"
        strokeWidth={2}
        markerEnd={markerEnd}
      />
      <path d={edgePath} fill="none" strokeOpacity={0} strokeWidth={20} className="react-flow__edge-interaction" />
      {label ? (
        <EdgeLabelRenderer>
          <div
            style={{ position: "absolute", transform: `translate(-50%, -50%) translate(${labelX}px, ${labelY}px)`, pointerEvents: "all" }}
            className="nodrag nopan rounded-full border border-zinc-200 bg-white px-2 py-0.5 text-xs font-semibold text-zinc-500 shadow-sm"
          >
            {String(label)}
          </div>
        </EdgeLabelRenderer>
      ) : null}
      {onInsert ? (
        <EdgeLabelRenderer>
          <div
            style={{ position: "absolute", transform: `translate(-50%, -50%) translate(${pillX}px, ${pillY}px)`, pointerEvents: "all" }}
            className="nodrag nopan relative"
          >
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); setInsertOpen((v) => !v) }}
              className="inline-flex h-5 items-center gap-0.5 rounded-full border border-violet-200 bg-white px-1.5 text-[11px] font-medium text-violet-500 shadow-sm transition hover:border-violet-400 hover:bg-violet-50 hover:text-violet-600"
            >
              <Plus className="h-2.5 w-2.5" />
            </button>
            {insertOpen ? (
              <div className="absolute bottom-full left-1/2 z-20 mb-1 flex min-w-36 -translate-x-1/2 flex-col rounded-xl border border-zinc-200 bg-white p-1 shadow-xl">
                {([{ id: "rule", label: "Insert rule", Icon: Workflow }, { id: "branch", label: "Insert branch", Icon: GitBranch }] as const).map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    onClick={(e) => { e.stopPropagation(); onInsert(item.id); setInsertOpen(false) }}
                    className="flex items-center gap-2 rounded-lg px-3 py-2 text-left text-sm text-zinc-700 hover:bg-zinc-50"
                  >
                    <item.Icon className="h-3.5 w-3.5 text-zinc-500" />
                    <span>{item.label}</span>
                  </button>
                ))}
              </div>
            ) : null}
          </div>
        </EdgeLabelRenderer>
      ) : null}
    </>
  )
}

// Defined at module level so React Flow never remounts nodes when the parent component re-renders.
// An inline object literal like `nodeTypes={{ flow: … }}` creates a new reference every render,
// which tricks React Flow into remounting every custom node and wiping their local state (e.g. the
// "open" state inside AddCanvasNode that controls the add-step dropdown).
const NODE_TYPES = { flow: CanvasFlowNode, add: AddCanvasNode }
const EDGE_TYPES = { ortho: OrthoEdge }

type Slot =
  | { kind: "node"; node: DraftNode }
  | { kind: "add"; parentId: string | null; branchType: FlowBranchType | null }

function FlowEditorPageImpl() {
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
  const [savedSnapshot, setSavedSnapshot] = useState("")
  const [flowMissing, setFlowMissing] = useState(false)
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

  function addNode(parentId: string | null, kind: "rule" | "branch" | "action", branchType: FlowBranchType | null) {
    const normalizedParentId = parentId === TRIGGER_NODE_ID ? null : parentId
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
              config: { rule_ids: [], match_type: "all", negate: false },
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
      message: "Delete this node and everything beneath it?",
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
      return nodes.filter((node) => !idsToDelete.has(node.id))
    })
    setSelectedNodeId(TRIGGER_NODE_ID)
  }

  function insertNodeBetween(targetNodeId: string, kind: "rule" | "branch") {
    const newNodeId = crypto.randomUUID()
    setNodes((nodes) => {
      const target = nodes.find((n) => n.id === targetNodeId)
      if (!target) return nodes
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
            ? { ...n, parent_id: newNodeId, branch_type: kind === "branch" ? ("TRUE" as FlowBranchType) : null }
            : n,
        ),
        newNode,
      ])
    })
    setSelectedNodeId(newNodeId)
    setError(null)
  }

  function validateDraft(currentDraft: FlowDraft): string | null {
    if (!currentDraft.name.trim()) return "Flow name is required."
    if (!currentDraft.location_survey_ids.length) return "Select at least one trigger location."
    const duplicate = existingFlows.find(
      (flow) => flow.id !== currentDraft.id && flow.name.trim().toLowerCase() === currentDraft.name.trim().toLowerCase(),
    )
    if (duplicate) return "Flow title must be unique within your company."
    const root = currentDraft.nodes.find((node) => node.parent_id === null)
    if (!root) return "Add at least one step after the trigger."

    const walk = (node: DraftNode): string | null => {
      if (node.node_type === "rule") {
        if (!node.rule_id) return "Every rule widget must reference a rule."
        const children = childrenOf(currentDraft.nodes, node.id)
        if (children.length !== 1) return "Rule widgets must connect to exactly one next step."
        return walk(children[0])
      }

      if (node.node_type === "branch") {
        const config = normalizeBranchConfig(node.config)
        if (!config.rule_conditions.length) return "Branch widgets must include at least one rule."
        const branchChildren = childrenOf(currentDraft.nodes, node.id)
        const hasTrue = branchChildren.some((child) => child.branch_type === "TRUE")
        const hasFalse = branchChildren.some((child) => child.branch_type === "FALSE")
        if (!hasTrue || !hasFalse) return "Branch widgets must define both Yes and No paths."
        for (const child of branchChildren) {
          const failure = walk(child)
          if (failure) return failure
        }
        return null
      }

      const config = normalizeActionConfig(node.action_type, node.config)
      if (node.action_type === "redirect") {
        if (config?.target === "custom_url" && !String(config.url ?? "").trim()) {
          return "Custom redirects require a URL."
        }
        if (config?.target === "google_business_url") {
          const missingLocation = selectedTriggerLocations.find((location) => !location.location_google_business_url)
          if (missingLocation) {
            return `Google redirect is missing a business URL for ${missingLocation.location_name}.`
          }
        }
      }
      if (node.action_type === "email") {
        if (config?.target === "custom_email" && !String(config.email ?? "").trim()) {
          return "Custom email actions require an email address."
        }
        if (config?.target === "notification_group" && !String(config.notification_group_id ?? "").trim()) {
          return "Notification-group email actions require a notification group."
        }
      }
      return null
    }

    return walk(root)
  }

  async function saveFlow() {
    const token = await getToken()
    if (!token || !draft) return

    const validationError = validateDraft(draft)
    if (validationError) {
      setError(validationError)
      return
    }

    setSaving(true)
    setError(null)
    try {
      const payload: FlowPayload = {
        name: draft.name.trim(),
        description: draft.description.trim() || null,
        is_active: draft.is_active,
        location_survey_ids: draft.location_survey_ids,
        nodes: sortDraftNodes(draft.nodes.map(normalizeNode)),
      }
      const saved = draft.id
        ? await updateSurveyFlow(token, draft.survey_id, draft.id, payload)
        : await createSurveyFlow(token, draft.survey_id, payload)
      const nextDraft = draftFromFlow(saved)
      setDraft(nextDraft)
      setSavedSnapshot(serializeDraft(nextDraft))
      setSelectedNodeId(TRIGGER_NODE_ID)
      hasFitView.current = false
      router.replace(`/dashboard/automations/flows/${saved.id}`)
    } catch (err) {
      setError(extractErrorMessage(err, "Failed to save flow"))
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

  function buildCanvas() {
    if (!draft) return { nodes: [] as Node[], edges: [] as Edge[] }

    const rfNodes: Node[] = []
    const rfEdges: Edge[] = []

    const root = draft.nodes.find((node) => node.parent_id === null) ?? null
    const rootSlot: Slot = root
      ? { kind: "node", node: root }
      : { kind: "add", parentId: TRIGGER_NODE_ID, branchType: null }

    const branchChildren = (nodeId: string, branchType: FlowBranchType) =>
      childrenOf(draft.nodes, nodeId).find((child) => child.branch_type === branchType) ?? null

    const linearChild = (nodeId: string) => childrenOf(draft.nodes, nodeId)[0] ?? null

    const measure = (slot: Slot): number => {
      if (slot.kind === "add") return 1
      if (slot.node.node_type === "branch") {
        const trueSlot: Slot = branchChildren(slot.node.id, "TRUE")
          ? { kind: "node", node: branchChildren(slot.node.id, "TRUE") as DraftNode }
          : { kind: "add", parentId: slot.node.id, branchType: "TRUE" }
        const falseSlot: Slot = branchChildren(slot.node.id, "FALSE")
          ? { kind: "node", node: branchChildren(slot.node.id, "FALSE") as DraftNode }
          : { kind: "add", parentId: slot.node.id, branchType: "FALSE" }
        return measure(trueSlot) + measure(falseSlot)
      }
      const child = linearChild(slot.node.id)
      return child ? measure({ kind: "node", node: child }) : 1
    }

    // Pre-compute which notification groups apply to the configured trigger locations
    const triggerLocationIds = locationSurveys
      .filter((ls) => draft.location_survey_ids.includes(ls.id))
      .map((ls) => ls.location_id)
    const applicableNotifGroups = notificationGroups.filter((ng) =>
      ng.location_ids.some((lid) => triggerLocationIds.includes(lid)),
    )
    const locationGroupEmailCount = (() => {
      const emails = new Set<string>()
      applicableNotifGroups.forEach((g) => g.members.forEach((m) => emails.add(m.email)))
      return emails.size
    })()

    const addEdge = (source: string, target: string, label?: string) => {
      const isRealNode = !target.startsWith("add:")
      rfEdges.push({
        id: `${source}-${target}-${label ?? "default"}`,
        source,
        target,
        label,
        type: "ortho",
        data: isRealNode
          ? ({ onInsert: (kind: "rule" | "branch") => insertNodeBetween(target, kind) } satisfies EdgeInsertData)
          : {},
        markerEnd: { type: MarkerType.ArrowClosed, width: 18, height: 18 },
      })
    }

    const pushFlowNode = (
      nodeId: string,
      position: { x: number; y: number },
      data: CanvasNodeData,
      style?: CSSProperties,
    ) => {
      rfNodes.push({
        id: nodeId,
        type: "flow",
        position,
        data,
        draggable: false,
        selectable: false,
        style,
      })
    }

    const placeSlot = (slot: Slot, depth: number, startRow: number): { id: string; height: number; centerY: number } => {
      const height = measure(slot)
      const centerY = (startRow + height / 2 - 0.5) * ROW_GAP
      const x = depth * COL_GAP

      if (slot.kind === "add") {
        const addId = `add:${slot.parentId ?? "root"}:${slot.branchType ?? "none"}`
        rfNodes.push({
          id: addId,
          type: "add",
          position: { x, y: centerY },
          data: {
            onAdd: (kind: "rule" | "branch" | "action") => addNode(slot.parentId, kind, slot.branchType),
          },
          draggable: false,
          selectable: false,
        })
        return { id: addId, height, centerY }
      }

      const node = slot.node
      const rule = node.rule_id ? rulesById.get(node.rule_id) : null
      const branchConfig = normalizeBranchConfig(node.config)
      const actionConfig = normalizeActionConfig(node.action_type, node.config)

      const emailAddressCount =
        node.node_type === "action" && node.action_type === "email"
          ? actionConfig?.target === "custom_email"
            ? String(actionConfig.email ?? "").trim()
              ? 1
              : 0
            : actionConfig?.target === "notification_group"
              ? (notificationGroups.find((g) => g.id === String(actionConfig.notification_group_id ?? ""))?.members
                  .length ?? 0)
              : locationGroupEmailCount
          : 0

      const title =
        node.node_type === "rule"
          ? rule?.name || "Select a rule"
          : node.node_type === "branch"
            ? "Branch"
            : node.action_type === "email"
              ? "Send an email"
              : "Redirect to Google"
      const subtitle =
        node.node_type === "rule"
          ? rule?.description || "Check a rule."
          : node.node_type === "branch"
            ? `${branchConfig.rule_conditions.length} rule${branchConfig.rule_conditions.length === 1 ? "" : "s"} · ${String(branchConfig.match_type).toUpperCase()}`
            : node.action_type === "email"
              ? `Send to ${emailAddressCount} address${emailAddressCount !== 1 ? "es" : ""}`
              : actionConfig?.target === "custom_url"
                ? String(actionConfig.url ?? "") || "Set a custom URL"
                : "Use location Google Business URL"

      pushFlowNode(node.id, { x, y: centerY }, {
        kind: node.node_type,
        label: node.node_type,
        title,
        subtitle,
        selected: selectedNodeId === node.id,
        onSelect: () => setSelectedNodeId(node.id),
        onDelete: () => void removeNodeCascade(node.id),
      })

      if (node.node_type === "branch") {
        const trueChild = branchChildren(node.id, "TRUE")
        const falseChild = branchChildren(node.id, "FALSE")
        const trueSlot: Slot = trueChild
          ? { kind: "node", node: trueChild }
          : { kind: "add", parentId: node.id, branchType: "TRUE" }
        const falseSlot: Slot = falseChild
          ? { kind: "node", node: falseChild }
          : { kind: "add", parentId: node.id, branchType: "FALSE" }
        const trueHeight = measure(trueSlot)
        const truePlaced = placeSlot(trueSlot, depth + 1, startRow)
        const falsePlaced = placeSlot(falseSlot, depth + 1, startRow + trueHeight)
        addEdge(node.id, truePlaced.id, "Yes")
        addEdge(node.id, falsePlaced.id, "No")
      } else if (node.node_type !== "action") {
        const child = linearChild(node.id)
        const childSlot: Slot = child
          ? { kind: "node", node: child }
          : { kind: "add", parentId: node.id, branchType: null }
        const placed = placeSlot(childSlot, depth + 1, startRow)
        addEdge(node.id, placed.id)
      }

      return { id: node.id, height, centerY }
    }

    const triggerHeight = measure(rootSlot)
    const triggerY = (triggerHeight / 2 - 0.5) * ROW_GAP
    pushFlowNode(TRIGGER_NODE_ID, { x: 0, y: triggerY }, {
      kind: "trigger",
      label: "trigger",
      title: "Trigger",
      subtitle:
        draft.location_survey_ids.length > 0
          ? `Survey submissions from ${draft.location_survey_ids.length} location${draft.location_survey_ids.length === 1 ? "" : "s"} will trigger this flow`
          : "Choose the submission locations that will trigger this flow",
      selected: selectedNodeId === TRIGGER_NODE_ID,
      onSelect: () => setSelectedNodeId(TRIGGER_NODE_ID),
    })

    const placedRoot = placeSlot(rootSlot, 1, 0)
    addEdge(TRIGGER_NODE_ID, placedRoot.id)
    return { nodes: rfNodes, edges: rfEdges }
  }

  const canvas = buildCanvas()

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
        <Loader2 className="h-6 w-6 animate-spin text-violet-500" />
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
        <Button onClick={() => void saveFlow()} disabled={saving}>
          {saving ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <Save className="mr-1.5 h-4 w-4" />}
          Save flow
        </Button>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-6 py-6">
        {error ? (
          <div className="mb-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            {error}
          </div>
        ) : null}

        <Card className="relative mb-6 overflow-hidden p-0">
          <div className="absolute right-4 top-4 z-10">
            <Button
              variant="outline"
              onClick={() => flowRef.current?.fitView({ padding: 0.45, duration: 300 })}
            >
              <RotateCcw className="mr-1.5 h-4 w-4" />
              Reset view
            </Button>
          </div>

          <div className="h-[540px] w-full bg-[radial-gradient(circle_at_1px_1px,rgba(113,113,122,0.18)_1px,transparent_0)] bg-[size:28px_28px]">
            <ReactFlow
              className="h-full w-full"
              nodes={canvas.nodes}
              edges={canvas.edges}
              nodeTypes={NODE_TYPES}
              edgeTypes={EDGE_TYPES}
              nodeOrigin={[0, 0.5]}
              fitView
              fitViewOptions={{ padding: 0.45 }}
              minZoom={0.35}
              maxZoom={1.4}
              proOptions={{ hideAttribution: true }}
              onInit={(instance) => {
                flowRef.current = instance
              }}
              onPaneClick={() => setSelectedNodeId(TRIGGER_NODE_ID)}
              onNodeClick={() => {
                // Providing this handler makes React Flow set pointer-events: all on every
                // node wrapper, even nodes with selectable:false + draggable:false.
                // Without it, pointer-events would be "none" and clicks inside the node
                // (e.g. the + button in AddCanvasNode) would be swallowed.
              }}
            >
              <Background gap={28} size={1} color="#d4d4d8" />
            </ReactFlow>
          </div>
        </Card>

        <Card className="min-h-[220px]">
          <div className="space-y-5">
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

            {/* ── Trigger ── */}
            {selectedNodeId === TRIGGER_NODE_ID ? (
              <label className="block">
                <span className="text-sm font-medium text-zinc-700">Submission locations that will trigger this flow</span>
                <div className="mt-1">
                  <DropdownSelect
                    options={locationSurveys.map((item) => ({
                      value: item.id,
                      label: `${item.location_name} · ${item.survey_name}`,
                    }))}
                    value={draft.location_survey_ids}
                    multiple
                    placeholder="Select trigger locations"
                    onChange={(next) =>
                      setDraft((current) => (current ? { ...current, location_survey_ids: next as string[] } : current))
                    }
                  />
                </div>
              </label>
            ) : null}

            {/* ── Rule ── */}
            {selectedNode?.node_type === "rule" ? (
              <>
                <label className="block">
                  <span className="text-sm font-medium text-zinc-700">Rule</span>
                  <div className="mt-1">
                    <SingleSelectDropdown
                      options={rules.map((rule) => ({ value: rule.id, label: rule.name }))}
                      value={selectedNode.rule_id ?? ""}
                      onChange={(value) => updateSelectedNode((node) => ({ ...node, rule_id: value }))}
                    />
                  </div>
                </label>
                <div className="rounded-2xl border border-zinc-200 bg-zinc-50 px-4 py-3 text-sm text-zinc-600">
                  {selectedNode.rule_id
                    ? rulesById.get(selectedNode.rule_id)?.description || "No description available."
                    : "Select a rule to preview its description."}
                </div>
              </>
            ) : null}

            {/* ── Branch ── */}
            {selectedNode?.node_type === "branch" && selectedBranchConfig ? (() => {
              const conditions = selectedBranchConfig.rule_conditions
              const matchType = selectedBranchConfig.match_type
              const availableRules = rules.filter((r) => !conditions.find((c) => c.rule_id === r.id))
              return (
                <div className="space-y-3">
                  {/* Add rule */}
                  <label className="block">
                    <span className="text-sm font-medium text-zinc-700">Add rule to condition</span>
                    <select
                      className="mt-1 w-full rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-700 outline-none focus:ring-2 focus:ring-violet-500"
                      value=""
                      onChange={(e) => {
                        const ruleId = e.target.value
                        if (!ruleId) return
                        updateSelectedNode((node) => ({
                          ...node,
                          config: { rule_conditions: [...conditions, { rule_id: ruleId, expected: true }], match_type: matchType },
                        }))
                      }}
                    >
                      <option value="">Select rule to add…</option>
                      {availableRules.map((r) => (
                        <option key={r.id} value={r.id}>{r.name}</option>
                      ))}
                    </select>
                  </label>

                  {/* Rule list */}
                  {conditions.length > 0 ? (
                    <div className="rounded-xl border border-zinc-200 bg-white">
                      {conditions.map((condition, idx) => (
                        <div key={condition.rule_id}>
                          {/* AND / OR pill between items */}
                          {idx > 0 ? (
                            <div className="flex justify-center py-1">
                              <button
                                type="button"
                                onClick={() =>
                                  updateSelectedNode((node) => ({
                                    ...node,
                                    config: { rule_conditions: conditions, match_type: matchType === "all" ? "any" : "all" },
                                  }))
                                }
                                className="rounded-full border border-zinc-200 bg-zinc-50 px-3 py-0.5 text-xs font-semibold text-zinc-500 transition hover:border-violet-300 hover:bg-violet-50 hover:text-violet-600"
                              >
                                {matchType === "all" ? "AND" : "OR"}
                              </button>
                            </div>
                          ) : null}
                          <div className="flex items-center gap-2 px-3 py-2">
                            <span className="min-w-0 flex-1 truncate text-sm font-medium text-zinc-800">
                              {rulesById.get(condition.rule_id)?.name ?? condition.rule_id}
                            </span>
                            <select
                              className="rounded-lg border border-zinc-200 bg-white px-2 py-1 text-xs font-medium text-zinc-700 outline-none focus:ring-2 focus:ring-violet-500"
                              value={condition.expected ? "true" : "false"}
                              onChange={(e) =>
                                updateSelectedNode((node) => ({
                                  ...node,
                                  config: {
                                    rule_conditions: conditions.map((c) =>
                                      c.rule_id === condition.rule_id ? { ...c, expected: e.target.value === "true" } : c,
                                    ),
                                    match_type: matchType,
                                  },
                                }))
                              }
                            >
                              <option value="true">True</option>
                              <option value="false">False</option>
                            </select>
                            <button
                              type="button"
                              onClick={() =>
                                updateSelectedNode((node) => ({
                                  ...node,
                                  config: {
                                    rule_conditions: conditions.filter((c) => c.rule_id !== condition.rule_id),
                                    match_type: matchType,
                                  },
                                }))
                              }
                              className="rounded-md p-1 text-zinc-400 transition hover:bg-zinc-100 hover:text-zinc-700"
                            >
                              <X className="h-3.5 w-3.5" />
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-sm text-zinc-400">No rules added yet. Add at least one rule.</p>
                  )}
                </div>
              )
            })() : null}

            {/* ── Action ── */}
            {selectedNode?.node_type === "action" && selectedActionConfig ? (
              <div className="space-y-4">
                <label className="block">
                  <span className="text-sm font-medium text-zinc-700">Action type</span>
                  <div className="mt-1">
                    <SingleSelectDropdown
                      options={[
                        { value: "redirect", label: "Google redirect" },
                        { value: "email", label: "Send an email" },
                      ]}
                      value={selectedNode.action_type ?? "redirect"}
                      onChange={(value) =>
                        updateSelectedNode((node) => ({
                          ...node,
                          action_type: value as FlowActionType,
                          config:
                            value === "redirect"
                              ? { target: "google_business_url" }
                              : { target: "location_notification_groups" },
                        }))
                      }
                    />
                  </div>
                </label>

                {selectedNode.action_type === "redirect" ? (
                  <>
                    <label className="block">
                      <span className="text-sm font-medium text-zinc-700">Redirect source</span>
                      <div className="mt-1">
                        <SingleSelectDropdown
                          options={[
                            { value: "google_business_url", label: "Use the location Google Business URL" },
                            { value: "custom_url", label: "Use a custom redirect URL" },
                          ]}
                          value={String(selectedActionConfig.target ?? "google_business_url")}
                          onChange={(value) =>
                            updateSelectedNode((node) => ({
                              ...node,
                              config:
                                value === "custom_url"
                                  ? { target: "custom_url", url: String(selectedActionConfig.url ?? "") }
                                  : { target: "google_business_url" },
                            }))
                          }
                        />
                      </div>
                    </label>
                    {selectedActionConfig.target === "custom_url" ? (
                      <label className="block">
                        <span className="text-sm font-medium text-zinc-700">Custom URL</span>
                        <input
                          className="mt-1 w-full rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-violet-500"
                          value={String(selectedActionConfig.url ?? "")}
                          onChange={(event) =>
                            updateSelectedNode((node) => ({
                              ...node,
                              config: { target: "custom_url", url: event.target.value },
                            }))
                          }
                        />
                      </label>
                    ) : (
                      <div className="rounded-2xl border border-zinc-200 bg-zinc-50 px-4 py-3 text-sm text-zinc-600">
                        {selectedTriggerLocations.length === 0 ? (
                          <p>Select trigger locations to preview the Google Business URLs used by this action.</p>
                        ) : (
                          <div className="space-y-2">
                            {selectedTriggerLocations.map((location) => (
                              <div key={location.id}>
                                <p className="font-medium text-zinc-700">{location.location_name}</p>
                                <p className={location.location_google_business_url ? "text-zinc-500" : "text-red-600"}>
                                  {location.location_google_business_url || "Missing Google Business URL"}
                                </p>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    )}
                  </>
                ) : (
                  <>
                    <label className="block">
                      <span className="text-sm font-medium text-zinc-700">Send email to</span>
                      <div className="mt-1">
                        <SingleSelectDropdown
                          options={[
                            { value: "custom_email", label: "A custom email address" },
                            { value: "notification_group", label: "A single notification group" },
                            { value: "location_notification_groups", label: "All notification groups at the submission location" },
                          ]}
                          value={String(selectedActionConfig.target ?? "location_notification_groups")}
                          onChange={(value) =>
                            updateSelectedNode((node) => ({
                              ...node,
                              config:
                                value === "custom_email"
                                  ? { target: "custom_email", email: "" }
                                  : value === "notification_group"
                                    ? { target: "notification_group", notification_group_id: "" }
                                    : { target: "location_notification_groups" },
                            }))
                          }
                        />
                      </div>
                    </label>

                    {selectedActionConfig.target === "custom_email" ? (
                      <label className="block">
                        <span className="text-sm font-medium text-zinc-700">Email address</span>
                        <input
                          className="mt-1 w-full rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-violet-500"
                          value={String(selectedActionConfig.email ?? "")}
                          onChange={(event) =>
                            updateSelectedNode((node) => ({
                              ...node,
                              config: { target: "custom_email", email: event.target.value },
                            }))
                          }
                        />
                      </label>
                    ) : null}

                    {selectedActionConfig.target === "notification_group" ? (
                      <>
                        <label className="block">
                          <span className="text-sm font-medium text-zinc-700">Notification group</span>
                          <div className="mt-1">
                            <SingleSelectDropdown
                              options={notificationGroups.map((group) => ({ value: group.id, label: group.name }))}
                              value={String(selectedActionConfig.notification_group_id ?? "")}
                              onChange={(value) =>
                                updateSelectedNode((node) => ({
                                  ...node,
                                  config: { target: "notification_group", notification_group_id: value },
                                }))
                              }
                            />
                          </div>
                        </label>
                        {(() => {
                          const group = notificationGroups.find(
                            (g) => g.id === String(selectedActionConfig.notification_group_id ?? ""),
                          )
                          return group ? (
                            <div className="rounded-2xl border border-zinc-200 bg-zinc-50 px-4 py-3 text-sm text-zinc-600">
                              <p className="font-medium text-zinc-700">{group.name}</p>
                              <p className="mt-0.5">{group.members.length} member{group.members.length !== 1 ? "s" : ""}</p>
                            </div>
                          ) : null
                        })()}
                      </>
                    ) : null}

                    {selectedActionConfig.target === "location_notification_groups" ? (
                      <div className="rounded-2xl border border-zinc-200 bg-zinc-50 px-4 py-3 text-sm text-zinc-600">
                        {selectedTriggerLocations.length === 0 ? (
                          <p>Select trigger locations to preview which notification groups will receive this email.</p>
                        ) : (() => {
                          const triggerLocIds = selectedTriggerLocations.map((ls) => ls.location_id)
                          const groups = notificationGroups.filter((ng) =>
                            ng.location_ids.some((lid) => triggerLocIds.includes(lid)),
                          )
                          if (groups.length === 0) {
                            return <p>No notification groups are assigned to the selected trigger locations.</p>
                          }
                          return (
                            <div className="space-y-2">
                              {groups.map((group) => (
                                <div key={group.id}>
                                  <p className="font-medium text-zinc-700">{group.name}</p>
                                  <p className="mt-0.5">{group.members.length} member{group.members.length !== 1 ? "s" : ""}</p>
                                </div>
                              ))}
                            </div>
                          )
                        })()}
                      </div>
                    ) : null}
                  </>
                )}
              </div>
            ) : null}
          </div>
        </Card>
      </div>
    </div>
  )
}

export default function FlowEditorPage() {
  return <FlowEditorPageImpl />
}
