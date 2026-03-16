"use client"

import { useId, useRef } from "react"
import type {
  Align,
  Question,
  Survey,
  TextContent,
  TextStyle,
} from "@/lib/survey/types"
import { useSettingsSchema } from "@/contexts/SettingsSchemaContext"
import type { QuestionSettingDefinition } from "@/lib/api/client"

export function QuestionSettings({
  survey,
  question,
  onSurveyChange,
}: {
  survey: Survey
  question: Question
  onSurveyChange: (next: Survey) => void
}) {
  const { getSettingsForType, loading } = useSettingsSchema()
  const defs = getSettingsForType(question.type)

  return (
    <div className="flex flex-col gap-6">
      <Section title="Behavior">
        <div className="flex flex-col gap-3">
          <SchemaField
            def={{ key: "optional", label: "Optional question", type: "boolean", required: false, default_value: false, allowed_values: null, validation_rules: null }}
            value={question.optional}
            onChange={(v) =>
              updateQuestion(survey, question.id, onSurveyChange, (q) => ({
                ...q,
                version: q.version + 1,
                optional: Boolean(v),
              }))
            }
          />
          <SchemaField
            def={{ key: "title_alignment", label: "Alignment", type: "select", required: false, default_value: "inherit", allowed_values: ["left", "center", "right", "inherit"], validation_rules: null }}
            value={question.contentAlign ?? "inherit"}
            onChange={(v) =>
              updateQuestion(survey, question.id, onSurveyChange, (q) => ({
                ...q,
                version: q.version + 1,
                contentAlign: (v === "inherit" ? undefined : v) as Align | undefined,
              }))
            }
          />
        </div>
      </Section>

      <Section title="Question title">
        <TextContentEditor
          content={question.title}
          onChange={(next) =>
            updateQuestion(survey, question.id, onSurveyChange, (q) => ({
              ...q,
              version: q.version + 1,
              title: next,
            }))
          }
        />
      </Section>

      <Section title="Description (optional)">
        <TextContentEditor
          content={question.description ?? { text: "", style: { size: "body" } }}
          onChange={(next) =>
            updateQuestion(survey, question.id, onSurveyChange, (q) => ({
              ...q,
              version: q.version + 1,
              description: next.text.trim().length ? next : undefined,
            }))
          }
        />
      </Section>

      {loading ? (
        <div className="text-xs text-zinc-500">Loading settings...</div>
      ) : null}
      {defs
        .filter((d) =>
          !["optional", "title_alignment", "action_alignment", "text_size", "allowOther", "rows", "min_score"].includes(d.key)
        )
        .sort((a, b) => (a.type === "color" ? 1 : 0) - (b.type === "color" ? 1 : 0))
        .map((def) => (
          <SchemaField
            key={def.key}
            def={def}
            value={getSettingValue(question, def, survey)}
            survey={survey}
            questionSettings={question.settings as Record<string, unknown>}
            onChange={(v) =>
              updateQuestion(survey, question.id, onSurveyChange, (q) => ({
                ...q,
                version: q.version + 1,
                settings: { ...(q.settings as Record<string, unknown>), [def.key]: v },
              }))
            }
          />
        ))}
    </div>
  )
}

function getSettingValue(question: Question, def: QuestionSettingDefinition, survey: Survey): unknown {
  if (def.key === "selected_colour") {
    const s = question.settings as Record<string, unknown>
    return s.selected_colour ?? "#7C3AED"
  }
  const s = question.settings as Record<string, unknown>
  const v = s[def.key]
  if (v !== undefined && v !== null) return v
  return def.default_value
}

function updateQuestion(
  survey: Survey,
  questionId: string,
  onSurveyChange: (next: Survey) => void,
  updater: (q: Question) => Question,
) {
  onSurveyChange({
    ...survey,
    version: survey.version + 1,
    questions: survey.questions.map((q) => (q.id === questionId ? updater(q) : q)),
  })
}

function SchemaField({
  def,
  value,
  survey,
  questionSettings,
  onChange,
}: {
  def: QuestionSettingDefinition
  value: unknown
  survey?: Survey
  questionSettings?: Record<string, unknown>
  onChange: (v: unknown) => void
}) {
  const id = useId()
  const inputRef = useRef<HTMLInputElement | null>(null)

  if (def.type === "boolean") {
    return (
      <label className="flex items-center justify-between gap-3">
        <span className="text-sm font-medium text-zinc-800">{def.label}</span>
        <input
          type="checkbox"
          className="h-4 w-4 accent-violet-600"
          checked={Boolean(value)}
          onChange={(e) => onChange(e.target.checked)}
          aria-label={def.label}
        />
      </label>
    )
  }

  if (def.type === "select" && def.allowed_values?.length) {
    const options = def.allowed_values.map((v) => ({ value: v, label: v.charAt(0).toUpperCase() + v.slice(1) }))
    return (
      <div className="flex items-center justify-between gap-3">
        <span className="text-sm font-medium text-zinc-800">{def.label}</span>
        <select
          className="w-40 appearance-none rounded-xl border border-zinc-200 bg-white px-3 py-2 pr-9 text-sm text-zinc-950 shadow-sm outline-none focus-visible:ring-2 focus-visible:ring-violet-500 focus-visible:ring-offset-2"
          value={String(value ?? def.default_value ?? "")}
          onChange={(e) => onChange(e.target.value || undefined)}
          aria-label={def.label}
        >
          {options.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      </div>
    )
  }

  if (def.type === "integer") {
    const rules = def.validation_rules as { min?: number; max?: number } | null
    const min = rules?.min ?? 0
    const max = rules?.max ?? 100
    const num = Number(value ?? def.default_value ?? min)
    const isSliderWithAccent = def.key === "starCount" || def.key === "max_score"
    const accentColor = isSliderWithAccent && survey
      ? (questionSettings?.selected_colour as string) ?? survey.theme.primaryColor
      : undefined
    return (
      <label className="flex flex-col gap-2">
        <span className="text-xs font-medium text-zinc-600">{def.label}</span>
        <input
          type="range"
          min={min}
          max={max}
          value={num}
          style={accentColor ? { accentColor } : undefined}
          onChange={(e) => onChange(Math.max(min, Math.min(max, Number(e.target.value))))}
          aria-label={def.label}
        />
        <div className="text-sm font-medium text-zinc-900">{num}</div>
      </label>
    )
  }

  if (def.type === "color") {
    const hex = String(value ?? def.default_value ?? "#7C3AED")
    return (
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-sm font-medium text-zinc-800 shrink-0">{def.label}</span>
        <div className="flex flex-wrap items-center gap-2">
          <input
            type="color"
            id={id}
            ref={inputRef}
            className="sr-only"
            value={hex}
            onChange={(e) => onChange(e.target.value)}
            aria-label={def.label}
          />
          <button
            type="button"
            className="inline-flex items-center gap-2 rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm font-medium text-zinc-900 shadow-sm outline-none hover:bg-zinc-50 focus-visible:ring-2 focus-visible:ring-violet-500 focus-visible:ring-offset-2"
            onClick={() => inputRef.current?.click()}
          >
            <span
              className="h-4 w-4 rounded-md border border-zinc-200"
              style={{ backgroundColor: hex }}
            />
            Select
          </button>
          <input
            className="w-28 rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-950 shadow-sm outline-none focus-visible:ring-2 focus-visible:ring-violet-500 focus-visible:ring-offset-2"
            value={hex}
            onChange={(e) => onChange(e.target.value)}
          />
        </div>
      </div>
    )
  }

  if (def.type === "options") {
    const opts = Array.isArray(value) ? value as string[] : (def.default_value as string[]) ?? ["Option 1", "Option 2"]
    return (
      <div className="flex flex-col gap-2">
        <span className="text-xs font-medium text-zinc-600">{def.label}</span>
        <OptionsEditor
          options={opts}
          onChange={(opts) => onChange(opts)}
        />
      </div>
    )
  }

  return (
    <label className="flex flex-col gap-2">
      <span className="text-xs font-medium text-zinc-600">{def.label}</span>
      <input
        className="w-full rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-950 shadow-sm outline-none focus-visible:ring-2 focus-visible:ring-violet-500 focus-visible:ring-offset-2"
        value={String(value ?? "")}
        onChange={(e) => onChange(e.target.value || undefined)}
        placeholder={String(def.default_value ?? "")}
        aria-label={def.label}
      />
    </label>
  )
}

function TextContentEditor({
  content,
  onChange,
}: {
  content: TextContent
  onChange: (next: TextContent) => void
}) {
  return (
    <div className="flex flex-col gap-3">
      <label className="flex flex-col gap-2">
        <span className="text-xs font-medium text-zinc-600">Text</span>
        <input
          className="w-full rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-950 shadow-sm outline-none placeholder:text-zinc-400 focus-visible:ring-2 focus-visible:ring-violet-500 focus-visible:ring-offset-2"
          value={content.text}
          onChange={(e) => onChange({ ...content, text: e.target.value })}
          placeholder="Type..."
          aria-label="Text"
        />
      </label>

      <TextStyleControls
        style={content.style}
        onChange={(nextStyle) => onChange({ ...content, style: nextStyle })}
      />
    </div>
  )
}

function TextStyleControls({
  style,
  onChange,
}: {
  style: TextStyle
  onChange: (next: TextStyle) => void
}) {
  return (
    <div className="grid grid-cols-2 gap-2">
      <button
        type="button"
        className={[
          "rounded-xl border px-3 py-2 text-sm font-medium shadow-sm outline-none focus-visible:ring-2 focus-visible:ring-violet-500 focus-visible:ring-offset-2",
          style.bold
            ? "border-violet-300 bg-violet-50 text-violet-900"
            : "border-zinc-200 bg-white text-zinc-900 hover:bg-zinc-50",
        ].join(" ")}
        onClick={() => onChange({ ...style, bold: !style.bold })}
        aria-pressed={!!style.bold}
      >
        Bold
      </button>

      <button
        type="button"
        className={[
          "rounded-xl border px-3 py-2 text-sm font-medium shadow-sm outline-none focus-visible:ring-2 focus-visible:ring-violet-500 focus-visible:ring-offset-2",
          style.underline
            ? "border-violet-300 bg-violet-50 text-violet-900"
            : "border-zinc-200 bg-white text-zinc-900 hover:bg-zinc-50",
        ].join(" ")}
        onClick={() => onChange({ ...style, underline: !style.underline })}
        aria-pressed={!!style.underline}
      >
        Underline
      </button>

      <label className="col-span-2 flex flex-col gap-2">
        <span className="text-xs font-medium text-zinc-600">Text size</span>
        <select
          className="w-full rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-950 shadow-sm outline-none focus-visible:ring-2 focus-visible:ring-violet-500 focus-visible:ring-offset-2"
          value={style.size}
          onChange={(e) =>
            onChange({ ...style, size: e.target.value as TextStyle["size"] })
          }
          aria-label="Text size"
        >
          <option value="h1">H1</option>
          <option value="h2">H2</option>
          <option value="h3">H3</option>
          <option value="body">Body</option>
        </select>
      </label>
    </div>
  )
}

function OptionsEditor({
  options,
  onChange,
}: {
  options: string[]
  onChange: (opts: string[]) => void
}) {
  return (
    <div className="flex flex-col gap-2">
      {options.map((opt, i) => (
        <div key={i} className="flex items-center gap-2">
          <input
            className="flex-1 rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-950 shadow-sm outline-none focus-visible:ring-2 focus-visible:ring-violet-500 focus-visible:ring-offset-2"
            value={opt}
            onChange={(e) => {
              const next = [...options]
              next[i] = e.target.value
              onChange(next)
            }}
            placeholder={`Option ${i + 1}`}
          />
          {options.length > 1 && (
            <button
              type="button"
              onClick={() => onChange(options.filter((_, j) => j !== i))}
              className="text-zinc-400 hover:text-red-500"
              aria-label="Remove option"
            >
              ✕
            </button>
          )}
        </div>
      ))}
      <button
        type="button"
        onClick={() => onChange([...options, `Option ${options.length + 1}`])}
        className="mt-1 rounded-xl border border-dashed border-zinc-300 px-3 py-2 text-xs text-zinc-500 hover:border-violet-400 hover:text-violet-600"
      >
        + Add option
      </button>
    </div>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="text-xs font-semibold uppercase tracking-wide text-zinc-500">
        {title}
      </div>
      <div className="mt-3">{children}</div>
    </div>
  )
}
