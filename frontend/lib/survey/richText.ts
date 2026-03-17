/**
 * Rich text utilities for survey text fields.
 * Supports <b> and <u> tags - matches backend sanitize_rich_text.
 */
import type { Survey, TextContent, TextStyle } from "./types"

type HtmlValue =
  | string
  | { text?: string; style?: Partial<TextStyle> }
  | null
  | undefined

/** Sanitize HTML to only allow <b> and <u> tags. */
export function sanitizeHtml(html: string): string {
  if (!html || typeof html !== "string") return ""
  return html.replace(/<(?!\/?b\b)(?!\/?u\b)[^>]+>/g, "")
}

/** Convert TextContent (with style) to HTML string for storage/API. */
export function toHtml(content: TextContent): string {
  let text = content.text || ""
  if (!content.style?.bold && !content.style?.underline) return text
  if (content.style.underline) text = `<u>${text}</u>`
  if (content.style.bold) text = `<b>${text}</b>`
  return text
}

/** Parse HTML or plain text to TextContent (extract plain text and style). */
export function fromHtml(
  value: HtmlValue,
  size: TextStyle["size"] = "body",
): TextContent {
  if (value == null) return { text: "", style: { size } }
  let html: string
  let baseSize = size
  if (typeof value === "object") {
    html = value.text ?? ""
    baseSize = (value.style?.size as TextStyle["size"]) ?? size
  } else {
    html = String(value)
  }
  if (!html) return { text: "", style: { size: baseSize } }
  const cleaned = sanitizeHtml(html)
  const bold = /<b\b[^>]*>/.test(cleaned)
  const underline = /<u\b[^>]*>/.test(cleaned)
  const plain = cleaned.replace(/<\/?[bu]\b[^>]*>/gi, "")
  return {
    text: plain,
    style: { bold: bold || undefined, underline: underline || undefined, size: baseSize },
  }
}

/** Convert API schema (may have HTML in text fields) to Survey format. */
export function surveyFromApi(raw: Record<string, unknown>): Survey {
  const title = raw.title as HtmlValue
  const subtitle = raw.subtitle as HtmlValue
  const theme = (raw.theme || {}) as Survey["theme"]
  const settings = (raw.settings || {}) as Survey["settings"]
  const questions = (raw.questions || []) as Array<Record<string, unknown>>

  return {
    version: Number(raw.version) || 1,
    title: fromHtml(title, "h1"),
    subtitle: subtitle ? fromHtml(subtitle, "body") : undefined,
    theme: {
      primaryColor: theme.primaryColor ?? "#7C3AED",
      backgroundColor: theme.backgroundColor ?? "#FFFFFF",
      textColor: theme.textColor ?? "#1E1E1E",
      fontFamily: theme.fontFamily ?? "Inter",
    },
    settings: {
      contentAlign: (settings.contentAlign as Survey["settings"]["contentAlign"]) ?? "left",
      showProgressBar: settings.showProgressBar ?? true,
      progressBarColor: settings.progressBarColor ?? "#7C3AED",
    },
    questions: questions.map((q) => ({
      ...q,
      id: String(q.id ?? ""),
      version: Number(q.version) || 1,
      type: q.type as Survey["questions"][0]["type"],
      title: fromHtml(q.title as HtmlValue, "h2"),
      description: q.description ? fromHtml(q.description as HtmlValue, "body") : undefined,
      optional: q.optional === true,
      contentAlign: q.contentAlign as Survey["questions"][0]["contentAlign"],
      settings: (q.settings || {}) as Survey["questions"][0]["settings"],
    })),
  }
}

/** Convert Survey to API schema (HTML in text fields for storage). */
export function surveyToApi(survey: Survey): Record<string, unknown> {
  return {
    ...survey,
    title: typeof survey.title === "object" ? { ...survey.title, text: toHtml(survey.title) } : survey.title,
    subtitle: survey.subtitle
      ? { ...survey.subtitle, text: toHtml(survey.subtitle) }
      : undefined,
    questions: survey.questions.map((q) => ({
      ...q,
      title: typeof q.title === "object" ? { ...q.title, text: toHtml(q.title) } : q.title,
      description: q.description
        ? { ...q.description, text: toHtml(q.description) }
        : undefined,
    })),
  }
}
