import { MarkerType, type Edge, type Node } from "@xyflow/react"
import type { FlowBranchType } from "@/lib/api/client"
import { COL_GAP, ROW_GAP, TRIGGER_NODE_ID } from "./constants"
import { canonicalParentId, childrenOf, normalizeActionConfig, normalizeBranchConfig } from "./draftUtils"
import type { DraftNode, FlowDraft, Slot } from "./types"

export type RuleInfo = { name: string; description: string | null }

export type TraceRuleResult = { rule_id: string; expected: boolean; result: boolean; match: boolean }

export type TraceNode =
  | { type: "rule"; rule_id: string; result: boolean }
  | { type: "branch"; match_type: string; rules: TraceRuleResult[]; result: boolean }
  | { type: "action"; action_type: string; executed: boolean }
  | { type: "terminate" }

export type ReadOnlyNodeData = {
  kind: "trigger" | "rule" | "branch" | "action" | "terminate"
  label: string
  title: string
  subtitleLines: string[]
  executed: boolean
}

export function buildReadOnlyCanvas(
  draft: FlowDraft,
  executedNodeIds: Set<string>,
  rulesById: Map<string, RuleInfo>,
  traceByNodeId: Map<string, TraceNode>,
): { nodes: Node[]; edges: Edge[] } {
  const rfNodes: Node[] = []
  const rfEdges: Edge[] = []

  const root = draft.nodes.find((node) => canonicalParentId(node.parent_id) === null) ?? null
  const rootSlot: Slot = root
    ? { kind: "node", node: root }
    : { kind: "add", parentId: TRIGGER_NODE_ID, branchType: null }

  const branchChild = (nodeId: string, branchType: FlowBranchType) =>
    childrenOf(draft.nodes, nodeId).find((child) => child.branch_type === branchType) ?? null

  const linearChild = (nodeId: string) => childrenOf(draft.nodes, nodeId)[0] ?? null

  const measure = (slot: Slot): number => {
    if (slot.kind === "add") return 1
    if (slot.node.node_type === "branch") {
      const trueChild = branchChild(slot.node.id, "TRUE")
      const falseChild = branchChild(slot.node.id, "FALSE")
      const trueSlot: Slot = trueChild
        ? { kind: "node", node: trueChild }
        : { kind: "add", parentId: slot.node.id, branchType: "TRUE" }
      const falseSlot: Slot = falseChild
        ? { kind: "node", node: falseChild }
        : { kind: "add", parentId: slot.node.id, branchType: "FALSE" }
      return measure(trueSlot) + measure(falseSlot)
    }
    const child = linearChild(slot.node.id)
    return child ? measure({ kind: "node", node: child }) : 1
  }

  const addEdge = (source: string, target: string, label?: string) => {
    rfEdges.push({
      id: `${source}-${target}-${label ?? "default"}`,
      source,
      target,
      label,
      type: "ortho-readonly",
      selectable: false,
      focusable: false,
      interactionWidth: 0,
      data: {},
      markerEnd: { type: MarkerType.ArrowClosed, width: 18, height: 18 },
    })
  }

  const buildNodeContent = (
    node: DraftNode,
  ): { title: string; subtitleLines: string[] } => {
    const trace = traceByNodeId.get(node.id)

    if (node.node_type === "rule") {
      const ruleInfo = node.rule_id ? rulesById.get(node.rule_id) : null
      const title = ruleInfo?.name ?? "Rule"
      const subtitleLines: string[] = []
      if (ruleInfo?.description) subtitleLines.push(ruleInfo.description)
      if (trace?.type === "rule") {
        subtitleLines.push(`Result: ${trace.result ? "True ✓" : "False ✗"}`)
      }
      return { title, subtitleLines }
    }

    if (node.node_type === "branch") {
      const branchConfig = normalizeBranchConfig(node.config)
      const matchLabel = branchConfig.match_type === "any" ? "Any of" : "All of"

      if (trace?.type === "branch") {
        // Show actual per-rule results from the execution trace
        const ruleLines = trace.rules.map((r) => {
          const name = rulesById.get(r.rule_id)?.name ?? r.rule_id.slice(0, 8)
          const expected = r.expected ? "true" : "false"
          const passed = r.match ? "✓" : "✗"
          return `${passed} ${name} = ${expected}`
        })
        const overallLabel = trace.result ? "→ True" : "→ False"
        return {
          title: "Branch",
          subtitleLines: [`${matchLabel} must match:`, ...ruleLines, overallLabel],
        }
      }

      // Not executed — show configuration only
      const ruleNames = branchConfig.rule_conditions.map(
        (rc) => rulesById.get(rc.rule_id)?.name ?? rc.rule_id.slice(0, 8),
      )
      return {
        title: "Branch",
        subtitleLines: [
          `${matchLabel} must match:`,
          ...ruleNames,
        ],
      }
    }

    if (node.node_type === "terminate") {
      return { title: "Terminate", subtitleLines: ["Terminate the execution of the flow."] }
    }

    // Action node
    const actionConfig = normalizeActionConfig(node.action_type, node.config)
    if (node.action_type === "email") {
      return { title: "Send an Email", subtitleLines: [] }
    }
    const redirectSubtitle =
      actionConfig?.target === "custom_url"
        ? String(actionConfig.url ?? "") || "Custom URL"
        : "Google Business URL"
    return { title: "Redirect to a Webpage", subtitleLines: [redirectSubtitle] }
  }

  // Returns null if this slot has no real node to render (i.e. "add" kind).
  const placeSlot = (
    slot: Slot,
    depth: number,
    startRow: number,
  ): { id: string; centerY: number } | null => {
    const height = measure(slot)
    const centerY = (startRow + height / 2 - 0.5) * ROW_GAP
    const x = depth * COL_GAP

    if (slot.kind === "add") return null

    const node = slot.node
    const { title, subtitleLines } = buildNodeContent(node)
    const executed = executedNodeIds.has(node.id)

    rfNodes.push({
      id: node.id,
      type: node.node_type,
      position: { x, y: centerY },
      data: {
        kind: node.node_type,
        label: node.node_type,
        title,
        subtitleLines,
        executed,
      } satisfies ReadOnlyNodeData,
      draggable: false,
      selectable: false,
      focusable: false,
    })

    if (node.node_type === "branch") {
      const trueChild = branchChild(node.id, "TRUE")
      const falseChild = branchChild(node.id, "FALSE")
      const trueSlot: Slot = trueChild
        ? { kind: "node", node: trueChild }
        : { kind: "add", parentId: node.id, branchType: "TRUE" }
      const falseSlot: Slot = falseChild
        ? { kind: "node", node: falseChild }
        : { kind: "add", parentId: node.id, branchType: "FALSE" }
      const trueHeight = measure(trueSlot)
      const truePlaced = placeSlot(trueSlot, depth + 1, startRow)
      const falsePlaced = placeSlot(falseSlot, depth + 1, startRow + trueHeight)
      if (truePlaced) addEdge(node.id, truePlaced.id, "True")
      if (falsePlaced) addEdge(node.id, falsePlaced.id, "False")
    } else if (node.node_type !== "terminate") {
      const child = linearChild(node.id)
      if (child) {
        const placed = placeSlot({ kind: "node", node: child }, depth + 1, startRow)
        if (placed) addEdge(node.id, placed.id)
      }
    }

    return { id: node.id, centerY }
  }

  // Trigger node — always executed
  const triggerHeight = measure(rootSlot)
  const triggerY = (triggerHeight / 2 - 0.5) * ROW_GAP
  rfNodes.push({
    id: TRIGGER_NODE_ID,
    type: "trigger",
    position: { x: 0, y: triggerY },
    data: {
      kind: "trigger",
      label: "trigger",
      title: "Trigger",
      subtitleLines: [
        `${draft.location_survey_ids.length} location${draft.location_survey_ids.length === 1 ? "" : "s"}`,
      ],
      executed: true,
    } satisfies ReadOnlyNodeData,
    draggable: false,
    selectable: false,
    focusable: false,
  })

  const placedRoot = placeSlot(rootSlot, 1, 0)
  if (placedRoot) addEdge(TRIGGER_NODE_ID, placedRoot.id)

  return { nodes: rfNodes, edges: rfEdges }
}
