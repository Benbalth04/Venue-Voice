"use client"

import Link from "next/link"
import { AlertTriangle, Plus } from "lucide-react"
import { SingleSelectDropdown } from "@/components/ui/DropdownSelect"
import type { DraftNode, RuleSummary } from "../types"

export function FlowRuleInspector(props: {
  draftNodes: DraftNode[]
  selectedNodeId: string
  selectedNode: DraftNode
  rules: RuleSummary[]
  rulesById: Map<string, RuleSummary>
  brokenRuleIds: Set<string>
  updateSelectedNode: (update: (node: DraftNode) => DraftNode) => void
  onOpenRulesFrame: () => void
}) {
  const { draftNodes, selectedNodeId, selectedNode, rules, rulesById, brokenRuleIds, updateSelectedNode, onOpenRulesFrame } = props
  const isCurrentRuleBroken = !!selectedNode.rule_id && brokenRuleIds.has(selectedNode.rule_id)
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
      <button
        type="button"
        onClick={onOpenRulesFrame}
        className="flex items-center gap-1.5 text-xs font-medium text-violet-600 hover:text-violet-800"
      >
        <Plus className="h-3.5 w-3.5" />
        Create or update a rule
      </button>
      {isCurrentRuleBroken ? (
        <div className="flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <div>
            <p className="font-medium">This rule is broken and cannot run.</p>
            <Link
              href="/dashboard/automations/rules"
              className="mt-0.5 inline-block underline underline-offset-2 hover:text-red-900"
            >
              Go to Rules to fix it
            </Link>
          </div>
        </div>
      ) : null}
      <div className="rounded-2xl border border-zinc-200 bg-zinc-50 px-4 py-3 text-sm text-zinc-600">
        {selectedNode.rule_id
          ? rulesById.get(selectedNode.rule_id)?.description || "This rule does not have a description."
          : "Select a rule."}
      </div>
    </>
  )
}
