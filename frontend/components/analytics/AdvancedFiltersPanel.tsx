"use client"

import { useEffect, useRef, useState } from "react"
import { ChevronDown, ChevronRight, Plus, X } from "lucide-react"
import { SingleSelectDropdown } from "@/components/ui/DropdownSelect"
import {
  fetchRuleBundleDirect,
  type AdvancedFilterApiPayload,
  type AdvFilterConditionPayload,
  type AdvFilterGroupPayload,
  type AnalyticsFilterOption,
  type LogicQuestionOption,
  type RuleConditionType,
  type RuleOperatorApi,
} from "@/lib/api/client"
import {
  RuleConditionCard,
  conditionTypesForQuestionType,
  type ConditionDraft,
} from "@/components/rules/RuleConditionCard"
import { supabase } from "@/lib/supabase/client"

// ─── Types ───────────────────────────────────────────────────────────────────

type AdvOperator = "AND" | "OR"

export interface AdvConditionDraft {
  localId: string
  condition_type: RuleConditionType | ""
  question_id: string
  operator: RuleOperatorApi | null
  value: string | string[] | null
}

export interface AdvGroupDraft {
  kind: "group"
  localId: string
  groupOperator: AdvOperator
  conditions: AdvConditionDraft[]
}

export type AdvTopLevelItem = ({ kind: "condition" } & AdvConditionDraft) | AdvGroupDraft

export interface AdvancedFilterState {
  surveyId: string
  topOperator: AdvOperator
  items: AdvTopLevelItem[]
}

export const DEFAULT_ADV_FILTER: AdvancedFilterState = {
  surveyId: "",
  topOperator: "AND",
  items: [],
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

let _localIdCounter = 0
function newLocalId(): string {
  return `local-${++_localIdCounter}`
}

function makeBlankCondition(): AdvConditionDraft {
  return {
    localId: newLocalId(),
    condition_type: "",
    question_id: "",
    operator: null,
    value: null,
  }
}

async function getToken(): Promise<string | null> {
  const { data } = await supabase.auth.getSession()
  return data.session?.access_token ?? null
}

/** Convert AdvancedFilterState → flat API payload for the backend. */
export function advancedFilterToApiPayload(state: AdvancedFilterState): AdvancedFilterApiPayload {
  const groups: AdvFilterGroupPayload[] = []
  const conditions: AdvFilterConditionPayload[] = []

  for (const item of state.items) {
    if (item.kind === "condition") {
      if (!item.question_id || !item.condition_type) continue
      conditions.push({
        condition_type: item.condition_type as RuleConditionType,
        question_id: item.question_id,
        operator: item.operator,
        value: item.value,
        group_local_id: null,
      })
    } else {
      groups.push({ local_id: item.localId, operator: item.groupOperator })
      for (const cond of item.conditions) {
        if (!cond.question_id || !cond.condition_type) continue
        conditions.push({
          condition_type: cond.condition_type as RuleConditionType,
          question_id: cond.question_id,
          operator: cond.operator,
          value: cond.value,
          group_local_id: item.localId,
        })
      }
    }
  }

  return {
    survey_id: state.surveyId,
    operator: state.topOperator,
    groups,
    conditions,
  }
}

/** Returns true when the state has at least one complete condition. */
export function hasActiveAdvancedFilter(state: AdvancedFilterState): boolean {
  return advancedFilterToApiPayload(state).conditions.length > 0
}

// ─── Sub-components ──────────────────────────────────────────────────────────

function ConnectorPill({
  operator,
  onChange,
}: {
  operator: AdvOperator
  onChange: (next: AdvOperator) => void
}) {
  return (
    <div className="flex items-center gap-2 py-1">
      <div className="h-px flex-1 bg-zinc-200" />
      <button
        type="button"
        onClick={() => onChange(operator === "AND" ? "OR" : "AND")}
        className="rounded-full border border-violet-200 bg-violet-50 px-3 py-0.5 text-xs font-semibold text-violet-700 hover:bg-violet-100 transition-colors"
        title="Click to toggle AND / OR"
      >
        {operator}
      </button>
      <div className="h-px flex-1 bg-zinc-200" />
    </div>
  )
}

function conditionDraftToRuleConditionCard(cond: AdvConditionDraft): ConditionDraft {
  return {
    localId: cond.localId,
    condition_type: (cond.condition_type || "not_empty") as RuleConditionType,
    question_id: cond.question_id,
    operator: cond.operator,
    value: cond.value,
  }
}

function AdvConditionRow({
  cond,
  label,
  questions,
  onUpdate,
  onDelete,
  onDuplicate,
}: {
  cond: AdvConditionDraft
  label: string
  questions: LogicQuestionOption[]
  onUpdate: (next: AdvConditionDraft) => void
  onDelete: () => void
  onDuplicate: () => void
}) {
  return (
    <RuleConditionCard
      label={label}
      condition={conditionDraftToRuleConditionCard(cond)}
      questions={questions}
      onUpdate={(next) =>
        onUpdate({
          ...cond,
          condition_type: next.condition_type,
          question_id: next.question_id,
          operator: next.operator,
          value: next.value,
        })
      }
      onDelete={onDelete}
      onDuplicate={onDuplicate}
    />
  )
}

function AdvGroupCard({
  group,
  questions,
  onUpdate,
  onDelete,
}: {
  group: AdvGroupDraft
  questions: LogicQuestionOption[]
  onUpdate: (next: AdvGroupDraft) => void
  onDelete: () => void
}) {
  function updateCond(idx: number, next: AdvConditionDraft) {
    const updated = group.conditions.map((c, i) => (i === idx ? next : c))
    onUpdate({ ...group, conditions: updated })
  }

  function deleteCond(idx: number) {
    const updated = group.conditions.filter((_, i) => i !== idx)
    if (updated.length === 0) {
      onDelete()
      return
    }
    onUpdate({ ...group, conditions: updated })
  }

  function duplicateCond(idx: number) {
    const src = group.conditions[idx]
    const dup: AdvConditionDraft = { ...src, localId: newLocalId() }
    const updated = [...group.conditions.slice(0, idx + 1), dup, ...group.conditions.slice(idx + 1)]
    onUpdate({ ...group, conditions: updated })
  }

  function addCondition() {
    onUpdate({ ...group, conditions: [...group.conditions, makeBlankCondition()] })
  }

  return (
    <div className="rounded-xl border border-violet-200 bg-violet-50/40 p-4 space-y-3">
      <div className="flex items-center justify-between">
        <span className="text-xs font-semibold uppercase tracking-wide text-violet-700">Group</span>
        <button
          type="button"
          onClick={onDelete}
          className="rounded-lg p-1.5 text-zinc-400 hover:bg-red-50 hover:text-red-600"
          aria-label="Delete group"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>

      {group.conditions.map((cond, idx) => (
        <div key={cond.localId}>
          {idx > 0 && (
            <ConnectorPill
              operator={group.groupOperator}
              onChange={(op) => onUpdate({ ...group, groupOperator: op })}
            />
          )}
          <AdvConditionRow
            cond={cond}
            label={`Condition ${idx + 1}`}
            questions={questions}
            onUpdate={(next) => updateCond(idx, next)}
            onDelete={() => deleteCond(idx)}
            onDuplicate={() => duplicateCond(idx)}
          />
        </div>
      ))}

      <button
        type="button"
        onClick={addCondition}
        className="flex items-center gap-1.5 rounded-lg border border-dashed border-zinc-300 px-3 py-1.5 text-xs font-medium text-zinc-500 hover:border-violet-400 hover:text-violet-700 transition-colors"
      >
        <Plus className="h-3.5 w-3.5" />
        Add Condition
      </button>
    </div>
  )
}

// ─── Main Panel ──────────────────────────────────────────────────────────────

export function AdvancedFiltersPanel({
  state,
  onChange,
  onReset,
  surveys,
  mainSurveyId,
}: {
  state: AdvancedFilterState
  onChange: (next: AdvancedFilterState) => void
  onReset: () => void
  surveys: AnalyticsFilterOption[]
  mainSurveyId: string
}) {
  const [expanded, setExpanded] = useState(false)
  const [questions, setQuestions] = useState<LogicQuestionOption[]>([])
  const [questionsLoading, setQuestionsLoading] = useState(false)
  const [questionsError, setQuestionsError] = useState<string | null>(null)
  const [pendingSurveyChange, setPendingSurveyChange] = useState<string | null>(null)

  const prevMainSurveyRef = useRef(mainSurveyId)
  const hasConditions = state.items.length > 0

  // Auto-populate survey from main filter when no conditions are set
  useEffect(() => {
    if (mainSurveyId !== prevMainSurveyRef.current) {
      prevMainSurveyRef.current = mainSurveyId
      if (!hasConditions) {
        onChange({ ...state, surveyId: mainSurveyId })
      }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mainSurveyId])

  // Load questions when surveyId changes
  useEffect(() => {
    if (!state.surveyId) {
      setQuestions([])
      setQuestionsError(null)
      return
    }
    let cancelled = false
    setQuestionsLoading(true)
    setQuestionsError(null)
    ;(async () => {
      const token = await getToken()
      if (!token || cancelled) return
      try {
        const bundle = await fetchRuleBundleDirect(token, state.surveyId)
        if (!cancelled) {
          // Only keep question types that support advanced filtering
          const filterable = bundle.questions.filter((q) =>
            conditionTypesForQuestionType(q.question_type).length > 0,
          )
          setQuestions(filterable)
        }
      } catch {
        if (!cancelled) setQuestionsError("Failed to load questions for this survey")
      } finally {
        if (!cancelled) setQuestionsLoading(false)
      }
    })()
    return () => { cancelled = true }
  }, [state.surveyId])

  function handleSurveySelect(surveyId: string) {
    if (hasConditions && surveyId !== state.surveyId) {
      setPendingSurveyChange(surveyId)
    } else {
      onChange({ ...DEFAULT_ADV_FILTER, surveyId, topOperator: state.topOperator })
    }
  }

  function confirmSurveyChange() {
    if (pendingSurveyChange !== null) {
      onChange({ ...DEFAULT_ADV_FILTER, surveyId: pendingSurveyChange, topOperator: state.topOperator })
      setPendingSurveyChange(null)
    }
  }

  function addCondition() {
    onChange({ ...state, items: [...state.items, { kind: "condition", ...makeBlankCondition() }] })
  }

  function addGroup() {
    const group: AdvGroupDraft = {
      kind: "group",
      localId: newLocalId(),
      groupOperator: "AND",
      conditions: [makeBlankCondition()],
    }
    onChange({ ...state, items: [...state.items, group] })
  }

  function updateItem(idx: number, next: AdvTopLevelItem) {
    onChange({ ...state, items: state.items.map((item, i) => (i === idx ? next : item)) })
  }

  function deleteItem(idx: number) {
    onChange({ ...state, items: state.items.filter((_, i) => i !== idx) })
  }

  function duplicateCondition(idx: number) {
    const src = state.items[idx]
    if (src.kind !== "condition") return
    const dup: AdvTopLevelItem = { ...src, localId: newLocalId() }
    onChange({
      ...state,
      items: [...state.items.slice(0, idx + 1), dup, ...state.items.slice(idx + 1)],
    })
  }

  const isActive = hasActiveAdvancedFilter(state)

  return (
    <div className="rounded-2xl border border-zinc-200 bg-white shadow-sm">
      {/* Header — always visible */}
      <div className="flex w-full items-center justify-between px-4 py-3">
        <button
          type="button"
          className="flex items-center gap-2 text-left"
          onClick={() => setExpanded((v) => !v)}
          aria-expanded={expanded}
        >
          {expanded ? (
            <ChevronDown className="h-4 w-4 text-zinc-400" />
          ) : (
            <ChevronRight className="h-4 w-4 text-zinc-400" />
          )}
          <span className="text-sm font-medium text-zinc-700">Advanced Filters</span>
          {isActive && (
            <span className="rounded-full bg-violet-100 px-2 py-0.5 text-xs font-semibold text-violet-700">
              Active
            </span>
          )}
        </button>
        {isActive && (
          <button
            type="button"
            onClick={onReset}
            className="text-xs text-zinc-500 underline hover:text-zinc-700"
          >
            Reset
          </button>
        )}
      </div>

      {/* Expanded body */}
      {expanded && (
        <div className="border-t border-zinc-100 px-4 pb-4 pt-3 space-y-4">
          {/* Survey selector */}
          <div>
            <label className="mb-1 block text-xs font-medium text-zinc-600">Survey</label>
            <SingleSelectDropdown
              value={state.surveyId}
              onChange={handleSurveySelect}
              options={surveys.map((s) => ({ value: s.id, label: s.name }))}
              placeholder="Select a survey…"
              className="max-w-xs"
            />
          </div>

          {/* Survey change confirmation */}
          {pendingSurveyChange !== null && (
            <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
              <p className="font-medium">Change survey?</p>
              <p className="mt-0.5 text-xs">
                Switching surveys will clear all existing conditions below.
              </p>
              <div className="mt-2 flex gap-2">
                <button
                  type="button"
                  onClick={confirmSurveyChange}
                  className="rounded-lg bg-amber-600 px-3 py-1 text-xs font-semibold text-white hover:bg-amber-700"
                >
                  Yes, change survey
                </button>
                <button
                  type="button"
                  onClick={() => setPendingSurveyChange(null)}
                  className="rounded-lg border border-amber-300 px-3 py-1 text-xs font-semibold text-amber-700 hover:bg-amber-100"
                >
                  Cancel
                </button>
              </div>
            </div>
          )}

          {/* Questions loading/error state */}
          {state.surveyId && questionsLoading && (
            <p className="text-xs text-zinc-500">Loading questions…</p>
          )}
          {state.surveyId && questionsError && (
            <p className="text-xs text-red-600">{questionsError}</p>
          )}
          {state.surveyId && !questionsLoading && !questionsError && questions.length === 0 && (
            <p className="text-xs text-zinc-500 italic">
              No filterable questions found for this survey.
            </p>
          )}

          {/* Conditions / groups */}
          {state.surveyId && questions.length > 0 && (
            <>
              {state.items.map((item, idx) => (
                <div key={item.kind === "group" ? item.localId : item.localId}>
                  {idx > 0 && (
                    <ConnectorPill
                      operator={state.topOperator}
                      onChange={(op) => onChange({ ...state, topOperator: op })}
                    />
                  )}
                  {item.kind === "condition" ? (
                    <AdvConditionRow
                      cond={item}
                      label={`Condition ${idx + 1}`}
                      questions={questions}
                      onUpdate={(next) => updateItem(idx, { kind: "condition", ...next })}
                      onDelete={() => deleteItem(idx)}
                      onDuplicate={() => duplicateCondition(idx)}
                    />
                  ) : (
                    <AdvGroupCard
                      group={item}
                      questions={questions}
                      onUpdate={(next) => updateItem(idx, next)}
                      onDelete={() => deleteItem(idx)}
                    />
                  )}
                </div>
              ))}

              {/* Add buttons */}
              <div className="flex flex-wrap gap-2 pt-1">
                <button
                  type="button"
                  onClick={addCondition}
                  className="flex items-center gap-1.5 rounded-lg border border-dashed border-zinc-300 px-3 py-1.5 text-xs font-medium text-zinc-500 hover:border-violet-400 hover:text-violet-700 transition-colors"
                >
                  <Plus className="h-3.5 w-3.5" />
                  Add Condition
                </button>
                <button
                  type="button"
                  onClick={addGroup}
                  className="flex items-center gap-1.5 rounded-lg border border-dashed border-zinc-300 px-3 py-1.5 text-xs font-medium text-zinc-500 hover:border-violet-400 hover:text-violet-700 transition-colors"
                >
                  <Plus className="h-3.5 w-3.5" />
                  Add Group
                </button>
              </div>
            </>
          )}

          {/* Empty state when no survey selected */}
          {!state.surveyId && (
            <p className="text-xs text-zinc-400 italic">
              Select a survey above to add question-based filters.
            </p>
          )}
        </div>
      )}
    </div>
  )
}
