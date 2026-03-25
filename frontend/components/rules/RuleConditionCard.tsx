"use client"

import { GripVertical, Trash2 } from "lucide-react"
import { Card } from "@/components/ui/card"
import { DropdownSelect, SingleSelectDropdown } from "@/components/ui/DropdownSelect"
import type { LogicQuestionOption, RuleConditionType, RuleOperatorApi } from "@/lib/api/client"

// -----------------------------------------------------------------------
// Types
// -----------------------------------------------------------------------

export interface ConditionDraft {
  localId: string
  id?: string | null
  condition_type: RuleConditionType
  question_id: string
  operator: RuleOperatorApi | null
  value: string | string[] | null
}

// -----------------------------------------------------------------------
// Helpers — question-type → allowed condition types
// -----------------------------------------------------------------------

const CONDITION_TYPE_LABELS: Record<RuleConditionType, string> = {
  rating: "Star rating is",
  nps: "NPS score is",
  sentiment: "Sentiment is",
  not_empty: "Is not empty",
  checkbox: "Selected options include all of",
  multiple_choice: "Selected option is",
  yes_no: "Answer is",
}

export function conditionTypesForQuestionType(questionType: string): RuleConditionType[] {
  switch (questionType) {
    case "star":
      return ["rating", "not_empty"]
    case "nps":
      return ["nps", "not_empty"]
    case "text":
    case "long_text":
      return ["sentiment", "not_empty"]
    case "multiple_choice":
      return ["multiple_choice", "not_empty"]
    case "checkbox":
      return ["checkbox", "not_empty"]
    case "yes_no":
      return ["yes_no", "not_empty"]
    case "email":
    case "phone":
    case "photo":
      return ["not_empty"]
    default:
      return ["not_empty"]
  }
}

export function defaultConditionTypeForQuestion(questionType: string): RuleConditionType {
  return conditionTypesForQuestionType(questionType)[0] ?? "not_empty"
}

const _IS_OPERATOR_TYPES = new Set<RuleConditionType>([
  "sentiment",
  "multiple_choice",
  "yes_no",
  "checkbox",
])

export function defaultOperatorForConditionType(ct: RuleConditionType): RuleOperatorApi | null {
  if (ct === "rating" || ct === "nps") return "gte"
  if (_IS_OPERATOR_TYPES.has(ct)) return "is"
  return null
}

const NUMERIC_OPERATOR_OPTIONS: Array<{ value: RuleOperatorApi; label: string }> = [
  { value: "gte", label: "at least (≥)" },
  { value: "gt", label: "greater than (>)" },
  { value: "eq", label: "equal to (=)" },
  { value: "lte", label: "at most (≤)" },
  { value: "lt", label: "less than (<)" },
]

const SENTIMENT_OPTIONS = [
  { value: "positive", label: "Positive" },
  { value: "neutral", label: "Neutral" },
  { value: "negative", label: "Negative" },
]

const YES_NO_OPTIONS = [
  { value: "yes", label: "Yes" },
  { value: "no", label: "No" },
]

function numericRange(min: number, max: number): Array<{ value: string; label: string }> {
  const options = []
  for (let i = min; i <= max; i++) {
    options.push({ value: String(i), label: String(i) })
  }
  return options
}

function optionsFromConfig(config: Record<string, unknown> | null | undefined): Array<{ value: string; label: string }> {
  const raw = config?.options
  if (!Array.isArray(raw)) return []
  return raw.map((opt) => ({ value: String(opt), label: String(opt) }))
}

// -----------------------------------------------------------------------
// RuleConditionCard
// -----------------------------------------------------------------------

export function RuleConditionCard({
  label,
  condition,
  questions,
  onUpdate,
  onDelete,
  dragAttributes,
  dragListeners,
  brokenMessage,
}: {
  label: string
  condition: ConditionDraft
  questions: LogicQuestionOption[]
  onUpdate: (next: ConditionDraft) => void
  onDelete: () => void
  dragAttributes?: React.HTMLAttributes<HTMLElement>
  dragListeners?: Record<string, unknown>
  brokenMessage?: string | null
}) {
  const question = questions.find((q) => q.id === condition.question_id) ?? null
  const availableConditionTypes = question
    ? conditionTypesForQuestionType(question.question_type)
    : []

  const conditionTypeOptions = availableConditionTypes.map((ct) => ({
    value: ct,
    label: CONDITION_TYPE_LABELS[ct],
  }))

  const showConditionTypeSelector = conditionTypeOptions.length > 1

  const ct = condition.condition_type

  // Operator selector: only for numeric comparison types
  const showOperator = ct === "rating" || ct === "nps"

  // Value selector config
  let valueElement: React.ReactNode = null

  if (ct === "rating") {
    const starCount = typeof question?.config?.starCount === "number" ? question.config.starCount : 5
    const options = numericRange(1, starCount)
    const current = typeof condition.value === "string" ? condition.value : ""
    valueElement = (
      <SingleSelectDropdown
        options={options}
        value={current}
        onChange={(next) => onUpdate({ ...condition, value: next })}
        placeholder="Select rating"
      />
    )
  } else if (ct === "nps") {
    const maxScore = typeof question?.config?.max_score === "number" ? question.config.max_score : 10
    const options = numericRange(0, maxScore)
    const current = typeof condition.value === "string" ? condition.value : ""
    valueElement = (
      <SingleSelectDropdown
        options={options}
        value={current}
        onChange={(next) => onUpdate({ ...condition, value: next })}
        placeholder="Select score"
      />
    )
  } else if (ct === "sentiment") {
    const current = typeof condition.value === "string" ? condition.value : ""
    valueElement = (
      <SingleSelectDropdown
        options={SENTIMENT_OPTIONS}
        value={current}
        onChange={(next) => onUpdate({ ...condition, value: next })}
        placeholder="Select sentiment"
      />
    )
  } else if (ct === "multiple_choice") {
    const options = optionsFromConfig(question?.config)
    const current = typeof condition.value === "string" ? condition.value : ""
    valueElement = (
      <SingleSelectDropdown
        options={options}
        value={current}
        onChange={(next) => onUpdate({ ...condition, value: next })}
        placeholder={options.length === 0 ? "No options configured" : "Select option"}
        disabled={options.length === 0}
      />
    )
  } else if (ct === "checkbox") {
    const options = optionsFromConfig(question?.config)
    const current = Array.isArray(condition.value) ? condition.value : []
    valueElement = (
      <DropdownSelect
        options={options}
        value={current}
        multiple
        onChange={(next) => onUpdate({ ...condition, value: next as string[] })}
        placeholder={options.length === 0 ? "No options configured" : "Select options"}
        disabled={options.length === 0}
      />
    )
  } else if (ct === "yes_no") {
    const current = typeof condition.value === "string" ? condition.value : ""
    valueElement = (
      <SingleSelectDropdown
        options={YES_NO_OPTIONS}
        value={current}
        onChange={(next) => onUpdate({ ...condition, value: next })}
        placeholder="Select answer"
      />
    )
  }
  // not_empty: no value element

  return (
    <Card className={brokenMessage ? "border-red-300 bg-red-50" : "border-zinc-200"}>
      <div className="space-y-4">
        {/* Header */}
        <div className="flex items-center justify-between gap-3">
          <p className="text-sm font-semibold text-zinc-900">{label}</p>
          <div className="flex items-center gap-2">
            <button
              type="button"
              className="rounded-lg border border-zinc-200 bg-white p-2 text-zinc-400 hover:text-zinc-700"
              aria-label={`Drag ${label}`}
              {...(dragAttributes as React.HTMLAttributes<HTMLButtonElement>)}
              {...(dragListeners as React.HTMLAttributes<HTMLButtonElement>)}
            >
              <GripVertical className="h-4 w-4" />
            </button>
            <button
              type="button"
              className="rounded-lg border border-zinc-200 bg-white p-2 text-zinc-400 hover:bg-red-50 hover:text-red-600"
              onClick={onDelete}
              aria-label={`Delete ${label}`}
            >
              <Trash2 className="h-4 w-4" />
            </button>
          </div>
        </div>

        {/* Question selector */}
        <div>
          <span className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Question</span>
          <div className="mt-1">
            <SingleSelectDropdown
              options={questions.map((q) => ({ value: q.id, label: q.question_text }))}
              value={condition.question_id}
              onChange={(nextId) => {
                const nextQuestion = questions.find((q) => q.id === nextId)
                if (!nextQuestion) return
                const nextConditionType = defaultConditionTypeForQuestion(nextQuestion.question_type)
                const nextOperator = defaultOperatorForConditionType(nextConditionType)
                onUpdate({
                  ...condition,
                  question_id: nextId,
                  condition_type: nextConditionType,
                  operator: nextOperator,
                  value: null,
                })
              }}
              placeholder="Select question"
            />
          </div>
        </div>

        {/* Condition type selector — only when multiple choices exist */}
        {showConditionTypeSelector && (
          <div>
            <span className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Condition</span>
            <div className="mt-1">
              <SingleSelectDropdown
                options={conditionTypeOptions}
                value={ct}
                onChange={(nextCt) => {
                  const casted = nextCt as RuleConditionType
                  const nextOperator = defaultOperatorForConditionType(casted)
                  onUpdate({
                    ...condition,
                    condition_type: casted,
                    operator: nextOperator,
                    value: null,
                  })
                }}
                placeholder="Select condition"
              />
            </div>
          </div>
        )}

        {/* Operator + Value row */}
        {ct === "not_empty" ? (
          <p className="text-sm text-zinc-500 italic">
            Passes when the question has any answer.
          </p>
        ) : (
          <div className={showOperator ? "grid gap-3 md:grid-cols-2" : undefined}>
            {showOperator && (
              <div>
                <span className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Operator</span>
                <div className="mt-1">
                  <SingleSelectDropdown
                    options={NUMERIC_OPERATOR_OPTIONS}
                    value={condition.operator ?? ""}
                    onChange={(next) => onUpdate({ ...condition, operator: next as RuleOperatorApi })}
                    placeholder="Select operator"
                  />
                </div>
              </div>
            )}
            {valueElement != null && (
              <div className={showOperator ? undefined : "w-full"}>
                <span className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Value</span>
                <div className="mt-1">{valueElement}</div>
              </div>
            )}
          </div>
        )}

        {brokenMessage && (
          <p className="mt-1 flex items-center gap-1.5 text-xs font-medium text-red-600">
            <span className="inline-block h-1.5 w-1.5 shrink-0 rounded-full bg-red-500" />
            {brokenMessage}
          </p>
        )}
      </div>
    </Card>
  )
}
