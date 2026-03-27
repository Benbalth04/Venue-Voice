"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import { useSearchParams } from "next/navigation"
import {
  closestCenter,
  DndContext,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
} from "@dnd-kit/core"
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable"
import { CSS } from "@dnd-kit/utilities"
import { AlertTriangle, Bell, ChevronDown, GripVertical, Loader2, Pencil, Plus, Save, Trash2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { LoadingSpinner } from "@/components/ui/LoadingSpinner"
import { Card } from "@/components/ui/card"
import { useConfirm } from "@/components/ui/ConfirmDialog"
import { SingleSelectDropdown } from "@/components/ui/DropdownSelect"
import {
  RuleConditionCard,
  conditionTypesForQuestionType,
  defaultConditionTypeForQuestion,
  defaultOperatorForConditionType,
  type ConditionDraft,
} from "@/components/rules/RuleConditionCard"
import { supabase } from "@/lib/supabase/client"
import { useBrokenRules } from "@/components/layout/BrokenRulesContext"
import {
  createRuleDirect,
  deleteSurveyLogicRule,
  extractErrorMessage,
  fetchRuleBundleDirect,
  fetchSurveys,
  isStaleObjectError,
  updateRuleDirect,
  type LogicQuestionOption,
  type RuleBundleData,
  type RuleConditionType,
  type RuleCreatePayload,
  type RuleData,
  type RuleOperatorApi,
  type RuleUpdatePayload,
  type SurveySummary,
} from "@/lib/api/client"

// -----------------------------------------------------------------------
// Draft model
// -----------------------------------------------------------------------

type GroupDraft = {
  kind: "group"
  localId: string
  id?: string | null
  groupOperator: "AND" | "OR"
  conditions: ConditionDraft[]
}

type TopLevelItem = ({ kind: "condition" } & ConditionDraft) | GroupDraft

type RuleDraft = {
  id?: string
  updated_at?: string
  name: string
  description: string
  topOperator: "AND" | "OR"
  items: TopLevelItem[]
}

function uid() {
  return crypto.randomUUID()
}

function truncateDescription(value: string, maxLength = 96) {
  if (value.length <= maxLength) return value
  return `${value.slice(0, maxLength).trimEnd()}…`
}

// -----------------------------------------------------------------------
// Draft builders
// -----------------------------------------------------------------------

function makeConditionDraft(question: LogicQuestionOption): ConditionDraft {
  const conditionType = defaultConditionTypeForQuestion(question.question_type)
  const operator = defaultOperatorForConditionType(conditionType)
  return {
    localId: uid(),
    question_id: question.id,
    condition_type: conditionType,
    operator,
    value: null,
  }
}

function draftFromRule(rule: RuleData): RuleDraft {
  // Map group id → conditions
  const groupConditions = new Map<string, ConditionDraft[]>()
  const topLevel: ConditionDraft[] = []

  for (const cond of rule.conditions) {
    const draft: ConditionDraft = {
      localId: uid(),
      id: cond.id ?? null,
      condition_type: cond.condition_type as RuleConditionType,
      question_id: cond.question_id ?? "",
      operator: cond.operator as RuleOperatorApi | null,
      value: cond.value,
    }
    if (cond.group_id) {
      const list = groupConditions.get(cond.group_id) ?? []
      list.push(draft)
      groupConditions.set(cond.group_id, list)
    } else {
      topLevel.push(draft)
    }
  }

  const items: TopLevelItem[] = [
    ...topLevel.map((c) => ({ kind: "condition" as const, ...c })),
    ...rule.groups.map(
      (g): GroupDraft => ({
        kind: "group",
        localId: uid(),
        id: g.id,
        groupOperator: g.operator,
        conditions: groupConditions.get(g.id) ?? [],
      }),
    ),
  ]

  return {
    id: rule.id,
    updated_at: rule.updated_at,
    name: rule.name,
    description: rule.description ?? "",
    topOperator: rule.operator,
    items,
  }
}

function payloadFromDraft(draft: RuleDraft): RuleCreatePayload {
  const groups: RuleCreatePayload["groups"] = []
  const conditions: RuleCreatePayload["conditions"] = []

  for (const item of draft.items) {
    if (item.kind === "group") {
      const groupId = item.id ?? uid()
      groups.push({ id: groupId, operator: item.groupOperator })
      for (const cond of item.conditions) {
        conditions.push({
          id: cond.id ?? null,
          condition_type: cond.condition_type,
          question_id: cond.question_id,
          operator: cond.operator,
          value: cond.value,
          group_id: groupId,
        })
      }
    } else {
      conditions.push({
        id: item.id ?? null,
        condition_type: item.condition_type,
        question_id: item.question_id,
        operator: item.operator,
        value: item.value,
        group_id: null,
      })
    }
  }

  return {
    name: draft.name.trim(),
    description: draft.description.trim() || null,
    operator: draft.topOperator,
    groups,
    conditions,
  }
}

function serializeDraft(draft: RuleDraft) {
  return JSON.stringify(payloadFromDraft(draft))
}

// -----------------------------------------------------------------------
// Validation
// -----------------------------------------------------------------------

function validateCondition(cond: ConditionDraft, questionMap: Map<string, LogicQuestionOption>): string | null {
  const question = questionMap.get(cond.question_id)
  if (!question) return "Each condition must reference a valid question."

  const allowed = conditionTypesForQuestionType(question.question_type)
  if (!allowed.includes(cond.condition_type)) {
    return `"${cond.condition_type}" is not valid for "${question.question_text}".`
  }

  if (cond.condition_type === "not_empty") return null

  // Numeric types
  if (cond.condition_type === "rating" || cond.condition_type === "nps") {
    if (!cond.operator) return `Select an operator for "${question.question_text}".`
    if (!cond.value || typeof cond.value !== "string") {
      return `Select a value for "${question.question_text}".`
    }
    return null
  }

  // Choice / sentiment
  if (!cond.value || (Array.isArray(cond.value) && cond.value.length === 0)) {
    return `Select a value for "${question.question_text}".`
  }

  return null
}

function validateDraft(draft: RuleDraft, questionMap: Map<string, LogicQuestionOption>): string | null {
  if (!draft.name.trim()) return "Rule name is required."
  if (draft.description.trim().length > 240) return "Description must be 240 characters or fewer."
  if (draft.items.length === 0) return "Add at least one condition."

  for (const item of draft.items) {
    if (item.kind === "group") {
      if (item.conditions.length === 0) return "Condition groups must contain at least one condition."
      for (const cond of item.conditions) {
        const err = validateCondition(cond, questionMap)
        if (err) return err
      }
    } else {
      const err = validateCondition(item, questionMap)
      if (err) return err
    }
  }

  return null
}

// -----------------------------------------------------------------------
// AND / OR Connector Pill
// -----------------------------------------------------------------------

function ConnectorPill({
  value,
  onChange,
}: {
  value: "AND" | "OR"
  onChange: (next: "AND" | "OR") => void
}) {
  return (
    <div className="flex justify-center">
      <label className="relative inline-flex items-center">
        <select
          value={value}
          onChange={(e) => onChange(e.target.value as "AND" | "OR")}
          className="appearance-none rounded-full border border-violet-200 bg-violet-50 px-4 py-1.5 pr-9 text-xs font-semibold uppercase tracking-wide text-violet-700 outline-none transition-colors hover:border-violet-300 focus:ring-2 focus:ring-violet-500"
        >
          <option value="AND">AND</option>
          <option value="OR">OR</option>
        </select>
        <ChevronDown className="pointer-events-none absolute right-3 h-3.5 w-3.5 text-violet-600" />
      </label>
    </div>
  )
}

// -----------------------------------------------------------------------
// Sortable leaf condition (DnD wrapper)
// -----------------------------------------------------------------------

function SortableLeafCondition({
  label,
  condition,
  questions,
  onUpdate,
  onDelete,
  brokenMessage,
}: {
  label: string
  condition: ConditionDraft
  questions: LogicQuestionOption[]
  onUpdate: (next: ConditionDraft) => void
  onDelete: () => void
  brokenMessage?: string | null
}) {
  const { attributes, listeners, setNodeRef, transform, transition } = useSortable({
    id: condition.localId,
  })

  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
    >
      <RuleConditionCard
        label={label}
        condition={condition}
        questions={questions}
        onUpdate={onUpdate}
        onDelete={onDelete}
        dragAttributes={attributes}
        dragListeners={listeners}
        brokenMessage={brokenMessage}
      />
    </div>
  )
}

// -----------------------------------------------------------------------
// Condition Group Card
// -----------------------------------------------------------------------

function ConditionGroupCard({
  groupIndex,
  group,
  questions,
  onUpdateGroup,
  onDeleteGroup,
  onDeleteSubCondition,
  brokenConditionMap,
}: {
  groupIndex: number
  group: GroupDraft
  questions: LogicQuestionOption[]
  onUpdateGroup: (next: GroupDraft) => void
  onDeleteGroup: () => void
  onDeleteSubCondition: (localId: string) => void
  brokenConditionMap: Map<string, string>
}) {
  const { attributes, listeners, setNodeRef, transform, transition } = useSortable({
    id: group.localId,
  })
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  )

  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
    >
      <Card className="border-violet-200 bg-violet-50/30">
        <div className="space-y-4">
          <div className="flex items-center justify-between gap-3">
            <p className="text-sm font-semibold text-zinc-900">{`Condition ${groupIndex + 1}`}</p>
            <div className="flex items-center gap-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  const fallback = questions[0]
                  if (!fallback) return
                  onUpdateGroup({
                    ...group,
                    conditions: [...group.conditions, makeConditionDraft(fallback)],
                  })
                }}
              >
                <Plus className="mr-1.5 h-4 w-4" />
                Add condition
              </Button>
              <button
                type="button"
                className="rounded-lg border border-zinc-200 bg-white p-2 text-zinc-400 hover:text-zinc-700"
                aria-label={`Drag group ${groupIndex + 1}`}
                {...attributes}
                {...listeners}
              >
                <GripVertical className="h-4 w-4" />
              </button>
              <button
                type="button"
                className="rounded-lg border border-zinc-200 bg-white p-2 text-zinc-400 hover:bg-red-50 hover:text-red-600"
                onClick={onDeleteGroup}
                aria-label={`Delete group ${groupIndex + 1}`}
              >
                <Trash2 className="h-4 w-4" />
              </button>
            </div>
          </div>

          <DndContext
            sensors={sensors}
            collisionDetection={closestCenter}
            onDragEnd={({ active, over }) => {
              if (!over || active.id === over.id) return
              const oldIdx = group.conditions.findIndex((c) => c.localId === String(active.id))
              const newIdx = group.conditions.findIndex((c) => c.localId === String(over.id))
              if (oldIdx === -1 || newIdx === -1) return
              onUpdateGroup({ ...group, conditions: arrayMove(group.conditions, oldIdx, newIdx) })
            }}
          >
            <SortableContext
              items={group.conditions.map((c) => c.localId)}
              strategy={verticalListSortingStrategy}
            >
              <div className="space-y-3">
                {group.conditions.map((cond, idx) => (
                  <div key={cond.localId} className="space-y-3">
                    <SortableLeafCondition
                      label={`Condition ${groupIndex + 1}.${idx + 1}`}
                      condition={cond}
                      questions={questions}
                      onUpdate={(next) => {
                        const next_ = [...group.conditions]
                        next_[idx] = next
                        onUpdateGroup({ ...group, conditions: next_ })
                      }}
                      onDelete={() => onDeleteSubCondition(cond.localId)}
                      brokenMessage={cond.id ? brokenConditionMap.get(cond.id) : undefined}
                    />
                    {idx < group.conditions.length - 1 && (
                      <ConnectorPill
                        value={group.groupOperator}
                        onChange={(next) => onUpdateGroup({ ...group, groupOperator: next })}
                      />
                    )}
                  </div>
                ))}
              </div>
            </SortableContext>
          </DndContext>
        </div>
      </Card>
    </div>
  )
}

// -----------------------------------------------------------------------
// Sortable top-level leaf (DnD wrapper for standalone conditions)
// -----------------------------------------------------------------------

function SortableTopLevelLeaf({
  item,
  index,
  questions,
  onUpdateItem,
  onDeleteItem,
  brokenConditionMap,
}: {
  item: ConditionDraft & { kind: "condition" }
  index: number
  questions: LogicQuestionOption[]
  onUpdateItem: (next: TopLevelItem) => void
  onDeleteItem: () => void
  brokenConditionMap: Map<string, string>
}) {
  const { attributes, listeners, setNodeRef, transform, transition } = useSortable({ id: item.localId })
  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
    >
      <RuleConditionCard
        label={`Condition ${index + 1}`}
        condition={item}
        questions={questions}
        onUpdate={(next) => onUpdateItem({ kind: "condition", ...next })}
        onDelete={onDeleteItem}
        dragAttributes={attributes}
        dragListeners={listeners}
        brokenMessage={item.id ? brokenConditionMap.get(item.id) : undefined}
      />
    </div>
  )
}

// -----------------------------------------------------------------------
// Top-level item dispatcher (no hooks — dispatches to typed subcomponents)
// -----------------------------------------------------------------------

function SortableTopLevelItem({
  item,
  index,
  questions,
  onUpdateItem,
  onDeleteItem,
  onDeleteSubCondition,
  brokenConditionMap,
}: {
  item: TopLevelItem
  index: number
  questions: LogicQuestionOption[]
  onUpdateItem: (next: TopLevelItem) => void
  onDeleteItem: () => void
  onDeleteSubCondition: (groupLocalId: string, condLocalId: string) => void
  brokenConditionMap: Map<string, string>
}) {
  if (item.kind === "group") {
    return (
      <ConditionGroupCard
        groupIndex={index}
        group={item}
        questions={questions}
        onUpdateGroup={(next) => onUpdateItem(next)}
        onDeleteGroup={onDeleteItem}
        onDeleteSubCondition={(condLocalId) => onDeleteSubCondition(item.localId, condLocalId)}
        brokenConditionMap={brokenConditionMap}
      />
    )
  }

  return (
    <SortableTopLevelLeaf
      item={item}
      index={index}
      questions={questions}
      onUpdateItem={onUpdateItem}
      onDeleteItem={onDeleteItem}
      brokenConditionMap={brokenConditionMap}
    />
  )
}

// -----------------------------------------------------------------------
// Page
// -----------------------------------------------------------------------

export default function RulesPage() {
  const { confirm, ConfirmDialogRender } = useConfirm()
  const { refreshBrokenRuleCount } = useBrokenRules()
  const searchParams = useSearchParams()
  const initialSurveyIdParam = searchParams.get("surveyId") ?? ""

  const [surveys, setSurveys] = useState<SurveySummary[]>([])
  const [selectedSurveyId, setSelectedSurveyId] = useState("")
  const [questions, setQuestions] = useState<LogicQuestionOption[]>([])
  const [rules, setRules] = useState<RuleData[]>([])
  const [draft, setDraft] = useState<RuleDraft | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [draftError, setDraftError] = useState<string | null>(null)
  const [deleteError, setDeleteError] = useState<string | null>(null)
  const [draftSnapshot, setDraftSnapshot] = useState<string | null>(null)

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  )

  async function getToken() {
    const { data: { session } } = await supabase.auth.getSession()
    return session?.access_token ?? null
  }

  const questionMap = useMemo(
    () => new Map(questions.map((q) => [q.id, q])),
    [questions],
  )

  const brokenConditionMap = useMemo((): Map<string, string> => {
    if (!draft?.id) return new Map()
    const rule = rules.find((r) => r.id === draft.id)
    if (!rule || rule.status !== "broken") return new Map()
    return new Map(rule.broken_reasons.map((r) => [r.condition_id, r.message]))
  }, [draft?.id, rules])

  const isOpenRuleBroken = useMemo(
    () => !!draft?.id && rules.find((r) => r.id === draft.id)?.status === "broken",
    [draft?.id, rules],
  )

  // All question types are now supported
  const supportedQuestions = useMemo(
    () => questions.filter((q) => conditionTypesForQuestionType(q.question_type).length > 0),
    [questions],
  )

  const hasUnsavedChanges = useMemo(
    () => draft ? (!draft.id || serializeDraft(draft) !== draftSnapshot) : false,
    [draft, draftSnapshot],
  )

  const loadBundle = useCallback(async (surveyId: string) => {
    const token = await getToken()
    if (!token || !surveyId) return
    const bundle: RuleBundleData = await fetchRuleBundleDirect(token, surveyId)
    setQuestions(bundle.questions)
    setRules(bundle.rules)
    setDraft(null)
    setDraftSnapshot(null)
    setDraftError(null)
    setError(null)
  }, [])

  async function confirmDiscard() {
    if (!hasUnsavedChanges) return true
    return confirm({
      title: "Unsaved changes",
      message: "Discard the current rule changes?",
      confirmLabel: "Discard",
      cancelLabel: "Keep editing",
      variant: "danger",
    })
  }

  useEffect(() => {
    async function load() {
      const token = await getToken()
      if (!token) return
      try {
        const surveyRows = await fetchSurveys(token)
        setSurveys(surveyRows)
        const paramId = initialSurveyIdParam && surveyRows.some((s) => s.id === initialSurveyIdParam) ? initialSurveyIdParam : ""
        const initialId = paramId || surveyRows[0]?.id || ""
        setSelectedSurveyId(initialId)
        if (initialId) {
          const bundle = await fetchRuleBundleDirect(token, initialId)
          setQuestions(bundle.questions)
          setRules(bundle.rules)
        }
      } catch (err) {
        setError(extractErrorMessage(err, "Failed to load rules"))
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [])

  // Auto-dismiss error banners
  useEffect(() => {
    if (!draftError) return
    const t = setTimeout(() => setDraftError(null), 6000)
    return () => clearTimeout(t)
  }, [draftError])

  useEffect(() => {
    if (!deleteError) return
    const t = setTimeout(() => setDeleteError(null), 6000)
    return () => clearTimeout(t)
  }, [deleteError])

  // ---- Rule CRUD --------------------------------------------------------

  async function startNewRule() {
    if (!(await confirmDiscard())) return
    setDraft({ name: "New rule", description: "", topOperator: "AND", items: [] })
    setDraftSnapshot(null)
    setDraftError(null)
  }

  async function openRule(rule: RuleData) {
    if (!(await confirmDiscard())) return
    const next = draftFromRule(rule)
    setDraft(next)
    setDraftSnapshot(serializeDraft(next))
    setDraftError(null)
  }

  async function saveDraft() {
    if (!draft || !selectedSurveyId) return
    const validationError = validateDraft(draft, questionMap)
    if (validationError) {
      setDraftError(validationError)
      return
    }
    const token = await getToken()
    if (!token) return
    setSaving(true)
    setDraftError(null)
    try {
      const payload = payloadFromDraft(draft)
      const isNew = !draft.id
      const saved = isNew
        ? await createRuleDirect(token, selectedSurveyId, payload)
        : await updateRuleDirect(token, selectedSurveyId, draft.id!, { ...payload, updated_at: draft.updated_at ?? "" } as RuleUpdatePayload)

      if (isNew && window.self !== window.top) {
        window.parent.postMessage(
          { type: "venue_voice_rule_created", ruleId: saved.id, ruleName: saved.name },
          window.location.origin,
        )
      }

      setRules((current) => {
        const exists = current.some((r) => r.id === saved.id)
        return exists ? current.map((r) => (r.id === saved.id ? saved : r)) : [saved, ...current]
      })
      const nextDraft = draftFromRule(saved)
      setDraft(nextDraft)
      setDraftSnapshot(serializeDraft(nextDraft))
      void refreshBrokenRuleCount()
    } catch (err) {
      if (isStaleObjectError(err)) {
        setDraftError("This rule was updated elsewhere. Please refresh.")
      } else {
        setDraftError(extractErrorMessage(err, "Failed to save rule"))
      }
    } finally {
      setSaving(false)
    }
  }

  async function deleteRule(rule: RuleData) {
    const ok = await confirm({
      title: `Delete rule — ${rule.name}`,
      message: "Are you sure you want to delete this rule? This cannot be undone.",
      confirmLabel: "Delete",
      variant: "danger",
    })
    if (!ok) return
    const token = await getToken()
    if (!token || !selectedSurveyId) return
    try {
      await deleteSurveyLogicRule(token, selectedSurveyId, rule.id, rule.updated_at)
      setRules((current) => current.filter((r) => r.id !== rule.id))
      setDraft((current) => (current?.id === rule.id ? null : current))
      setDraftSnapshot((current) => (draft?.id === rule.id ? null : current))
      void refreshBrokenRuleCount()
    } catch (err) {
      if (isStaleObjectError(err)) {
        setDeleteError("This rule was updated. Please refresh.")
      } else {
        setDeleteError(extractErrorMessage(err, "Failed to delete rule"))
      }
    }
  }

  // ---- Draft mutations --------------------------------------------------

  function updateItem(index: number, next: TopLevelItem) {
    setDraft((cur) =>
      cur ? { ...cur, items: cur.items.map((item, i) => (i === index ? next : item)) } : cur,
    )
  }

  async function deleteTopLevelItem(index: number) {
    const ok = await confirm({
      title: "Delete condition",
      message: "Are you sure you want to delete this condition?",
      confirmLabel: "Delete",
      variant: "danger",
    })
    if (!ok) return
    setDraft((cur) =>
      cur ? { ...cur, items: cur.items.filter((_, i) => i !== index) } : cur,
    )
  }

  async function deleteSubCondition(groupLocalId: string, condLocalId: string) {
    const ok = await confirm({
      title: "Delete condition",
      message: "Are you sure you want to delete this condition?",
      confirmLabel: "Delete",
      variant: "danger",
    })
    if (!ok) return
    setDraft((cur) => {
      if (!cur) return cur
      return {
        ...cur,
        items: cur.items.map((item) =>
          item.kind === "group" && item.localId === groupLocalId
            ? { ...item, conditions: item.conditions.filter((c) => c.localId !== condLocalId) }
            : item,
        ),
      }
    })
  }

  // ---- Loading / error states -------------------------------------------

  if (loading) {
    return (
      <div className="flex min-h-[220px] items-center justify-center">
        <LoadingSpinner size="lg" />
      </div>
    )
  }

  if (error) {
    return (
      <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
        {error}
      </div>
    )
  }

  if (surveys.length === 0) {
    return (
      <Card className="flex flex-col items-center gap-3 py-16">
        <Bell className="h-8 w-8 text-zinc-300" />
        <p className="text-sm font-medium text-zinc-500">Create a survey before adding rules.</p>
      </Card>
    )
  }

  // ---- Render -----------------------------------------------------------

  return (
    <div className="space-y-6">
      {ConfirmDialogRender}

      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-zinc-950">Rules</h1>
          <p className="mt-1 text-sm text-zinc-500">
            Create logic rules to automate actions based on survey responses.
          </p>
        </div>
        <Button
          onClick={() => void startNewRule()}
          disabled={!selectedSurveyId || supportedQuestions.length === 0}
        >
          <Plus className="mr-1.5 h-4 w-4" />
          New rule
        </Button>
      </div>

      {deleteError && (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {deleteError}
        </div>
      )}

      <div className="grid gap-6 xl:grid-cols-[minmax(0,430px)_minmax(0,1fr)]">
        {/* Left panel */}
        <div className="space-y-4">
          {/* Survey selector */}
          <Card>
            <div className="space-y-4">
              <div>
                <h2 className="text-lg font-semibold text-zinc-900">Survey rules</h2>
                <p className="mt-1 text-sm text-zinc-500">
                  Choose the survey you want to configure rules for.
                </p>
              </div>
              <div>
                <span className="text-xs font-semibold uppercase tracking-wide text-zinc-500">
                  Survey
                </span>
                <div className="mt-1">
                  <SingleSelectDropdown
                    options={surveys.map((s) => ({ value: s.id, label: s.name }))}
                    value={selectedSurveyId}
                    onChange={async (nextId) => {
                      if (!(await confirmDiscard())) return
                      setSelectedSurveyId(nextId)
                      setLoading(true)
                      try {
                        await loadBundle(nextId)
                      } catch (err) {
                        setError(extractErrorMessage(err, "Failed to load survey rules"))
                      } finally {
                        setLoading(false)
                      }
                    }}
                  />
                </div>
              </div>
            </div>
          </Card>

          {/* Saved rules list */}
          <Card>
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-base font-semibold text-zinc-900">Saved rules</h2>
              <span className="text-sm text-zinc-500">{rules.length}</span>
            </div>

            {rules.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-zinc-200 bg-zinc-50 px-4 py-8 text-center text-sm text-zinc-500">
                No rules for this survey yet.
              </div>
            ) : (
              <div className="space-y-3">
                {rules.map((rule) => (
                  <div
                    key={rule.id}
                    role="button"
                    tabIndex={0}
                    onClick={() => void openRule(rule)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault()
                        void openRule(rule)
                      }
                    }}
                    className={[
                      "rounded-2xl border px-4 py-3 transition-colors",
                      draft?.id === rule.id
                        ? "border-violet-300 bg-violet-50"
                        : rule.status === "broken"
                          ? "border-red-200 bg-white hover:border-red-300"
                          : "border-zinc-200 bg-white hover:border-violet-200 hover:bg-violet-50/40",
                    ].join(" ")}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="truncate font-medium text-zinc-900">{rule.name}</p>
                        {rule.description ? (
                          <p className="mt-1 text-sm text-zinc-600">
                            {truncateDescription(rule.description)}
                          </p>
                        ) : (
                          <p className="mt-1 text-sm text-zinc-400">No description</p>
                        )}
                        <p className="mt-1.5 text-xs text-zinc-400">
                          {rule.conditions.length} condition{rule.conditions.length !== 1 ? "s" : ""}
                        </p>
                        {rule.status === "broken" && (
                          <span className="mt-2 inline-flex items-center gap-1 rounded-full bg-red-50 px-2 py-0.5 text-xs font-medium text-red-600">
                            <AlertTriangle className="h-3 w-3" />
                            Broken
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-1">
                        <button
                          type="button"
                          className="rounded-lg p-2 text-zinc-400 hover:bg-zinc-100 hover:text-zinc-700"
                          onClick={(e) => { e.stopPropagation(); void openRule(rule) }}
                          aria-label={`Edit ${rule.name}`}
                        >
                          <Pencil className="h-4 w-4" />
                        </button>
                        <button
                          type="button"
                          className="rounded-lg p-2 text-zinc-400 hover:bg-red-50 hover:text-red-600"
                          onClick={(e) => { e.stopPropagation(); void deleteRule(rule) }}
                          aria-label={`Delete ${rule.name}`}
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </Card>
        </div>

        {/* Right panel — editor */}
        <div>
          {draft ? (
            <Card>
              {/* Editor header */}
              <div className="mb-4 flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <h2 className="text-base font-semibold text-zinc-900">
                    {draft.id ? "Edit rule" : "Create rule"}
                  </h2>
                  <p className="mt-1 text-sm text-zinc-500">
                    Build conditions using any question from this survey.
                  </p>
                </div>
                <div className="flex shrink-0 gap-2">
                  <Button
                    variant="ghost"
                    onClick={async () => {
                      if (!(await confirmDiscard())) return
                      setDraft(null)
                      setDraftSnapshot(null)
                    }}
                    disabled={saving}
                  >
                    Cancel
                  </Button>
                  <Button onClick={() => void saveDraft()} disabled={saving}>
                    {saving ? (
                      <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
                    ) : (
                      <Save className="mr-1.5 h-4 w-4" />
                    )}
                    Save rule
                  </Button>
                </div>
              </div>

              {/* Broken rule banner */}
              {isOpenRuleBroken && (
                <div className="mb-2 flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                  <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                  <span>This rule is broken and cannot run until fixed. Update the highlighted conditions below.</span>
                </div>
              )}

              {/* Rule name */}
              <label className="block">
                <span className="text-xs font-semibold uppercase tracking-wide text-zinc-500">
                  Rule name
                </span>
                <input
                  className="mt-1 w-full rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-violet-500"
                  value={draft.name}
                  onChange={(e) =>
                    setDraft((cur) => (cur ? { ...cur, name: e.target.value } : cur))
                  }
                />
              </label>

              {/* Rule description */}
              <label className="block">
                <span className="text-xs font-semibold uppercase tracking-wide text-zinc-500">
                  Description{" "}
                  <span className="font-normal normal-case text-zinc-400">(optional)</span>
                </span>
                <textarea
                  className="mt-1 w-full resize-none rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-violet-500"
                  rows={2}
                  maxLength={240}
                  placeholder="Describe when this rule should fire…"
                  value={draft.description}
                  onChange={(e) =>
                    setDraft((cur) => (cur ? { ...cur, description: e.target.value } : cur))
                  }
                />
              </label>

              {/* Error banner */}
              {draftError && (
                <div className="mt-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                  {draftError}
                </div>
              )}

              {/* Conditions */}
              <div className="mt-6 space-y-4">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-semibold text-zinc-700">Conditions</h3>
                  {draft.items.length > 1 && (
                    <div className="flex items-center gap-2 text-xs text-zinc-500">
                      <span>Match</span>
                      <label className="relative inline-flex items-center">
                        <select
                          value={draft.topOperator}
                          onChange={(e) =>
                            setDraft((cur) =>
                              cur ? { ...cur, topOperator: e.target.value as "AND" | "OR" } : cur,
                            )
                          }
                          className="appearance-none rounded-full border border-violet-200 bg-violet-50 px-3 py-1 pr-7 text-xs font-semibold uppercase tracking-wide text-violet-700 outline-none hover:border-violet-300 focus:ring-2 focus:ring-violet-500"
                        >
                          <option value="AND">all</option>
                          <option value="OR">any</option>
                        </select>
                        <ChevronDown className="pointer-events-none absolute right-2 h-3 w-3 text-violet-600" />
                      </label>
                      <span>conditions</span>
                    </div>
                  )}
                </div>

                {draft.items.length === 0 ? (
                  <div className="rounded-2xl border border-dashed border-zinc-200 bg-zinc-50 px-4 py-8 text-center text-sm text-zinc-500">
                    Add a condition below.
                  </div>
                ) : (
                  <DndContext
                    sensors={sensors}
                    collisionDetection={closestCenter}
                    onDragEnd={({ active, over }) => {
                      if (!over || active.id === over.id) return
                      const oldIdx = draft.items.findIndex((item) => item.localId === String(active.id))
                      const newIdx = draft.items.findIndex((item) => item.localId === String(over.id))
                      if (oldIdx === -1 || newIdx === -1) return
                      setDraft((cur) =>
                        cur ? { ...cur, items: arrayMove(cur.items, oldIdx, newIdx) } : cur,
                      )
                    }}
                  >
                    <SortableContext
                      items={draft.items.map((item) => item.localId)}
                      strategy={verticalListSortingStrategy}
                    >
                      <div className="space-y-3">
                        {draft.items.map((item, index) => (
                          <div key={item.localId} className="space-y-3">
                            <SortableTopLevelItem
                              item={item}
                              index={index}
                              questions={supportedQuestions}
                              onUpdateItem={(next) => updateItem(index, next)}
                              onDeleteItem={() => void deleteTopLevelItem(index)}
                              onDeleteSubCondition={deleteSubCondition}
                              brokenConditionMap={brokenConditionMap}
                            />
                            {index < draft.items.length - 1 && (
                              <ConnectorPill
                                value={draft.topOperator}
                                onChange={(next) =>
                                  setDraft((cur) => (cur ? { ...cur, topOperator: next } : cur))
                                }
                              />
                            )}
                          </div>
                        ))}
                      </div>
                    </SortableContext>
                  </DndContext>
                )}

                {/* Add buttons */}
                <div className="flex flex-wrap gap-2 pt-1">
                  <Button
                    variant="outline"
                    disabled={supportedQuestions.length === 0}
                    onClick={() => {
                      const q = supportedQuestions[0]
                      if (!q) return
                      setDraft((cur) =>
                        cur
                          ? {
                              ...cur,
                              items: [...cur.items, { kind: "condition", ...makeConditionDraft(q) }],
                            }
                          : cur,
                      )
                    }}
                  >
                    <Plus className="mr-1.5 h-4 w-4" />
                    Add condition
                  </Button>
                  <Button
                    variant="outline"
                    disabled={supportedQuestions.length === 0}
                    onClick={() => {
                      const q = supportedQuestions[0]
                      if (!q) return
                      const group: GroupDraft = {
                        kind: "group",
                        localId: uid(),
                        groupOperator: "AND",
                        conditions: [makeConditionDraft(q)],
                      }
                      setDraft((cur) =>
                        cur ? { ...cur, items: [...cur.items, group] } : cur,
                      )
                    }}
                  >
                    <Plus className="mr-1.5 h-4 w-4" />
                    Add condition group
                  </Button>
                </div>
              </div>
            </Card>
          ) : (
            <Card className="flex flex-col items-center gap-3 py-16">
              <Bell className="h-8 w-8 text-zinc-300" />
              <p className="text-sm font-medium text-zinc-500">
                Select a rule to edit or create a new one.
              </p>
            </Card>
          )}
        </div>
      </div>
    </div>
  )
}
