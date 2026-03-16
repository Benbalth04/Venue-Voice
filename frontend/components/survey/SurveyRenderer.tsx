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

export type SurveyResponseValue =
  | { type: "star"; value: number | null }
  | { type: "text"; value: string }
  | { type: "nps"; value: number | null }
  | { type: "choice"; value: string }
  | { type: "choices"; value: string[] }

export type SurveyResponses = Record<string, SurveyResponseValue | undefined>

export function SurveyRenderer({
  survey,
  responses,
  onResponseChange,
  showProgressBar,
}: {
  survey: Survey
  responses: SurveyResponses
  onResponseChange: (questionId: string, next: SurveyResponseValue) => void
  showProgressBar?: boolean
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
        <TextBlock content={survey.title} align={survey.settings.contentAlign} />
        {survey.subtitle ? (
          <TextBlock
            content={survey.subtitle}
            muted
            align={survey.settings.contentAlign}
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
}: {
  question: Question
  survey: Survey
  surveyAlign: Align
  response: SurveyResponseValue | undefined
  onResponseChange: (questionId: string, next: SurveyResponseValue) => void
}) {
  const align = question.contentAlign ?? surveyAlign

  return (
    <div className="flex flex-col gap-3" style={{ textAlign: align }}>
      <div className="flex flex-col gap-1">
        <TextBlock content={question.title} align={align} />
        {question.description ? (
          <TextBlock content={question.description} muted align={align} />
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
  return (
    <div>
      <div className="flex flex-wrap gap-1">
        {Array.from(
          { length: Math.max(1, Math.min(10, settings.max_score ?? 10)) + 1 },
          (_, i) => {
            const score = i
            return (
          <button
            key={score}
            type="button"
            onClick={() => onChange(value === score ? null : score)}
            style={(value === score) ? { borderColor: selectedColor, backgroundColor: selectedColor } : undefined}
            className={[
              "h-9 w-9 rounded-lg text-sm font-medium border transition-colors",
              value === score
                ? "border-current text-white"
                : "border-zinc-200 bg-white text-zinc-700 hover:border-violet-300 hover:bg-zinc-50",
            ].join(" ")}
          >
            {score}
          </button>
            )
          },
        )}
      </div>
      <div className="mt-1 flex justify-between text-[11px] text-zinc-400">
        <span>{settings.minLabel ?? settings.min_label ?? "Not likely"}</span>
        <span>{settings.maxLabel ?? settings.max_label ?? "Extremely likely"}</span>
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
}: {
  content: TextContent
  muted?: boolean
  align: Align
}) {
  const style = getTextStyle(content.style)
  return (
    <div
      className={[
        style.className,
        muted ? "text-zinc-600" : "text-zinc-950",
      ].join(" ")}
      style={{ ...style.style, textAlign: align }}
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
