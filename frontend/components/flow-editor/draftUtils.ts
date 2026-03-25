import type {
  FlowActionType,
  FlowBranchMatchType,
  FlowEmailTargetType,
  FlowRedirectTargetType,
  FlowResponse,
} from "@/lib/api/client"
import type { BranchRuleCondition, DraftNode, FlowDraft } from "./types"

export function makeDraftNode(overrides: Partial<DraftNode>): DraftNode {
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

export function sortDraftNodes(nodes: DraftNode[]) {
  return nodes.map((node, index) => ({ ...node, position: index }))
}

export function normalizeActionConfig(
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

export function normalizeBranchConfig(config: Record<string, unknown> | null | undefined): {
  rule_conditions: BranchRuleCondition[]
  match_type: FlowBranchMatchType
} {
  const current = { ...(config ?? {}) }
  const matchType: FlowBranchMatchType = current.match_type === "any" ? "any" : "all"
  if (Array.isArray(current.rule_conditions)) {
    const conditions = (current.rule_conditions as Array<Record<string, unknown>>)
      .filter((rc) => typeof rc.rule_id === "string" && rc.rule_id)
      .map((rc) => ({ rule_id: String(rc.rule_id), expected: rc.expected !== false }))
    return { rule_conditions: conditions, match_type: matchType }
  }
  // Old rows in DB may still store rule_ids + negate; fold into rule_conditions once when loading.
  const ruleIds = Array.isArray(current.rule_ids)
    ? current.rule_ids.map((value) => String(value)).filter(Boolean)
    : []
  const negate = Boolean(current.negate)
  return {
    rule_conditions: ruleIds.map((rule_id) => ({ rule_id, expected: !negate })),
    match_type: matchType,
  }
}

export function normalizeNode(node: DraftNode): DraftNode {
  if (node.node_type === "branch") {
    const { rule_conditions, match_type } = normalizeBranchConfig(node.config)
    return { ...node, config: { rule_conditions, match_type } }
  }
  if (node.node_type === "action") {
    return { ...node, config: normalizeActionConfig(node.action_type, node.config) }
  }
  return { ...node, config: node.config ?? null }
}

export function childrenOf(nodes: DraftNode[], parentId: string | null) {
  const want = canonicalParentId(parentId)
  return nodes
    .filter((node) => canonicalParentId(node.parent_id) === want)
    .sort((a, b) => {
      if (a.branch_type === "TRUE") return -1
      if (b.branch_type === "TRUE") return 1
      return a.position - b.position
    })
}

export function ruleIdsFromRuleNodesUpstream(nodes: DraftNode[], targetNodeId: string): Set<string> {
  const byId = new Map(nodes.map((n) => [n.id, n]))
  const ids = new Set<string>()
  let parentId = canonicalParentId(byId.get(targetNodeId)?.parent_id)
  while (parentId) {
    const parent = byId.get(parentId)
    if (!parent) break
    if (parent.node_type === "rule" && parent.rule_id) {
      ids.add(parent.rule_id)
    }
    parentId = canonicalParentId(parent.parent_id)
  }
  return ids
}

export function canonicalParentId(parentId: string | null | undefined): string | null {
  if (parentId === undefined || parentId === null || parentId === "") {
    return null
  }
  return parentId
}

/** Count of webpage redirect actions on the path from the tree root to `nodeId` (inclusive). */
export function redirectActionCountOnPathFromRootTo(nodes: DraftNode[], nodeId: string | null): number {
  if (!nodeId) return 0
  const byId = new Map(nodes.map((n) => [n.id, n]))
  const reversedPath: DraftNode[] = []
  let cur: DraftNode | undefined = byId.get(nodeId)
  while (cur) {
    reversedPath.push(cur)
    const pid = canonicalParentId(cur.parent_id)
    if (!pid) break
    cur = byId.get(pid)
  }
  reversedPath.reverse()
  return reversedPath.filter((n) => n.node_type === "action" && n.action_type === "redirect").length
}

/** Depth-first preorder (parent before subtree). Reassigns contiguous positions 0..n-1 for API payloads. */
export function preorderDraftNodesWithPositions(nodes: DraftNode[]): DraftNode[] {
  const normalized = nodes.map(normalizeNode).map((n) => ({
    ...n,
    parent_id: canonicalParentId(n.parent_id),
  }))
  const root = normalized.find((n) => n.parent_id === null)
  if (!root) return sortDraftNodes(normalized)

  const byId = new Map(normalized.map((n) => [n.id, n]))
  const childrenByParent = new Map<string | null, DraftNode[]>()
  for (const n of normalized) {
    const p = n.parent_id
    const list = childrenByParent.get(p) ?? []
    list.push(n)
    childrenByParent.set(p, list)
  }
  for (const [, list] of childrenByParent) {
    list.sort((a, b) => {
      if (a.branch_type === "TRUE") return -1
      if (b.branch_type === "TRUE") return 1
      return a.position - b.position
    })
  }

  const out: DraftNode[] = []
  function walk(id: string) {
    const n = byId.get(id)
    if (!n) return
    out.push(n)
    for (const c of childrenByParent.get(id) ?? []) {
      walk(c.id)
    }
  }
  walk(root.id)

  if (out.length !== normalized.length) {
    return sortDraftNodes(normalized)
  }
  return out.map((node, index) => ({ ...node, position: index }))
}

export function draftFromFlow(flow: FlowResponse): FlowDraft {
  const nodes = sortDraftNodes(
    flow.nodes
      .slice()
      .sort((a, b) => a.position - b.position)
      .map((node) =>
        normalizeNode({
          id: node.id,
          parent_id: canonicalParentId(node.parent_id),
          node_type: node.node_type,
          rule_id: node.rule_id,
          branch_type: node.branch_type,
          action_type: node.action_type,
          config: node.config,
          position: node.position,
        }),
      ),
  )
  return {
    id: flow.id,
    updated_at: flow.updated_at,
    survey_id: flow.survey_id,
    name: flow.name,
    description: flow.description ?? "",
    is_active: flow.is_active,
    location_survey_ids: flow.location_survey_ids,
    nodes,
  }
}

export function serializeDraft(draft: FlowDraft | null) {
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

export function hasUnsavedNewDraft(draft: FlowDraft | null) {
  if (!draft || draft.id) return false
  return Boolean(
    draft.name.trim() ||
      draft.description.trim() ||
      draft.location_survey_ids.length ||
      draft.nodes.length ||
      draft.is_active !== true,
  )
}
