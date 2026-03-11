"use client"

import type { CSSProperties } from "react"
import type {
  Align,
  Question,
  StarQuestionSettings,
  Survey,
  TextContent,
  TextQuestionSettings,
  TextStyle,
} from "@/lib/survey/types"
import { StarQuestion } from "@/components/StarQuestion"
import { TextQuestion } from "@/components/TextQuestion"

export type SurveyResponseValue =
  | { type: "star"; value: number | null }
  | { type: "text"; value: string }

export type SurveyResponses = Record<number, SurveyResponseValue | undefined>

export function SurveyRenderer({
  survey,
  responses,
  onResponseChange,
}: {
  survey: Survey
  responses: SurveyResponses
  onResponseChange: (questionId: number, next: SurveyResponseValue) => void
}) {
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
            starSelectedColor={survey.theme.starSelectedColor}
            surveyAlign={survey.settings.contentAlign}
            response={responses[q.id]}
            onResponseChange={onResponseChange}
          />
        ))}
      </div>
    </div>
  )
}

function QuestionRenderer({
  question,
  starSelectedColor,
  surveyAlign,
  response,
  onResponseChange,
}: {
  question: Question
  starSelectedColor: string
  surveyAlign: Align
  response: SurveyResponseValue | undefined
  onResponseChange: (questionId: number, next: SurveyResponseValue) => void
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

      {question.type === "star" ? (
        <StarQuestion
          starCount={(question.settings as StarQuestionSettings).starCount}
          selectedColor={starSelectedColor}
          align={align}
          value={response?.type === "star" ? response.value : null}
          onChange={(next) =>
            onResponseChange(question.id, { type: "star", value: next })
          }
        />
      ) : (
        <TextQuestion
          placeholder={(question.settings as TextQuestionSettings).placeholder}
          value={response?.type === "text" ? response.value : ""}
          onChange={(next) =>
            onResponseChange(question.id, { type: "text", value: next })
          }
        />
      )}
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

