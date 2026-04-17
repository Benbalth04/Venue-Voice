"use client"

import type { Survey } from "@/lib/survey/types"
import type { EditorSelection } from "@/components/survey/SurveyEditor"
import { SurveySettings } from "@/components/survey/SurveySettings"
import { QuestionSettings } from "@/components/survey/QuestionSettings"

export function SettingsPanel({
  survey,
  selection,
  onSurveyChange,
}: {
  survey: Survey
  selection: EditorSelection
  onSurveyChange: (next: Survey) => void
}) {
  if (selection?.type === "question") {
    const question = survey.questions.find((q) => q.id === selection.questionId)
    if (!question) {
      return (
        <PanelShell title="Question Settings">
          <div className="text-sm text-zinc-600">No question selected.</div>
        </PanelShell>
      )
    }

    return (
      <PanelShell title="Question Settings">
        <QuestionSettings
          survey={survey}
          question={question}
          onSurveyChange={onSurveyChange}
        />
      </PanelShell>
    )
  }

  if (selection?.type === "thankYou") {
    return (
      <PanelShell title="Thank You Screen">
        <ThankYouSettings survey={survey} onSurveyChange={onSurveyChange} />
      </PanelShell>
    )
  }

  return (
    <PanelShell title="Survey Settings">
      <SurveySettings
        survey={survey}
        selection={selection}
        onSurveyChange={onSurveyChange}
      />
    </PanelShell>
  )
}

function ThankYouSettings({
  survey,
  onSurveyChange,
}: {
  survey: Survey
  onSurveyChange: (next: Survey) => void
}) {
  const title = survey.thankYou?.title ?? "Thank you!"
  const content = survey.thankYou?.content ?? "Your feedback has been received."

  function update(field: "title" | "content", value: string) {
    onSurveyChange({
      ...survey,
      thankYou: { title, content, [field]: value },
    })
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-1.5">
        <label className="text-xs font-medium text-zinc-700">Title</label>
        <input
          type="text"
          maxLength={100}
          value={title}
          onChange={(e) => update("title", e.target.value)}
          className="rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-900 outline-none focus:border-violet-500 focus:ring-1 focus:ring-violet-500"
        />
      </div>
      <div className="flex flex-col gap-1.5">
        <label className="text-xs font-medium text-zinc-700">Message</label>
        <textarea
          maxLength={500}
          rows={4}
          value={content}
          onChange={(e) => update("content", e.target.value)}
          className="resize-none rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-900 outline-none focus:border-violet-500 focus:ring-1 focus:ring-violet-500"
        />
        <p className="text-xs text-zinc-400">
          Shown to respondents who are not asked to leave a Google review.
        </p>
      </div>
    </div>
  )
}

function PanelShell({
  title,
  children,
}: {
  title: string
  children: React.ReactNode
}) {
  return (
    <div className="rounded-xl border border-zinc-200 bg-white p-4 shadow-sm">
      <div className="text-sm font-semibold text-zinc-900">{title}</div>
      <div className="mt-4">{children}</div>
    </div>
  )
}

