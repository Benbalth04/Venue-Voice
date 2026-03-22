"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
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
import {
  Bell,
  ChevronDown,
  GripVertical,
  Loader2,
  Pencil,
  Plus,
  Save,
  Trash2,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { useConfirm } from "@/components/ui/ConfirmDialog"
import { SingleSelectDropdown } from "@/components/ui/DropdownSelect"
import { supabase } from "@/lib/supabase/client"
import {
  createSurveyLogicRule,
  deleteSurveyLogicRule,
  extractErrorMessage,
  fetchSurveyLogicRules,
  fetchSurveys,
  updateSurveyLogicRule,
  type LogicActionType,
  type LogicConditionPayload,
  type LogicConditionResponse,
  type LogicConnector,
  type LogicOperator,
  type LogicQuestionOption,
  type LogicRulePayload,
  type LogicRuleResponse,
  type SurveySummary,
} from "@/lib/api/client"

const MAX_RULE_DESCRIPTION_LENGTH = 240
const GROUP_OPERATOR: LogicOperator = "group"

type LeafOperator = Exclude<LogicOperator, "group">

type LeafConditionDraft = {
  kind: "condition"
  localId: string
  id?: string
  question_id: string
  question_text?: string | null
  question_type?: string | null
  operator: LeafOperator
  threshold_value: number | null
  logical_connector: LogicConnector
}

type ConditionGroupDraft = {
  kind: "group"
  localId: string
  id?: string
  logical_connector: LogicConnector
  conditions: LeafConditionDraft[]
}

type RuleItemDraft = LeafConditionDraft | ConditionGroupDraft

type RuleDraft = {
  id?: string
  name: string
  description: string
  enabled: boolean
  action_type: LogicActionType
  conditions: RuleItemDraft[]
}

function uid() {
  return crypto.randomUUID()
}

function isSupportedQuestion(question: Pick<LogicQuestionOption, "question_type" | "is_numeric">) {
  return (
    question.is_numeric ||
    question.question_type === "text" ||
    question.question_type === "long_text" ||
    question.question_type === "email" ||
    question.question_type === "phone"
  )
}

function operatorOptionsForQuestion(
  question: Pick<LogicQuestionOption, "question_type" | "is_numeric"> | null | undefined,
): Array<{ value: LeafOperator; label: string }> {
  if (!question) return []
  if (question.is_numeric) {
    return [
      { value: ">", label: "greater than" },
      { value: ">=", label: "greater than or equal to" },
      { value: "<", label: "less than" },
      { value: "<=", label: "less than or equal to" },
    ]
  }
  if (question.question_type === "text" || question.question_type === "long_text") {
    return [
      { value: "sentiment_positive", label: "sentiment is positive" },
      { value: "sentiment_negative", label: "sentiment is negative" },
      { value: "=", label: "score is equal to" },
      { value: ">", label: "sentiment score is greater than" },
      { value: ">=", label: "sentiment score is greater than or equal to" },
      { value: "<", label: "sentiment score is less than" },
      { value: "<=", label: "sentiment score is less than or equal to" },
      { value: "not_blank", label: "is not blank" },
    ]
  }
  return [
    { value: "not_blank", label: "is not blank" },
  ]
}

function requiresThreshold(operator: LeafOperator) {
  return operator === ">" || operator === ">=" || operator === "<" || operator === "<=" || operator === "="
}

function defaultOperatorForQuestion(question: Pick<LogicQuestionOption, "question_type" | "is_numeric">) {
  return operatorOptionsForQuestion(question)[0]?.value ?? "not_blank"
}

function truncateDescription(value: string, maxLength = 96) {
  if (value.length <= maxLength) return value
  return `${value.slice(0, maxLength).trimEnd()}…`
}

function makeLeafCondition(question: LogicQuestionOption): LeafConditionDraft {
  return {
    kind: "condition",
    localId: uid(),
    question_id: question.id,
    question_text: question.question_text,
    question_type: question.question_type,
    operator: defaultOperatorForQuestion(question),
    threshold_value: question.is_numeric ? 0 : null,
    logical_connector: "AND",
  }
}

function makeConditionGroup(question: LogicQuestionOption): ConditionGroupDraft {
  return {
    kind: "group",
    localId: uid(),
    logical_connector: "AND",
    conditions: [makeLeafCondition(question)],
  }
}

function normalizeTopLevel(items: RuleItemDraft[]) {
  const connector = items[1]?.logical_connector ?? "AND"
  return items.map((item, index) => ({
    ...item,
    logical_connector: index === 0 ? "AND" : connector,
  }))
}

function normalizeGroupConditions(items: LeafConditionDraft[]) {
  const connector = items[1]?.logical_connector ?? "AND"
  return items.map((item, index) => ({
    ...item,
    logical_connector: index === 0 ? "AND" : connector,
  }))
}

function topLevelConnector(items: RuleItemDraft[]) {
  return items[1]?.logical_connector ?? "AND"
}

function groupConnector(group: ConditionGroupDraft) {
  return group.conditions[1]?.logical_connector ?? "AND"
}

function validateLeafCondition(
  condition: LeafConditionDraft,
  questionMap: Map<string, LogicQuestionOption>,
) {
  const question = questionMap.get(condition.question_id) ?? (
    condition.question_type
      ? {
          id: condition.question_id,
          question_key: "",
          question_text: condition.question_text ?? "Unknown question",
          question_type: condition.question_type,
          is_numeric: condition.question_type === "nps" || condition.question_type === "star",
          position: 0,
        }
      : null
  )

  if (!question) return "Each condition needs a valid question."
  if (!isSupportedQuestion(question)) return `${question.question_text} does not support logic rules yet.`

  const validOperators = operatorOptionsForQuestion(question).map((option) => option.value)
  if (!validOperators.includes(condition.operator)) {
    return `Operator ${condition.operator} is not valid for ${question.question_text}.`
  }
  if (
    requiresThreshold(condition.operator) &&
    (condition.threshold_value == null || Number.isNaN(condition.threshold_value))
  ) {
    return `A numeric threshold is required for ${question.question_text}.`
  }
  if (!requiresThreshold(condition.operator) && condition.threshold_value != null) {
    return `${question.question_text} does not use a threshold for that operator.`
  }
  return null
}

function validateDraft(draft: RuleDraft, questionMap: Map<string, LogicQuestionOption>) {
  if (!draft.name.trim()) return "Rule name is required."
  if (draft.description.trim().length > MAX_RULE_DESCRIPTION_LENGTH) {
    return `Rule description must be ${MAX_RULE_DESCRIPTION_LENGTH} characters or fewer.`
  }
  if (draft.conditions.length === 0) return "Add at least one condition or condition group."

  for (const item of draft.conditions) {
    if (item.kind === "group") {
      if (item.conditions.length === 0) return "Condition groups must contain at least one condition."
      for (const condition of item.conditions) {
        const error = validateLeafCondition(condition, questionMap)
        if (error) return error
      }
    } else {
      const error = validateLeafCondition(item, questionMap)
      if (error) return error
    }
  }

  return null
}

function draftFromRule(rule: LogicRuleResponse): RuleDraft {
  const mapNode = (node: LogicConditionResponse): RuleItemDraft => {
    if (node.operator === GROUP_OPERATOR) {
      return {
        kind: "group",
        localId: uid(),
        id: node.id,
        logical_connector: node.logical_connector,
        conditions: node.children.map((child) => ({
          kind: "condition",
          localId: uid(),
          id: child.id,
          question_id: child.question_id ?? "",
          question_text: child.question_text,
          question_type: child.question_type,
          operator: child.operator as LeafOperator,
          threshold_value: child.threshold_value,
          logical_connector: child.logical_connector,
        })),
      }
    }

    return {
      kind: "condition",
      localId: uid(),
      id: node.id,
      question_id: node.question_id ?? "",
      question_text: node.question_text,
      question_type: node.question_type,
      operator: node.operator as LeafOperator,
      threshold_value: node.threshold_value,
      logical_connector: node.logical_connector,
    }
  }

  return {
    id: rule.id,
    name: rule.name,
    description: rule.description ?? "",
    enabled: rule.enabled,
    action_type: rule.action_type,
    conditions: rule.conditions.map(mapNode),
  }
}

function payloadFromDraft(draft: RuleDraft): LogicRulePayload {
  const mapLeaf = (condition: LeafConditionDraft): LogicConditionPayload => ({
    id: condition.id ?? null,
    question_id: condition.question_id,
    operator: condition.operator,
    threshold_value: requiresThreshold(condition.operator) ? condition.threshold_value : null,
    logical_connector: condition.logical_connector,
    children: [],
  })

  return {
    name: draft.name.trim(),
    description: draft.description.trim() || null,
    enabled: draft.enabled,
    action_type: draft.action_type,
    conditions: draft.conditions.map((item) =>
      item.kind === "group"
        ? {
            id: item.id ?? null,
            question_id: null,
            operator: GROUP_OPERATOR,
            threshold_value: null,
            logical_connector: item.logical_connector,
            children: item.conditions.map(mapLeaf),
          }
        : mapLeaf(item),
    ),
  }
}

function serializeRuleDraft(draft: RuleDraft) {
  return JSON.stringify(payloadFromDraft(draft))
}

function LevelConnectorPill({
  value,
  onChange,
}: {
  value: LogicConnector
  onChange: (next: LogicConnector) => void
}) {
  return (
    <div className="flex justify-center">
      <label className="relative inline-flex items-center">
        <select
          value={value}
          onChange={(event) => onChange(event.target.value as LogicConnector)}
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

function SortableLeafConditionCard({
  title,
  condition,
  questions,
  onUpdate,
  onDelete,
}: {
  title: string
  condition: LeafConditionDraft
  questions: LogicQuestionOption[]
  onUpdate: (next: LeafConditionDraft) => void
  onDelete: () => void
}) {
  const { attributes, listeners, setNodeRef, transform, transition } = useSortable({
    id: condition.localId,
  })

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  }

  const questionMap = useMemo(
    () => new Map(questions.map((question) => [question.id, question])),
    [questions],
  )
  const selectedQuestion = questionMap.get(condition.question_id)
  const fallbackQuestion = condition.question_type
    ? {
        question_type: condition.question_type,
        is_numeric: condition.question_type === "nps" || condition.question_type === "star",
      }
    : null
  const operatorOptions = operatorOptionsForQuestion(selectedQuestion ?? fallbackQuestion)

  return (
    <div ref={setNodeRef} style={style}>
      <Card className="border-zinc-200">
        <div className="space-y-4">
          <div className="flex items-center justify-between gap-3">
            <p className="text-sm font-semibold text-zinc-900">{title}</p>
            <div className="flex items-center gap-2">
              <button
                type="button"
                className="rounded-lg border border-zinc-200 bg-white p-2 text-zinc-400 hover:text-zinc-700"
                aria-label={`Drag ${title}`}
                {...attributes}
                {...listeners}
              >
                <GripVertical className="h-4 w-4" />
              </button>
              <button
                type="button"
                className="rounded-lg border border-zinc-200 bg-white p-2 text-zinc-400 hover:bg-red-50 hover:text-red-600"
                onClick={onDelete}
                aria-label={`Delete ${title}`}
              >
                <Trash2 className="h-4 w-4" />
              </button>
            </div>
          </div>

          <label className="block">
            <span className="text-xs font-semibold uppercase tracking-wide text-zinc-500">
              Question
            </span>
            <select
              className="mt-1 w-full rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-violet-500"
              value={condition.question_id}
              onChange={(event) => {
                const question = questions.find((item) => item.id === event.target.value)
                if (!question) return
                onUpdate({
                  ...condition,
                  question_id: question.id,
                  question_text: question.question_text,
                  question_type: question.question_type,
                  operator: defaultOperatorForQuestion(question),
                  threshold_value: question.is_numeric ? 0 : null,
                })
              }}
            >
              {questions.map((question) => (
                <option key={question.id} value={question.id}>
                  {question.question_text}
                </option>
              ))}
            </select>
          </label>

          <div className="grid gap-3 md:grid-cols-2">
            <label className="block">
              <span className="text-xs font-semibold uppercase tracking-wide text-zinc-500">
                Operator
              </span>
              <select
                className="mt-1 w-full rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-violet-500"
                value={condition.operator}
                onChange={(event) => {
                  const operator = event.target.value as LeafOperator
                  onUpdate({
                    ...condition,
                    operator,
                    threshold_value: requiresThreshold(operator) ? (condition.threshold_value ?? 0) : null,
                  })
                }}
              >
                {operatorOptions.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>

            <label className="block">
              <span className="text-xs font-semibold uppercase tracking-wide text-zinc-500">
                Threshold
              </span>
              <input
                type="number"
                step="0.1"
                disabled={!requiresThreshold(condition.operator)}
                className="mt-1 w-full rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-violet-500 disabled:bg-zinc-50 disabled:text-zinc-400"
                value={condition.threshold_value ?? ""}
                onChange={(event) =>
                  onUpdate({
                    ...condition,
                    threshold_value: event.target.value === "" ? null : Number(event.target.value),
                  })
                }
              />
            </label>
          </div>
        </div>
      </Card>
    </div>
  )
}

function ConditionGroupCard({
  groupIndex,
  group,
  questions,
  onUpdateGroup,
  onDeleteGroup,
  onDeleteSubCondition,
}: {
  groupIndex: number
  group: ConditionGroupDraft
  questions: LogicQuestionOption[]
  onUpdateGroup: (next: ConditionGroupDraft) => void
  onDeleteGroup: () => void
  onDeleteSubCondition: (condition: LeafConditionDraft, title: string) => void
}) {
  const { attributes, listeners, setNodeRef, transform, transition } = useSortable({
    id: group.localId,
  })
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  )

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  }

  return (
    <div ref={setNodeRef} style={style}>
      <Card className="border-violet-200 bg-violet-50/30">
        <div className="space-y-4">
          <div className="flex items-center justify-between gap-3">
            <p className="text-sm font-semibold text-zinc-900">{`Condition ${groupIndex + 1}`}</p>
            <div className="flex items-center gap-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  const fallbackQuestion = questions[0]
                  if (!fallbackQuestion) return
                  onUpdateGroup({
                    ...group,
                    conditions: normalizeGroupConditions([
                      ...group.conditions,
                      makeLeafCondition(fallbackQuestion),
                    ]),
                  })
                }}
              >
                <Plus className="mr-1.5 h-4 w-4" />
                Add condition
              </Button>
              <button
                type="button"
                className="rounded-lg border border-zinc-200 bg-white p-2 text-zinc-400 hover:text-zinc-700"
                aria-label={`Drag condition group ${groupIndex + 1}`}
                {...attributes}
                {...listeners}
              >
                <GripVertical className="h-4 w-4" />
              </button>
              <button
                type="button"
                className="rounded-lg border border-zinc-200 bg-white p-2 text-zinc-400 hover:bg-red-50 hover:text-red-600"
                onClick={onDeleteGroup}
                aria-label={`Delete condition group ${groupIndex + 1}`}
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
              const oldIndex = group.conditions.findIndex((item) => item.localId === String(active.id))
              const newIndex = group.conditions.findIndex((item) => item.localId === String(over.id))
              if (oldIndex === -1 || newIndex === -1) return
              onUpdateGroup({
                ...group,
                conditions: normalizeGroupConditions(arrayMove(group.conditions, oldIndex, newIndex)),
              })
            }}
          >
            <SortableContext
              items={group.conditions.map((item) => item.localId)}
              strategy={verticalListSortingStrategy}
            >
              <div className="space-y-3">
                {group.conditions.map((condition, index) => (
                  <div key={condition.localId} className="space-y-3">
                    <SortableLeafConditionCard
                      title={`Condition ${groupIndex + 1}.${index + 1}`}
                      condition={condition}
                      questions={questions}
                      onUpdate={(nextCondition) => {
                        const nextConditions = [...group.conditions]
                        nextConditions[index] = nextCondition
                        onUpdateGroup({
                          ...group,
                          conditions: nextConditions,
                        })
                      }}
                      onDelete={() =>
                        onDeleteSubCondition(condition, `condition ${groupIndex + 1}.${index + 1}`)
                      }
                    />
                    {index < group.conditions.length - 1 ? (
                      <LevelConnectorPill
                        value={groupConnector(group)}
                        onChange={(nextConnector) =>
                          onUpdateGroup({
                            ...group,
                            conditions: normalizeGroupConditions(
                              group.conditions.map((item, itemIndex) => ({
                                ...item,
                                logical_connector: itemIndex === 0 ? "AND" : nextConnector,
                              })),
                            ),
                          })
                        }
                      />
                    ) : null}
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

function SortableTopLevelItem({
  item,
  index,
  questions,
  onUpdateItem,
  onDeleteItem,
  onDeleteSubCondition,
}: {
  item: RuleItemDraft
  index: number
  questions: LogicQuestionOption[]
  onUpdateItem: (next: RuleItemDraft) => void
  onDeleteItem: (label: string) => void
  onDeleteSubCondition: (condition: LeafConditionDraft, title: string) => void
}) {
  if (item.kind === "group") {
    return (
      <ConditionGroupCard
        groupIndex={index}
        group={item}
        questions={questions}
        onUpdateGroup={onUpdateItem}
        onDeleteGroup={() => onDeleteItem(`condition ${index + 1}`)}
        onDeleteSubCondition={onDeleteSubCondition}
      />
    )
  }

  return (
    <SortableLeafConditionCard
      title={`Condition ${index + 1}`}
      condition={item}
      questions={questions}
      onUpdate={onUpdateItem}
      onDelete={() => onDeleteItem(`condition ${index + 1}`)}
    />
  )
}

export default function RulesPage() {
  const { confirm, ConfirmDialogRender } = useConfirm()
  const [surveys, setSurveys] = useState<SurveySummary[]>([])
  const [selectedSurveyId, setSelectedSurveyId] = useState("")
  const [questions, setQuestions] = useState<LogicQuestionOption[]>([])
  const [rules, setRules] = useState<LogicRuleResponse[]>([])
  const [draft, setDraft] = useState<RuleDraft | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [draftError, setDraftError] = useState<string | null>(null)
  const [draftSnapshot, setDraftSnapshot] = useState<string | null>(null)

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  )

  async function getToken() {
    const {
      data: { session },
    } = await supabase.auth.getSession()
    return session?.access_token ?? null
  }

  const questionMap = useMemo(
    () => new Map(questions.map((question) => [question.id, question])),
    [questions],
  )
  const supportedQuestions = useMemo(
    () => questions.filter((question) => isSupportedQuestion(question)),
    [questions],
  )
  const hasUnsavedChanges = useMemo(
    () => (draft ? (!draft.id || serializeRuleDraft(draft) !== draftSnapshot) : false),
    [draft, draftSnapshot],
  )

  const loadBundle = useCallback(async (surveyId: string) => {
    const token = await getToken()
    if (!token || !surveyId) return
    const bundle = await fetchSurveyLogicRules(token, surveyId)
    setQuestions(bundle.questions)
    setRules(bundle.rules)
    setDraft(null)
    setDraftSnapshot(null)
    setDraftError(null)
    setError(null)
  }, [])

  async function confirmDiscardChanges() {
    if (!hasUnsavedChanges) return true
    return confirm({
      title: "You have unsaved changes",
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
        const initialSurveyId = surveyRows[0]?.id ?? ""
        setSelectedSurveyId(initialSurveyId)
        if (initialSurveyId) {
          const bundle = await fetchSurveyLogicRules(token, initialSurveyId)
          setQuestions(bundle.questions)
          setRules(bundle.rules)
        } else {
          setQuestions([])
          setRules([])
        }
      } catch (err) {
        setError(extractErrorMessage(err, "Failed to load rules"))
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [])

  async function startNewRule() {
    const proceed = await confirmDiscardChanges()
    if (!proceed) return
    const fallbackQuestion = supportedQuestions[0]
    if (!fallbackQuestion) return
    setDraft({
      name: "New rule",
      description: "",
      enabled: true,
      action_type: "none",
      conditions: [makeLeafCondition(fallbackQuestion)],
    })
    setDraftSnapshot(null)
    setDraftError(null)
  }

  async function openRule(rule: LogicRuleResponse) {
    const proceed = await confirmDiscardChanges()
    if (!proceed) return
    const nextDraft = draftFromRule(rule)
    setDraft(nextDraft)
    setDraftSnapshot(serializeRuleDraft(nextDraft))
    setDraftError(null)
  }

  async function requestDeleteTopLevelItem(label: string, localId: string) {
    const ok = await confirm({
      title: "Delete condition",
      message: `Delete ${label}?`,
      confirmLabel: "Delete",
      variant: "danger",
    })
    if (!ok) return

    setDraft((current) =>
      current
        ? {
            ...current,
            conditions: normalizeTopLevel(
              current.conditions.filter((item) => item.localId !== localId),
            ),
          }
        : current,
    )
  }

  async function requestDeleteSubCondition(condition: LeafConditionDraft, title: string) {
    const questionLabel =
      questionMap.get(condition.question_id)?.question_text ?? condition.question_text ?? title
    const ok = await confirm({
      title: "Delete condition",
      message: `Delete ${title} based on "${questionLabel}"?`,
      confirmLabel: "Delete",
      variant: "danger",
    })
    if (!ok) return

    setDraft((current) => {
      if (!current) return current
      return {
        ...current,
        conditions: current.conditions.map((item) =>
          item.kind === "group"
            ? {
                ...item,
                conditions: normalizeGroupConditions(
                  item.conditions.filter((subCondition) => subCondition.localId !== condition.localId),
                ),
              }
            : item,
        ),
      }
    })
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
      const saved = draft.id
        ? await updateSurveyLogicRule(token, selectedSurveyId, draft.id, payload)
        : await createSurveyLogicRule(token, selectedSurveyId, payload)

      setRules((current) => {
        const exists = current.some((rule) => rule.id === saved.id)
        return exists
          ? current.map((rule) => (rule.id === saved.id ? saved : rule))
          : [saved, ...current]
      })
      const nextDraft = draftFromRule(saved)
      setDraft(nextDraft)
      setDraftSnapshot(serializeRuleDraft(nextDraft))
    } catch (err) {
      setDraftError(extractErrorMessage(err, "Failed to save rule"))
    } finally {
      setSaving(false)
    }
  }

  async function deleteRule(rule: LogicRuleResponse) {
    const ok = await confirm({
      title: "Delete rule",
      message: `Delete "${rule.name}"?`,
      confirmLabel: "Delete",
      variant: "danger",
    })
    if (!ok) return

    const token = await getToken()
    if (!token || !selectedSurveyId) return

    try {
      await deleteSurveyLogicRule(token, selectedSurveyId, rule.id)
      setRules((current) => current.filter((item) => item.id !== rule.id))
      setDraft((current) => (current?.id === rule.id ? null : current))
      setDraftSnapshot((current) => (draft?.id === rule.id ? null : current))
    } catch (err) {
      setDraftError(extractErrorMessage(err, "Failed to delete rule"))
    }
  }

  if (loading) {
    return (
      <div className="flex min-h-[220px] items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-violet-500" />
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

  return (
    <div className="space-y-6">
      {ConfirmDialogRender}

      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className={!draft && rules.length === 0 ? "h-full" : undefined}>
          <h1 className="text-2xl font-semibold tracking-tight text-zinc-950">Rules</h1>
          <p className="mt-1 text-sm text-zinc-500">
            Create logic rules to automate actions based on survey responses.
          </p>
        </div>
              <Button onClick={() => void startNewRule()} disabled={!selectedSurveyId || supportedQuestions.length === 0}>
          <Plus className="mr-1.5 h-4 w-4" />
          New rule
        </Button>
      </div>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,430px)_minmax(0,1fr)]">
        <div className="space-y-4">
          <Card>
            <div className="space-y-4">
              <div>
                <h2 className="text-lg font-semibold text-zinc-900">Survey rules</h2>
                <p className="mt-1 text-sm text-zinc-500">
                  Choose the survey you want to configure rules for.
                </p>
              </div>

              <label className="block">
                <span className="text-xs font-semibold uppercase tracking-wide text-zinc-500">
                  Survey
                </span>
                <div className="mt-1">
                  <SingleSelectDropdown
                    options={surveys.map((survey) => ({ value: survey.id, label: survey.name }))}
                    value={selectedSurveyId}
                    onChange={async (nextSurveyId) => {
                      const proceed = await confirmDiscardChanges()
                      if (!proceed) return
                      setSelectedSurveyId(nextSurveyId)
                      setLoading(true)
                      try {
                        await loadBundle(nextSurveyId)
                      } catch (err) {
                        setError(extractErrorMessage(err, "Failed to load survey rules"))
                      } finally {
                        setLoading(false)
                      }
                    }}
                  />
                </div>
              </label>
            </div>
          </Card>

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
                    onKeyDown={(event) => {
                      if (event.key === "Enter" || event.key === " ") {
                        event.preventDefault()
                        void openRule(rule)
                      }
                    }}
                    className={[
                      "rounded-2xl border px-4 py-3 transition-colors",
                      draft?.id === rule.id
                        ? "border-violet-300 bg-violet-50"
                        : "border-zinc-200 bg-white hover:border-violet-200 hover:bg-violet-50/40",
                    ].join(" ")}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <p className="truncate font-medium text-zinc-900">{rule.name}</p>
                          <span
                            className={[
                              "rounded-full px-2 py-0.5 text-xs font-medium",
                              rule.enabled
                                ? "bg-emerald-50 text-emerald-700"
                                : "bg-zinc-100 text-zinc-500",
                            ].join(" ")}
                          >
                            {rule.enabled ? "Enabled" : "Disabled"}
                          </span>
                        </div>
                        {rule.description ? (
                          <p className="mt-1 text-sm text-zinc-600">{truncateDescription(rule.description)}</p>
                        ) : (
                          <p className="mt-1 text-sm text-zinc-400">No description</p>
                        )}
                      </div>
                      <div className="flex items-center gap-1">
                        <button
                          type="button"
                          className="rounded-lg p-2 text-zinc-400 hover:bg-zinc-100 hover:text-zinc-700"
                          onClick={(event) => {
                            event.stopPropagation()
                            void openRule(rule)
                          }}
                          aria-label={`Edit ${rule.name}`}
                        >
                          <Pencil className="h-4 w-4" />
                        </button>
                        <button
                          type="button"
                          className="rounded-lg p-2 text-zinc-400 hover:bg-red-50 hover:text-red-600"
                          onClick={(event) => {
                            event.stopPropagation()
                            void deleteRule(rule)
                          }}
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

        <div>
          {draft ? (
            <Card>
              <div className="mb-4 flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <h2 className="text-base font-semibold text-zinc-900">
                    {draft.id ? "Edit rule" : "Create rule"}
                  </h2>
                  <p className="mt-1 text-sm text-zinc-500">
                    Build your rule using standalone conditions and condition groups.
                  </p>
                </div>

                <div className="flex flex-shrink-0 gap-2">
                  <Button
                    variant="ghost"
                    onClick={async () => {
                      const proceed = await confirmDiscardChanges()
                      if (!proceed) return
                      setDraft(null)
                      setDraftSnapshot(null)
                    }}
                    disabled={saving}
                  >
                    Cancel
                  </Button>
                  <Button onClick={saveDraft} disabled={saving}>
                    {saving ? (
                      <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
                    ) : (
                      <Save className="mr-1.5 h-4 w-4" />
                    )}
                    Save rule
                  </Button>
                </div>
              </div>

              <label className="block">
                <span className="text-xs font-semibold uppercase tracking-wide text-zinc-500">
                  Rule name
                </span>
                <input
                  className="mt-1 w-full rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-violet-500"
                  value={draft.name}
                  onChange={(event) =>
                    setDraft((current) =>
                      current ? { ...current, name: event.target.value } : current,
                    )
                  }
                />
              </label>

              <label className="mt-4 block">
                <div className="flex items-center justify-between gap-3">
                  <span className="text-xs font-semibold uppercase tracking-wide text-zinc-500">
                    Description
                  </span>
                  <span className="text-xs text-zinc-400">
                    {draft.description.length}/{MAX_RULE_DESCRIPTION_LENGTH}
                  </span>
                </div>
                <textarea
                  maxLength={MAX_RULE_DESCRIPTION_LENGTH}
                  rows={3}
                  className="mt-1 w-full rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-violet-500"
                  value={draft.description}
                  onChange={(event) =>
                    setDraft((current) =>
                      current ? { ...current, description: event.target.value } : current,
                    )
                  }
                  placeholder="Add a short description for this rule."
                />
              </label>

              <label className="mt-4 flex items-center gap-2 text-sm text-zinc-700">
                <input
                  type="checkbox"
                  checked={draft.enabled}
                  onChange={(event) =>
                    setDraft((current) =>
                      current ? { ...current, enabled: event.target.checked } : current,
                    )
                  }
                />
                Rule is enabled
              </label>

              {draftError ? (
                <div className="mt-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                  {draftError}
                </div>
              ) : null}

              <div className="mt-6">
                <DndContext
                  sensors={sensors}
                  collisionDetection={closestCenter}
                  onDragEnd={({ active, over }) => {
                    if (!over || active.id === over.id || !draft) return
                    const oldIndex = draft.conditions.findIndex((item) => item.localId === String(active.id))
                    const newIndex = draft.conditions.findIndex((item) => item.localId === String(over.id))
                    if (oldIndex === -1 || newIndex === -1) return
                    setDraft({
                      ...draft,
                      conditions: normalizeTopLevel(arrayMove(draft.conditions, oldIndex, newIndex)),
                    })
                  }}
                >
                  <SortableContext
                    items={draft.conditions.map((item) => item.localId)}
                    strategy={verticalListSortingStrategy}
                  >
                    <div className="space-y-3">
                      {draft.conditions.map((item, index) => (
                        <div key={item.localId} className="space-y-3">
                          <SortableTopLevelItem
                            item={item}
                            index={index}
                            questions={supportedQuestions}
                            onUpdateItem={(nextItem) =>
                              setDraft((current) => {
                                if (!current) return current
                                const nextItems = [...current.conditions]
                                nextItems[index] = nextItem
                                return { ...current, conditions: nextItems }
                              })
                            }
                            onDeleteItem={(label) => {
                              void requestDeleteTopLevelItem(label, item.localId)
                            }}
                            onDeleteSubCondition={(condition, title) => {
                              void requestDeleteSubCondition(condition, title)
                            }}
                          />
                          {index < draft.conditions.length - 1 ? (
                            <LevelConnectorPill
                              value={topLevelConnector(draft.conditions)}
                              onChange={(nextConnector) =>
                                setDraft((current) =>
                                  current
                                    ? {
                                        ...current,
                                        conditions: normalizeTopLevel(
                                          current.conditions.map((ruleItem, ruleIndex) => ({
                                            ...ruleItem,
                                            logical_connector:
                                              ruleIndex === 0 ? "AND" : nextConnector,
                                          })),
                                        ),
                                      }
                                    : current,
                                )
                              }
                            />
                          ) : null}
                        </div>
                      ))}
                    </div>
                  </SortableContext>
                </DndContext>

                <div className="mt-4 flex flex-wrap gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => {
                      const fallbackQuestion = supportedQuestions[0]
                      if (!fallbackQuestion) return
                      setDraft((current) =>
                        current
                          ? {
                              ...current,
                              conditions: normalizeTopLevel([
                                ...current.conditions,
                                makeLeafCondition(fallbackQuestion),
                              ]),
                            }
                          : current,
                      )
                    }}
                  >
                    <Plus className="mr-1.5 h-4 w-4" />
                    Add condition
                  </Button>

                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => {
                      const fallbackQuestion = supportedQuestions[0]
                      if (!fallbackQuestion) return
                      setDraft((current) =>
                        current
                          ? {
                              ...current,
                              conditions: normalizeTopLevel([
                                ...current.conditions,
                                makeConditionGroup(fallbackQuestion),
                              ]),
                            }
                          : current,
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
            <Card className="flex h-full min-h-[320px] flex-col items-center justify-center gap-3">
              <Bell className="h-8 w-8 text-zinc-300" />
              <p className="text-sm font-medium text-zinc-700">Select a rule to edit or create a new one.</p>
              <p className="max-w-md text-center text-sm text-zinc-500">
                Rules can be added to one or more flows to be evaluated after each survey submission.
              </p>
            </Card>
          )}
        </div>
      </div>
    </div>
  )
}
