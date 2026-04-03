import type { FlowResponse, LocationSurveyResponse } from "@/lib/api/client"
import { TRIGGER_NODE_ID } from "./constants"
import {
  canonicalParentId,
  childrenOf,
  normalizeActionConfig,
  normalizeBranchConfig,
  ruleIdsFromRuleNodesUpstream,
} from "./draftUtils"
import type { DraftNode, FlowDraft } from "./types"

export type FlowDraftValidationResult = {
  message: string | null
  /** Present only when the error maps to exactly one canvas node (including trigger). */
  highlightNodeId: string | null
}

function invalid(message: string, highlightNodeId: string | null): FlowDraftValidationResult {
  return { message, highlightNodeId }
}

export function validateFlowDraft(
  currentDraft: FlowDraft,
  ctx: {
    existingFlows: FlowResponse[]
    selectedTriggerLocations: LocationSurveyResponse[]
  },
): FlowDraftValidationResult {
  if (!currentDraft.name.trim()) {
    return invalid("Flow name is required.", null)
  }
  if (!currentDraft.location_survey_ids.length) {
    return invalid("Select at least one trigger location.", TRIGGER_NODE_ID)
  }
  const duplicate = ctx.existingFlows.find(
    (flow) => flow.id !== currentDraft.id && flow.name.trim().toLowerCase() === currentDraft.name.trim().toLowerCase(),
  )
  if (duplicate) {
    return invalid("Flow title must be unique within your company.", null)
  }
  const root = currentDraft.nodes.find((node) => canonicalParentId(node.parent_id) === null)
  if (!root) {
    return invalid("Add at least one step after the trigger.", TRIGGER_NODE_ID)
  }
  if (!currentDraft.nodes.some((n) => n.node_type === "action")) {
    return invalid("Add at least one action step (send email or redirect).", root.id)
  }

  const duplicateRuleOnPathMessage =
    "The same survey rule cannot be used on more than one Rule step on a single path. Add a branch so each path only includes that rule once."

  const walk = (
    node: DraftNode,
    redirectsOnPath: number,
    pathRuleIds: Set<string>,
  ): FlowDraftValidationResult | null => {
    if (node.node_type === "terminate") {
      return null
    }

    if (node.node_type === "rule") {
      if (!node.rule_id) {
        return invalid("Every rule widget must reference a rule.", node.id)
      }
      if (pathRuleIds.has(node.rule_id)) {
        return invalid(duplicateRuleOnPathMessage, node.id)
      }
      const nextPath = new Set(pathRuleIds)
      nextPath.add(node.rule_id)
      const children = childrenOf(currentDraft.nodes, node.id)
      if (children.length !== 1) {
        return invalid("Rule widgets must connect to exactly one next step.", node.id)
      }
      return walk(children[0], redirectsOnPath, nextPath)
    }

    if (node.node_type === "branch") {
      const config = normalizeBranchConfig(node.config)
      if (!config.rule_conditions.length) {
        return invalid("Branch widgets must include at least one rule.", node.id)
      }
      const upstreamRuleIds = ruleIdsFromRuleNodesUpstream(currentDraft.nodes, node.id)
      for (const rc of config.rule_conditions) {
        if (!upstreamRuleIds.has(rc.rule_id)) {
          return invalid(
            "Each branch check must use a rule from a Rule step above this branch on the path from the trigger.",
            node.id,
          )
        }
      }
      const branchChildren = childrenOf(currentDraft.nodes, node.id)
      const truePath = branchChildren.filter((child) => child.branch_type === "TRUE")
      const falsePath = branchChildren.filter((child) => child.branch_type === "FALSE")
      const orphanPath = branchChildren.filter(
        (child) => child.branch_type !== "TRUE" && child.branch_type !== "FALSE",
      )
      if (orphanPath.length) {
        return invalid(
          "This branch has steps that are not on the True or False path (often caused by inserting a step on an edge). Remove those steps or delete and re-add them from the branch.",
          node.id,
        )
      }
      if (truePath.length !== 1 || falsePath.length !== 1) {
        return invalid("Branch widgets need exactly one step on the True path and one on the False path.", node.id)
      }
      const pathAtBranch = new Set(pathRuleIds)
      for (const child of branchChildren) {
        const failure = walk(child, redirectsOnPath, new Set(pathAtBranch))
        if (failure) return failure
      }
      return null
    }

    let pathRedirects = redirectsOnPath
    if (node.action_type === "redirect") {
      pathRedirects += 1
      if (pathRedirects > 1) {
        return invalid(
          "Each path through the flow may include at most one webpage redirect action.",
          node.id,
        )
      }
    }

    const config = normalizeActionConfig(node.action_type, node.config)
    if (node.action_type === "redirect") {
      if (config?.target === "custom_url" && !String(config.url ?? "").trim()) {
        return invalid("Custom redirects require a URL.", node.id)
      }
      if (config?.target === "google_business_url") {
        const missing = ctx.selectedTriggerLocations.filter((location) => !location.location_google_business_url)
        if (missing.length === 1) {
          return invalid(
            `Google redirect is missing a business URL for ${missing[0].location_name}.`,
            TRIGGER_NODE_ID,
          )
        }
        if (missing.length > 1) {
          return invalid(
            "Google redirect requires a business URL for every trigger location. Update locations or choose a different redirect.",
            null,
          )
        }
      }
    }
    if (node.action_type === "email") {
      if (config?.target === "custom_email" && !String(config.email ?? "").trim()) {
        return invalid("Custom email actions require an email address.", node.id)
      }
      if (config?.target === "notification_group" && !String(config.notification_group_id ?? "").trim()) {
        return invalid("Notification-group email actions require a notification group.", node.id)
      }
    }
    const actionChildren = childrenOf(currentDraft.nodes, node.id)
    if (actionChildren.length > 1) {
      return invalid("Each action can connect to at most one following step.", node.id)
    }
    if (actionChildren.length === 1) {
      const next = actionChildren[0]
      if ((next.node_type !== "action" && next.node_type !== "terminate") || next.branch_type != null) {
        return invalid("Actions can only chain to another action or a terminate node.", node.id)
      }
      return walk(next, pathRedirects, pathRuleIds)
    }
    return null
  }

  const failure = walk(root, 0, new Set())
  if (failure) return failure
  return { message: null, highlightNodeId: null }
}
