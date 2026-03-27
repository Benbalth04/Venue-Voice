import type { CSSProperties } from "react"
import { MarkerType, type Edge, type Node } from "@xyflow/react"
import type { FlowBranchType, LocationSurveyResponse, NotificationGroupResponse } from "@/lib/api/client"
import { COL_GAP, ROW_GAP, TRIGGER_NODE_ID } from "./constants"
import { canonicalParentId, childrenOf, normalizeActionConfig, normalizeBranchConfig } from "./draftUtils"
import type { AddNodeData, CanvasNodeData, DraftNode, EdgeInsertData, FlowDraft, RuleSummary, Slot } from "./types"

export type BuildFlowCanvasParams = {
  draft: FlowDraft
  selectedNodeId: string
  validationHighlightNodeId: string | null
  rulesById: Map<string, RuleSummary>
  brokenRuleIds: Set<string>
  brokenActionNodeIds: Set<string>
  locationSurveys: LocationSurveyResponse[]
  notificationGroups: NotificationGroupResponse[]
  setSelectedNodeId: (id: string) => void
  addNode: (parentId: string | null, kind: "rule" | "branch" | "action" | "terminate", branchType: FlowBranchType | null) => void
  insertNodeBetween: (targetNodeId: string, kind: "rule" | "branch" | "action" | "terminate") => void
  removeNodeCascade: (nodeId: string) => void | Promise<void>
}

export function buildFlowCanvas(params: BuildFlowCanvasParams): { nodes: Node[]; edges: Edge[] } {
  const {
    draft,
    selectedNodeId,
    validationHighlightNodeId,
    rulesById,
    brokenRuleIds,
    brokenActionNodeIds,
    locationSurveys,
    notificationGroups,
    setSelectedNodeId,
    addNode,
    insertNodeBetween,
    removeNodeCascade,
  } = params

  const rfNodes: Node[] = []
  const rfEdges: Edge[] = []

  const root = draft.nodes.find((node) => canonicalParentId(node.parent_id) === null) ?? null
  const rootSlot: Slot = root ? { kind: "node", node: root } : { kind: "add", parentId: TRIGGER_NODE_ID, branchType: null }

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

  const nodeTypeForEdgeEnd = (nodeId: string): string | undefined => {
    if (nodeId === TRIGGER_NODE_ID) return "trigger"
    return draft.nodes.find((n) => n.id === nodeId)?.node_type
  }

  const addEdge = (source: string, target: string, label?: string, targetNodeType?: string) => {
    const isRealNode = !target.startsWith("add:")
    const sourceType = nodeTypeForEdgeEnd(source)
    const insertOptions: ReadonlyArray<"rule" | "branch" | "action" | "terminate"> =
      sourceType === "action"
        ? ["action", "terminate"]
        : targetNodeType === "action"
          ? ["rule", "branch", "action"]
          : ["rule", "branch"]
    rfEdges.push({
      id: `${source}-${target}-${label ?? "default"}`,
      source,
      target,
      label,
      type: "ortho",
      selectable: false,
      focusable: false,
      interactionWidth: 0,
      data: isRealNode
        ? ({
            onInsert: (kind: "rule" | "branch" | "action" | "terminate") => insertNodeBetween(target, kind),
            insertOptions,
          } satisfies EdgeInsertData)
        : {},
      markerEnd: { type: MarkerType.ArrowClosed, width: 18, height: 18 },
    })
  }

  const pushFlowNode = (
    rfType: "trigger" | "rule" | "branch" | "action" | "terminate",
    nodeId: string,
    position: { x: number; y: number },
    data: CanvasNodeData,
    style?: CSSProperties,
  ) => {
    rfNodes.push({
      id: nodeId,
      type: rfType,
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
      const parentIdForLookup = slot.parentId === TRIGGER_NODE_ID ? null : slot.parentId
      const parentNode = parentIdForLookup ? (draft.nodes.find((n) => n.id === parentIdForLookup) ?? null) : null
      const chainAfterAction = parentNode?.node_type === "action"
      rfNodes.push({
        id: addId,
        type: "add",
        position: { x, y: centerY },
        data: {
          chainAfterAction,
          onAdd: (kind: "rule" | "branch" | "action" | "terminate") => addNode(slot.parentId, kind, slot.branchType),
        } satisfies AddNodeData,
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
          : node.node_type === "terminate"
            ? "Terminate"
            : node.action_type === "email"
              ? "Send an Email"
              : "Redirect to a Webpage"
    const subtitle =
      node.node_type === "rule"
        ? rule?.description || "Check a rule."
        : node.node_type === "branch"
          ? `Checking ${branchConfig.rule_conditions.length} rule${branchConfig.rule_conditions.length === 1 ? "" : "s"}`
          : node.node_type === "terminate"
            ? "Terminate the execution of the flow."
            : node.action_type === "email"
              ? `Send to ${emailAddressCount} address${emailAddressCount !== 1 ? "es" : ""}`
              : actionConfig?.target === "custom_url"
                ? String(actionConfig.url ?? "") || "Set a custom redirect URL"
                : "Use the trigger location's Google Business URL"

    const canvasKind = node.node_type as CanvasNodeData["kind"]

    const brokenRuleHighlight =
      node.node_type === "rule"
        ? !!node.rule_id && brokenRuleIds.has(node.rule_id)
        : node.node_type === "branch"
          ? branchConfig.rule_conditions.some((c) => brokenRuleIds.has(c.rule_id))
          : node.node_type === "action"
            ? brokenActionNodeIds.has(node.id)
            : false

    pushFlowNode(
      node.node_type,
      node.id,
      { x, y: centerY },
      {
        kind: canvasKind,
        label: node.node_type,
        title,
        subtitle,
        selected: selectedNodeId === node.id,
        errorHighlight: validationHighlightNodeId === node.id,
        brokenRuleHighlight,
        onSelect: () => setSelectedNodeId(node.id),
        onDelete: () => void removeNodeCascade(node.id),
      },
    )

    if (node.node_type === "branch") {
      const trueChild = branchChildren(node.id, "TRUE")
      const falseChild = branchChildren(node.id, "FALSE")
      const trueSlot: Slot = trueChild ? { kind: "node", node: trueChild } : { kind: "add", parentId: node.id, branchType: "TRUE" }
      const falseSlot: Slot = falseChild ? { kind: "node", node: falseChild } : { kind: "add", parentId: node.id, branchType: "FALSE" }
      const trueHeight = measure(trueSlot)
      const truePlaced = placeSlot(trueSlot, depth + 1, startRow)
      const falsePlaced = placeSlot(falseSlot, depth + 1, startRow + trueHeight)
      addEdge(node.id, truePlaced.id, "True", trueChild?.node_type)
      addEdge(node.id, falsePlaced.id, "False", falseChild?.node_type)
    } else if (node.node_type !== "terminate") {
      const child = linearChild(node.id)
      const childSlot: Slot = child ? { kind: "node", node: child } : { kind: "add", parentId: node.id, branchType: null }
      const placed = placeSlot(childSlot, depth + 1, startRow)
      addEdge(node.id, placed.id, undefined, child?.node_type)
    }

    return { id: node.id, height, centerY }
  }

  const triggerHeight = measure(rootSlot)
  const triggerY = (triggerHeight / 2 - 0.5) * ROW_GAP
  pushFlowNode(
    "trigger",
    TRIGGER_NODE_ID,
    { x: 0, y: triggerY },
    {
      kind: "trigger",
      label: "trigger",
      title: "Trigger",
      subtitle:
        draft.location_survey_ids.length > 0
          ? `Survey submissions from ${draft.location_survey_ids.length} location${draft.location_survey_ids.length === 1 ? "" : "s"} will trigger this flow`
          : "Choose the submission locations that will trigger this flow",
      selected: selectedNodeId === TRIGGER_NODE_ID,
      errorHighlight: validationHighlightNodeId === TRIGGER_NODE_ID,
      onSelect: () => setSelectedNodeId(TRIGGER_NODE_ID),
    },
  )

  const placedRoot = placeSlot(rootSlot, 1, 0)
  addEdge(TRIGGER_NODE_ID, placedRoot.id)
  return { nodes: rfNodes, edges: rfEdges }
}
