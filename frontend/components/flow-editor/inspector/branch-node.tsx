"use client"

import { X } from "lucide-react"
import { DropdownSelect, SingleSelectDropdown } from "@/components/ui/DropdownSelect"
import type { BranchRuleCondition, DraftNode, RuleSummary } from "../types"
import { ruleIdsFromRuleNodesUpstream } from "../draftUtils"
import type { FlowBranchMatchType } from "@/lib/api/client"

export function FlowBranchInspector(props: {
  draftNodes: DraftNode[]
  selectedNode: DraftNode
  branchConfig: { rule_conditions: BranchRuleCondition[]; match_type: FlowBranchMatchType }
  rules: RuleSummary[]
  rulesById: Map<string, RuleSummary>
  updateSelectedNode: (update: (node: DraftNode) => DraftNode) => void
}) {
  const { draftNodes, selectedNode, branchConfig, rules, rulesById, updateSelectedNode } = props
  const conditions = branchConfig.rule_conditions
  const matchType = branchConfig.match_type
  const upstreamRuleIds = ruleIdsFromRuleNodesUpstream(draftNodes, selectedNode.id)
  const addRuleOptions = rules
    .filter((r) => upstreamRuleIds.has(r.id) && !conditions.some((c) => c.rule_id === r.id))
    .map((r) => ({ value: r.id, label: r.name }))

  return (
    <div className="space-y-4">
      <div>
        <span className="text-sm font-medium text-zinc-700">Add rules</span>
        <p className="mt-1 text-sm text-zinc-500">
          Only rules from Rule steps above this branch (on the path from the trigger) can be checked here.
        </p>
        <div className="mt-2">
          <DropdownSelect
            key={`add-rule-${selectedNode.id}-${conditions.map((c) => c.rule_id).sort().join("|")}`}
            options={addRuleOptions}
            value={[]}
            multiple
            placeholder={addRuleOptions.length ? "Add rules" : "Add Rule steps above this branch first"}
            onChange={(next) => {
              const raw = Array.isArray(next) ? next : next ? [next] : []
              const add = raw.filter((ruleId) => !conditions.some((c) => c.rule_id === ruleId))
              if (!add.length) return
              updateSelectedNode((node) => ({
                ...node,
                config: {
                  rule_conditions: [
                    ...conditions,
                    ...add.map((ruleId) => ({ rule_id: ruleId, expected: true as boolean })),
                  ],
                  match_type: matchType,
                },
              }))
            }}
          />
        </div>
      </div>
      <div className="space-y-2">
        <span className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Rules in this branch</span>
        {conditions.length === 0 ? (
          <p className="text-sm text-zinc-400">No rules yet. Add rules using the dropdown above.</p>
        ) : (
          <ul className="space-y-0">
            {conditions.map((condition, idx) => (
              <li key={condition.rule_id}>
                {idx > 0 ? (
                  <div className="flex justify-center py-2">
                    <button
                      type="button"
                      onClick={() =>
                        updateSelectedNode((node) => ({
                          ...node,
                          config: {
                            rule_conditions: conditions,
                            match_type: matchType === "all" ? "any" : "all",
                          },
                        }))
                      }
                      className="rounded-full border border-zinc-200 bg-zinc-50 px-3 py-0.5 text-xs font-semibold text-zinc-500 transition hover:border-violet-300 hover:bg-violet-50 hover:text-violet-600"
                    >
                      {matchType === "all" ? "AND" : "OR"}
                    </button>
                  </div>
                ) : null}
                <div className="flex flex-col gap-2 rounded-xl border border-zinc-200 bg-zinc-50/80 px-3 py-2.5 shadow-sm sm:flex-row sm:items-center sm:gap-3">
                  <span className="min-w-0 flex-1 truncate text-sm font-medium text-zinc-800">
                    {rulesById.get(condition.rule_id)?.name ?? condition.rule_id}
                  </span>
                  <div className="flex shrink-0 items-center gap-2">
                    <div className="w-[120px]">
                      <SingleSelectDropdown
                        options={[
                          { value: "true", label: "True" },
                          { value: "false", label: "False" },
                        ]}
                        value={condition.expected ? "true" : "false"}
                        onChange={(value) =>
                          updateSelectedNode((node) => ({
                            ...node,
                            config: {
                              rule_conditions: conditions.map((c) =>
                                c.rule_id === condition.rule_id ? { ...c, expected: value === "true" } : c,
                              ),
                              match_type: matchType,
                            },
                          }))
                        }
                      />
                    </div>
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
                      className="rounded-lg p-1 text-zinc-400 transition hover:bg-zinc-100 hover:text-zinc-700"
                      aria-label="Remove rule"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}
