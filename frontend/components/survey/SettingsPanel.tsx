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

