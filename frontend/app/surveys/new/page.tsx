"use client"

import { useRef, useState } from "react"
import { Inter } from "next/font/google"
import { defaultSurvey } from "@/lib/survey/defaultSurvey"
import type { Question, Survey } from "@/lib/survey/types"
import { Toolbar } from "@/components/Toolbar"
import { SurveyEditor, type EditorSelection } from "@/components/SurveyEditor"
import { SettingsPanel } from "@/components/SettingsPanel"
import { SurveyPreview } from "@/components/SurveyPreview"

const inter = Inter({ subsets: ["latin"] })

export default function NewSurveyPage() {
  const [survey, setSurvey] = useState<Survey>(defaultSurvey)
  const [selection, setSelection] = useState<EditorSelection>(null)
  const [showPreview, setShowPreview] = useState(false)

  // IDs must never be reused, even if the highest-ID question was deleted.
  const nextQuestionIdRef = useRef<number>(
    survey.questions.reduce((m, q) => Math.max(m, q.id), 0) + 1,
  )

  function addQuestion(type: Question["type"]) {
    const id = nextQuestionIdRef.current
    nextQuestionIdRef.current += 1
    const base: Omit<Question, "settings"> = {
      id,
      version: 1,
      type,
      title: { text: "Untitled question", style: { size: "h2" } },
      description: { text: "", style: { size: "body" } },
      optional: false,
    }

    const q: Question =
      type === "star"
        ? {
            ...base,
            settings: { starCount: 5 },
          }
        : {
            ...base,
            settings: { placeholder: "Type your response..." },
          }

    setSurvey((prev) => ({
      ...prev,
      version: prev.version + 1,
      questions: [...prev.questions, q],
    }))
    setSelection({ type: "question", questionId: id })
  }

  function deleteQuestion(questionId: number) {
    const ok = window.confirm("Delete this question? This can't be undone.")
    if (!ok) return
    setSurvey((prev) => ({
      ...prev,
      version: prev.version + 1,
      questions: prev.questions.filter((q) => q.id !== questionId),
    }))
    setSelection((prev) =>
      prev?.type === "question" && prev.questionId === questionId ? null : prev,
    )
  }

  function reorderQuestions(nextIds: number[]) {
    const byId = new Map(survey.questions.map((q) => [q.id, q]))
    const nextQuestions = nextIds
      .map((id) => byId.get(id))
      .filter((q): q is Question => !!q)

    setSurvey((prev) => ({
      ...prev,
      version: prev.version + 1,
      questions: nextQuestions,
    }))
  }

  return (
    <div className={`${inter.className} min-h-screen bg-zinc-50`}>
      <div className="mx-auto w-[80%] px-6 py-8">
        <div className="mb-6 flex items-start justify-between gap-4">
          <div>
            <div className="text-m font-semibold text-violet-700">VenueVoice</div>
            <h1 className="mt-1 text-2xl font-semibold tracking-tight text-zinc-950">
              Survey Creator
            </h1>
          </div>

          <div className="flex items-center gap-3">
            <button
              type="button"
              className="rounded-xl border border-zinc-200 bg-white px-4 py-2 text-sm font-semibold text-zinc-900 shadow-sm outline-none hover:bg-zinc-50 focus-visible:ring-2 focus-visible:ring-violet-500 focus-visible:ring-offset-2"
              aria-label="Preview survey"
              onClick={() => setShowPreview(true)}
            >
              Preview
            </button>
            <button
              type="button"
              className="rounded-xl bg-violet-600 px-4 py-2 text-sm font-semibold text-white shadow-sm outline-none hover:bg-violet-700 focus-visible:ring-2 focus-visible:ring-violet-500 focus-visible:ring-offset-2"
              aria-label="Save changes"
              onClick={() => {}}
            >
              Save changes
            </button>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1.2fr)_360px]">
          <main className="min-w-0">
            <SurveyEditor
              survey={survey}
              selection={selection}
              onSelect={setSelection}
              onDeleteQuestion={deleteQuestion}
              onReorderQuestions={reorderQuestions}
            />
          </main>

          <aside className="lg:sticky lg:top-6 lg:self-start">
            <div className="flex flex-col gap-3">
              <Toolbar
                onAddStar={() => addQuestion("star")}
                onAddText={() => addQuestion("text")}
              />
              <SettingsPanel
                survey={survey}
                selection={selection}
                onSurveyChange={setSurvey}
              />
            </div>
          </aside>
        </div>
      </div>

      {showPreview ? (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/40">
          <div className="relative w-[80vw] h-[90vh] rounded-2xl bg-white shadow-xl">
            <button
              type="button"
              className="absolute right-3 top-3 inline-flex h-8 w-8 items-center justify-center rounded-full text-zinc-500 hover:bg-zinc-100 hover:text-zinc-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500 focus-visible:ring-offset-2"
              aria-label="Close preview"
              onClick={() => setShowPreview(false)}
            >
              <span className="sr-only">Close</span>
              <svg
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                aria-hidden="true"
              >
                <path d="M6 6l12 12M6 18L18 6" />
              </svg>
            </button>
            <div className="h-full overflow-y-auto rounded-2xl p-6">
              <SurveyPreview survey={survey} />
            </div>
          </div>
        </div>
      ) : null}
    </div>
  )
}

