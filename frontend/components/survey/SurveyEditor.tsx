"use client"

import type { ComponentProps, CSSProperties, ReactElement } from "react"
import { cloneElement, useMemo } from "react"
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
import { Mail } from "lucide-react"
import type { Survey } from "@/lib/survey/types"
import { QuestionCard } from "@/components/survey/QuestionCard"

export type EditorSelection =
  | { type: "surveyTitle" }
  | { type: "surveySubtitle" }
  | { type: "question"; questionId: string }
  | { type: "thankYou" }
  | null

export function SurveyEditor({
  survey,
  selection,
  onSelect,
  onDeleteQuestion,
  onDuplicateQuestion,
  onReorderQuestions,
  questionTypeLabels,
}: {
  survey: Survey
  selection: EditorSelection
  onSelect: (next: EditorSelection) => void
  onDeleteQuestion: (questionId: string) => void
  onDuplicateQuestion: (questionId: string) => void
  onReorderQuestions: (nextQuestionIds: string[]) => void
  questionTypeLabels?: Record<string, string>
}) {
  const questionIds = useMemo(() => survey.questions.map((q) => q.id), [survey])

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  )

  return (
    <div className="flex flex-col gap-4">
      <div
        className={[
          "rounded-xl border bg-white p-6 shadow-sm transition-colors",
          selection?.type === "surveyTitle" || selection?.type === "surveySubtitle"
            ? "border-violet-500"
            : "border-zinc-200 hover:border-zinc-300",
        ].join(" ")}
        aria-label="Survey title and subtitle"
      >
        <button
          type="button"
          className="block w-full rounded-lg px-2 py-2 text-left outline-none focus-visible:ring-2 focus-visible:ring-violet-500 focus-visible:ring-offset-2"
          onClick={() => onSelect({ type: "surveyTitle" })}
          aria-label="Select survey title"
        >
          <div className="text-xs font-semibold uppercase tracking-wide text-zinc-500">
            Survey title
          </div>
          <div className="mt-2 text-left text-lg font-semibold text-zinc-950">
            {survey.title.text || "Untitled"}
          </div>
        </button>

        <div className="my-4 h-px w-full bg-zinc-100" />

        <button
          type="button"
          className="block w-full rounded-lg px-2 py-2 text-left outline-none focus-visible:ring-2 focus-visible:ring-violet-500 focus-visible:ring-offset-2"
          onClick={() => onSelect({ type: "surveySubtitle" })}
          aria-label="Select survey subtitle"
        >
          <div className="text-xs font-semibold uppercase tracking-wide text-zinc-500">
            Survey subtitle
          </div>
          <div className="mt-2 text-left text-sm text-zinc-700">
            {survey.subtitle?.text || "—"}
          </div>
        </button>
      </div>

      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragEnd={({ active, over }) => {
          if (!over) return
          if (active.id === over.id) return
          const oldIndex = questionIds.indexOf(active.id as string)
          const newIndex = questionIds.indexOf(over.id as string)
          if (oldIndex === -1 || newIndex === -1) return
          const nextIds = arrayMove(questionIds, oldIndex, newIndex)
          onReorderQuestions(nextIds)
        }}
      >
        <SortableContext items={questionIds} strategy={verticalListSortingStrategy}>
          <div className="flex flex-col gap-4">
            {survey.questions.map((q) => (
              <SortableQuestionRow
                key={q.id}
                questionId={q.id}
                questionCard={
                  <QuestionCard
                    question={q}
                    selected={
                      selection?.type === "question" &&
                      selection.questionId === q.id
                    }
                    dragAttributes={{}}
                    dragListeners={{}}
                    onSelect={() => onSelect({ type: "question", questionId: q.id })}
                    onDelete={() => onDeleteQuestion(q.id)}
                    onDuplicate={() => onDuplicateQuestion(q.id)}
                    questionTypeLabels={questionTypeLabels}
                  />
                }
              />
            ))}
          </div>
        </SortableContext>
      </DndContext>

      <button
        type="button"
        className={[
          "rounded-xl border bg-white p-6 shadow-sm transition-colors text-left w-full outline-none",
          "focus-visible:ring-2 focus-visible:ring-violet-500 focus-visible:ring-offset-2",
          selection?.type === "thankYou"
            ? "border-violet-500"
            : "border-zinc-200 hover:border-zinc-300",
        ].join(" ")}
        onClick={() => onSelect({ type: "thankYou" })}
        aria-label="Select thank you screen settings"
      >
        <div className="flex items-center gap-2">
          <Mail className="h-4 w-4 text-zinc-400 shrink-0" />
          <span className="text-xs font-semibold uppercase tracking-wide text-zinc-500">
            Thank You Screen
          </span>
          <span className="ml-auto rounded-full bg-zinc-100 px-2 py-0.5 text-xs text-zinc-500">
            Shown when no Google review is requested
          </span>
        </div>
        <div className="mt-3 space-y-1">
          <p className="text-sm font-semibold text-zinc-900">
            {survey.thankYou?.title || "Thank you!"}
          </p>
          <p className="text-sm text-zinc-500 line-clamp-2">
            {survey.thankYou?.content || "Your feedback has been received."}
          </p>
        </div>
      </button>
    </div>
  )
}

function SortableQuestionRow({
  questionId,
  questionCard,
}: {
  questionId: string
  questionCard: ReactElement<ComponentProps<typeof QuestionCard>>
}) {
  const { attributes, listeners, setNodeRef, transform, transition } =
    useSortable({ id: questionId })

  const style: CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
  }

  return (
    <div ref={setNodeRef} style={style}>
      {cloneQuestionCardWithDndProps(questionCard, attributes, listeners)}
    </div>
  )
}

function cloneQuestionCardWithDndProps(
  element: ReactElement<ComponentProps<typeof QuestionCard>>,
  attributes: unknown,
  listeners: unknown,
) {
  return cloneElement(element, {
    dragAttributes: attributes,
    dragListeners: listeners,
  })
}

