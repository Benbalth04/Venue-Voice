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
import type { Survey } from "@/lib/survey/types"
import { QuestionCard } from "@/components/QuestionCard"

export type EditorSelection =
  | { type: "surveyTitle" }
  | { type: "surveySubtitle" }
  | { type: "question"; questionId: number }
  | null

export function SurveyEditor({
  survey,
  selection,
  onSelect,
  onDeleteQuestion,
  onReorderQuestions,
}: {
  survey: Survey
  selection: EditorSelection
  onSelect: (next: EditorSelection) => void
  onDeleteQuestion: (questionId: number) => void
  onReorderQuestions: (nextQuestionIds: number[]) => void
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
          <div className="mt-2 text-lg font-semibold text-zinc-950">
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
          <div className="mt-2 text-sm text-zinc-700">
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
          const oldIndex = questionIds.indexOf(active.id as number)
          const newIndex = questionIds.indexOf(over.id as number)
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
                  />
                }
              />
            ))}
          </div>
        </SortableContext>
      </DndContext>
    </div>
  )
}

function SortableQuestionRow({
  questionId,
  questionCard,
}: {
  questionId: number
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

