"use client"

import type { CSSProperties } from "react"
import type {
  Align,
  MultipleChoiceSettings,
  NpsQuestionSettings,
  Question,
  StarQuestionSettings,
  Survey,
  TextContent,
  TextQuestionSettings,
  TextStyle,
  YesNoSettings,
} from "@/lib/survey/types"
import { StarQuestion } from "@/components/survey/StarQuestion"
import { TextQuestion } from "@/components/survey/TextQuestion"
import { PhotoQuestion } from "@/components/survey/PhotoQuestion"

export type SurveyResponseValue =
  | { type: "star"; value: number | null }
  | { type: "text"; value: string }
  | { type: "nps"; value: number | null }
  | { type: "choice"; value: string }
  | { type: "choices"; value: string[] }
  | { type: "photo"; value: File | null }

export type SurveyResponses = Record<string, SurveyResponseValue | undefined>

/** Check if a question has been answered (has a non-empty value). */
export function isQuestionAnswered(
  question: Question,
  response: SurveyResponseValue | undefined,
): boolean {
  if (!response) return false
  if (response.type === "star" || response.type === "nps") return response.value !== null
  if (response.type === "choices") return response.value.length > 0
  if (response.type === "choice") return response.value.length > 0
  if (response.type === "photo") return response.value instanceof File
  return String(response.value).trim().length > 0
}

/** Get IDs of compulsory questions that are unanswered. */
export function getUnansweredRequiredIds(
  survey: Survey,
  responses: SurveyResponses,
): string[] {
  return survey.questions
    .filter((q) => !q.optional && !isQuestionAnswered(q, responses[q.id]))
    .map((q) => q.id)
}

export function SurveyRenderer({
  survey,
  responses,
  onResponseChange,
  showProgressBar,
  unansweredRequiredIds = [],
}: {
  survey: Survey
  responses: SurveyResponses
  onResponseChange: (questionId: string, next: SurveyResponseValue) => void
  showProgressBar?: boolean
  unansweredRequiredIds?: string[]
}) {
  const displayProgressBar = showProgressBar ?? survey.settings.showProgressBar
  return (
    <div
      className="flex w-full flex-col gap-6"
      style={{
        fontFamily: survey.theme.fontFamily,
        color: survey.theme.textColor,
      }}
    >
      <div className="flex flex-col gap-2">
        <TextBlock
          content={survey.title}
          align={survey.settings.contentAlign}
          textColor={survey.theme.textColor}
        />
        {survey.subtitle ? (
          <TextBlock
            content={survey.subtitle}
            muted
            align={survey.settings.contentAlign}
            textColor={survey.theme.textColor}
          />
        ) : null}
      </div>

      <div className="flex flex-col gap-5">
        {survey.questions.map((q) => (
          <QuestionRenderer
            key={q.id}
            question={q}
            survey={survey}
            surveyAlign={survey.settings.contentAlign}
            response={responses[q.id]}
            onResponseChange={onResponseChange}
            showRequiredError={!q.optional && unansweredRequiredIds.includes(q.id)}
          />
        ))}
      </div>

      {displayProgressBar ? (
        <ProgressBar survey={survey} responses={responses} />
      ) : null}
    </div>
  )
}

function ProgressBar({
  survey,
  responses,
}: {
  survey: Survey
  responses: SurveyResponses
}) {
  const required = survey.questions.filter((q) => !q.optional)
  const requiredCount = required.length
  const answeredRequired = required.filter((q) => {
    const r = responses[q.id]
    if (!r) return false
    if (r.type === "star" || r.type === "nps") return r.value !== null
    if (r.type === "choices") return r.value.length > 0
    if (r.type === "choice") return r.value.length > 0
    return String(r.value).trim().length > 0
  }).length
  const progress = requiredCount > 0 ? Math.max(0, Math.min(1, answeredRequired / requiredCount)) : 0

  return (
    <div className="mt-2">
      <div className="h-2 w-full overflow-hidden rounded-full bg-zinc-100">
        <div
          className="h-full rounded-full transition-[width]"
          style={{
            width: `${Math.round(progress * 100)}%`,
            backgroundColor: survey.settings.progressBarColor,
          }}
          role="progressbar"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={Math.round(progress * 100)}
        />
      </div>
      {requiredCount > 0 ? (
        <div className="mt-1.5 text-xs text-zinc-500">
          {answeredRequired}/{requiredCount} required answered
        </div>
      ) : (
        <div className="mt-1.5 text-xs text-zinc-500">All questions optional</div>
      )}
    </div>
  )
}

function QuestionRenderer({
  question,
  survey,
  surveyAlign,
  response,
  onResponseChange,
  showRequiredError,
}: {
  question: Question
  survey: Survey
  surveyAlign: Align
  response: SurveyResponseValue | undefined
  onResponseChange: (questionId: string, next: SurveyResponseValue) => void
  showRequiredError?: boolean
}) {
  const align = question.contentAlign ?? surveyAlign

  const textColor = survey.theme.textColor ?? "#1E1E1E"
  return (
    <div className="flex flex-col gap-3" style={{ textAlign: align }}>
      <div className="flex flex-col gap-1">
        <div className="flex items-baseline gap-1">
          <TextBlock content={question.title} align={align} textColor={textColor} />
          {!question.optional && (
            <span className="text-red-500" aria-label="required">*</span>
          )}
        </div>
        {question.description ? (
          <TextBlock content={question.description} muted align={align} textColor={textColor} />
        ) : null}
        {showRequiredError ? (
          <p className="text-sm text-red-600">This question is required</p>
        ) : null}
      </div>

      {question.type === "star" && (
        <StarQuestion
          starCount={(question.settings as StarQuestionSettings).starCount}
          selectedColor={(question.settings as StarQuestionSettings).selected_colour ?? survey.theme.primaryColor}
          align={align}
          value={response?.type === "star" ? response.value : null}
          onChange={(next) => onResponseChange(question.id, { type: "star", value: next })}
        />
      )}

      {question.type === "nps" && (
        <NpsQuestion
          settings={question.settings as NpsQuestionSettings}
          value={response?.type === "nps" ? response.value : null}
          onChange={(v) => onResponseChange(question.id, { type: "nps", value: v ?? null })}
        />
      )}

      {(question.type === "text" ||
        question.type === "long_text" ||
        question.type === "email" ||
        question.type === "phone") && (
        <TextQuestion
          placeholder={(question.settings as TextQuestionSettings).placeholder}
          multiline={question.type === "long_text"}
          value={response?.type === "text" ? response.value : ""}
          onChange={(next) => onResponseChange(question.id, { type: "text", value: next })}
        />
      )}

      {(question.type === "multiple_choice" || question.type === "checkbox") && (
        <ChoiceQuestion
          options={(question.settings as MultipleChoiceSettings).options ?? []}
          multi={question.type === "checkbox"}
          selectedColor={(question.settings as MultipleChoiceSettings).selected_colour ?? survey.theme.primaryColor}
          value={
            response?.type === "choice"
              ? [response.value]
              : response?.type === "choices"
                ? response.value
                : []
          }
          onChange={(v) => {
            if (question.type === "checkbox") {
              onResponseChange(question.id, { type: "choices", value: v })
            } else {
              onResponseChange(question.id, { type: "choice", value: v[0] ?? "" })
            }
          }}
        />
      )}

      {question.type === "yes_no" && (
        <YesNoQuestion
          settings={question.settings as YesNoSettings}
          surveyPrimaryColor={survey.theme.primaryColor}
          value={response?.type === "choice" ? response.value : null}
          onChange={(v) => onResponseChange(question.id, { type: "choice", value: v })}
        />
      )}

      {question.type === "photo" && (
        <PhotoQuestion
          value={response?.type === "photo" ? response.value : null}
          align={align}
          onChange={(file) => onResponseChange(question.id, { type: "photo", value: file })}
        />
      )}
    </div>
  )
}

function NpsQuestion({
  settings,
  value,
  onChange,
}: {
  settings: NpsQuestionSettings
  value: number | null
  onChange: (v: number | null) => void
}) {
  const selectedColor = settings.selected_colour ?? "#7C3AED"
  const count = Math.max(1, Math.min(10, settings.max_score ?? 10)) + 1
  const minLabel = settings.minLabel ?? settings.min_label ?? "Not likely"
  const maxLabel = settings.maxLabel ?? settings.max_label ?? "Extremely likely"

  return (
    <div className="w-full max-w-full">
      <div className="mb-1.5 flex justify-between gap-2 text-[11px] text-zinc-400">
        <span className="min-w-0 shrink text-left">{minLabel}</span>
        <span className="min-w-0 shrink text-right">{maxLabel}</span>
      </div>
      <div
        className="grid w-full gap-1"
        style={{ gridTemplateColumns: `repeat(${count}, minmax(0, 1fr))` }}
        role="group"
        aria-label="NPS score"
      >
        {Array.from({ length: count }, (_, i) => {
          const score = i
          return (
            <button
              key={score}
              type="button"
              onClick={() => onChange(value === score ? null : score)}
              style={
                value === score
                  ? { borderColor: selectedColor, backgroundColor: selectedColor }
                  : undefined
              }
              className={[
                "flex min-h-9 min-w-0 w-full items-center justify-center rounded-lg border text-sm font-medium transition-colors",
                value === score
                  ? "border-current text-white"
                  : "border-zinc-200 bg-white text-zinc-700 hover:border-violet-300 hover:bg-zinc-50",
              ].join(" ")}
            >
              {score}
            </button>
          )
        })}
      </div>
    </div>
  )
}

function ChoiceQuestion({
  options,
  multi,
  selectedColor,
  value,
  onChange,
}: {
  options: string[]
  multi: boolean
  selectedColor: string
  value: string[]
  onChange: (v: string[]) => void
}) {
  function toggle(opt: string) {
    if (multi) {
      const next = value.includes(opt) ? value.filter((v) => v !== opt) : [...value, opt]
      onChange(next)
    } else {
      onChange(value.includes(opt) ? [] : [opt])
    }
  }

  return (
    <div className="flex flex-col gap-2">
      {options.map((opt) => {
        const selected = value.includes(opt)
        return (
          <button
            key={opt}
            type="button"
            onClick={() => toggle(opt)}
            className={[
              "rounded-xl border px-4 py-2.5 text-left text-sm transition-colors",
              selected
                ? "border-current"
                : "border-zinc-200 bg-white text-zinc-700 hover:border-zinc-300",
            ].join(" ")}
            style={
              selected
                ? {
                    borderColor: selectedColor,
                    backgroundColor: `${selectedColor}15`,
                    color: selectedColor,
                  }
                : undefined
            }
          >
            {opt}
          </button>
        )
      })}
    </div>
  )
}

function YesNoQuestion({
  settings,
  surveyPrimaryColor,
  value,
  onChange,
}: {
  settings: YesNoSettings
  surveyPrimaryColor: string
  value: string | null
  onChange: (v: string) => void
}) {
  const yes = settings.yesLabel ?? "Yes"
  const no = settings.noLabel ?? "No"
  const selectedColor = settings.selected_colour ?? surveyPrimaryColor
  return (
    <div className="flex gap-3">
      {[yes, no].map((label) => {
        const selected = value === label
        return (
          <button
            key={label}
            type="button"
            onClick={() => onChange(selected ? "" : label)}
            className={[
              "flex-1 rounded-xl border px-4 py-2.5 text-sm font-medium transition-colors",
              selected
                ? "border-current text-white"
                : "border-zinc-200 bg-white text-zinc-700 hover:border-zinc-300",
            ].join(" ")}
            style={
              selected
                ? { borderColor: selectedColor, backgroundColor: selectedColor }
                : undefined
            }
          >
            {label}
          </button>
        )
      })}
    </div>
  )
}

function TextBlock({
  content,
  muted,
  align,
  textColor = "#1E1E1E",
}: {
  content: TextContent
  muted?: boolean
  align: Align
  textColor?: string
}) {
  const style = getTextStyle(content.style)
  return (
    <div
      className={style.className}
      style={{
        ...style.style,
        textAlign: align,
        color: textColor,
        opacity: muted ? 0.7 : 1,
      }}
    >
      {content.text}
    </div>
  )
}

function getTextStyle(style: TextStyle): {
  className: string
  style: CSSProperties
} {
  const className =
    style.size === "h1"
      ? "text-3xl leading-9"
      : style.size === "h2"
        ? "text-xl leading-7"
        : style.size === "h3"
          ? "text-lg leading-6"
          : "text-base leading-6"

  return {
    className: [
      className,
      style.bold ? "font-semibold" : "font-normal",
      style.underline ? "underline underline-offset-4" : "",
    ]
      .filter(Boolean)
      .join(" "),
    style: {},
  }
}
