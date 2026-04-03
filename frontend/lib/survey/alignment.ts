import type { Align, Question } from "@/lib/survey/types"

const ALIGN_SET: ReadonlySet<string> = new Set(["left", "center", "right"])

/** Valid CSS text-align for question copy (excludes "inherit"). */
export function isConcreteAlign(v: unknown): v is Align {
  return typeof v === "string" && ALIGN_SET.has(v)
}

/**
 * Resolve title/description alignment for a question.
 * Stored schema uses `settings.title_alignment` ("inherit" | left | center | right);
 * the editor may also set top-level `contentAlign`. "inherit" or missing → survey default.
 */
export function resolveQuestionTextAlign(question: Question, surveyContentAlign: Align): Align {
  if (isConcreteAlign(question.contentAlign)) {
    return question.contentAlign
  }
  const raw = (question.settings as Record<string, unknown> | undefined)?.title_alignment
  if (isConcreteAlign(raw)) {
    return raw
  }
  return surveyContentAlign
}
