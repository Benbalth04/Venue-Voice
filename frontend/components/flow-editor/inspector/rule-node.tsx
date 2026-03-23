"use client"

import { SingleSelectDropdown } from "@/components/ui/DropdownSelect"
import type { DraftNode, RuleSummary } from "../types"

export function FlowRuleInspector(props: {
  draftNodes: DraftNode[]
  selectedNodeId: string
  selectedNode: DraftNode
  rules: RuleSummary[]
  rulesById: Map<string, RuleSummary>
  updateSelectedNode: (update: (node: DraftNode) => DraftNode) => void
}) {
  const { draftNodes, selectedNodeId, selectedNode, rules, rulesById, updateSelectedNode } = props
  return (
    <>
      <label className="block">
        <span className="text-sm font-medium text-zinc-700">Rule</span>
        <div className="mt-1">
          <SingleSelectDropdown
            options={rules.map((rule) => ({
              value: rule.id,
              label: rule.name,
              disabled: draftNodes.some(
                (n) => n.node_type === "rule" && n.id !== selectedNodeId && n.rule_id === rule.id,
              ),
            }))}
            value={selectedNode.rule_id ?? ""}
            onChange={(value) => updateSelectedNode((node) => ({ ...node, rule_id: value }))}
          />
        </div>
      </label>
      <p className="text-xs text-zinc-500">Each survey rule can only be selected on one Rule step in this flow.</p>
      <div className="rounded-2xl border border-zinc-200 bg-zinc-50 px-4 py-3 text-sm text-zinc-600">
        {selectedNode.rule_id
          ? rulesById.get(selectedNode.rule_id)?.description || "This rule does not have a description."
          : "Select a rule."}
      </div>
    </>
  )
}
