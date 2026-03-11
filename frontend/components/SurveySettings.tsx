"use client"

import { useId, useRef } from "react"
import type { Survey, TextContent, TextStyle } from "@/lib/survey/types"
import type { EditorSelection } from "@/components/SurveyEditor"

export function SurveySettings({
  survey,
  selection,
  onSurveyChange,
}: {
  survey: Survey
  selection: EditorSelection
  onSurveyChange: (next: Survey) => void
}) {
  const editingTitle = selection?.type === "surveyTitle"
  const editingSubtitle = selection?.type === "surveySubtitle"

  return (
    <div className="flex flex-col gap-6">
      <Section title="Survey title">
        <TextContentEditor
          content={survey.title}
          onChange={(next) => {
            onSurveyChange({
              ...survey,
              version: survey.version + 1,
              title: next,
            })
          }}
          hint={editingTitle ? "Editing selected block" : "Click title in editor to select"}
        />
      </Section>

      <Section title="Survey subtitle">
        <TextContentEditor
          content={survey.subtitle ?? { text: "", style: { size: "body" } }}
          onChange={(next) => {
            onSurveyChange({
              ...survey,
              version: survey.version + 1,
              subtitle: next.text.trim().length ? next : undefined,
            })
          }}
          hint={
            editingSubtitle
              ? "Editing selected block"
              : "Click subtitle in editor to select"
          }
        />
      </Section>

      <Section title="Theme">
        <div className="grid grid-cols-1 gap-3">
          <SelectRow
            label="Content alignment"
            value={survey.settings.contentAlign}
            onChange={(next) =>
              onSurveyChange({
                ...survey,
                version: survey.version + 1,
                settings: { ...survey.settings, contentAlign: next as Survey["settings"]["contentAlign"] },
              })
            }
            options={[
              { value: "left", label: "Left" },
              { value: "center", label: "Center" },
              { value: "right", label: "Right" },
            ]}
          />

          <ColorRow
            label="Primary violet"
            value={survey.theme.primaryColor}
            onChange={(next) =>
              onSurveyChange({
                ...survey,
                version: survey.version + 1,
                theme: { ...survey.theme, primaryColor: next },
              })
            }
          />
          <ColorRow
            label="Star selected color"
            value={survey.theme.starSelectedColor}
            onChange={(next) =>
              onSurveyChange({
                ...survey,
                version: survey.version + 1,
                theme: { ...survey.theme, starSelectedColor: next },
              })
            }
          />

          <ColorRow
            label="Survey background"
            value={survey.theme.backgroundColor}
            onChange={(next) =>
              onSurveyChange({
                ...survey,
                version: survey.version + 1,
                theme: { ...survey.theme, backgroundColor: next },
              })
            }
          />
        </div>
      </Section>

      <Section title="Progress bar">
        <div className="flex flex-col gap-3">
          <label className="flex items-center justify-between gap-3">
            <span className="text-sm font-medium text-zinc-800">Show progress bar</span>
            <input
              type="checkbox"
              className="h-4 w-4 accent-violet-600"
              checked={survey.settings.showProgressBar}
              onChange={(e) =>
                onSurveyChange({
                  ...survey,
                  version: survey.version + 1,
                  settings: { ...survey.settings, showProgressBar: e.target.checked },
                })
              }
              aria-label="Show progress bar"
            />
          </label>

          <ColorRow
            label="Progress bar color"
            value={survey.settings.progressBarColor}
            onChange={(next) =>
              onSurveyChange({
                ...survey,
                version: survey.version + 1,
                settings: { ...survey.settings, progressBarColor: next },
              })
            }
          />
        </div>
      </Section>
    </div>
  )
}

function TextContentEditor({
  content,
  onChange,
  hint,
}: {
  content: TextContent
  onChange: (next: TextContent) => void
  hint?: string
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

      {hint ? <div className="text-xs text-zinc-500">{hint}</div> : null}
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
          style.bold ? "border-violet-300 bg-violet-50 text-violet-900" : "border-zinc-200 bg-white text-zinc-900 hover:bg-zinc-50",
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

function ColorRow({
  label,
  value,
  onChange,
}: {
  label: string
  value: string
  onChange: (next: string) => void
}) {
  const id = useId()
  const inputRef = useRef<HTMLInputElement | null>(null)

  return (
    <div className="flex items-center justify-between gap-3">
      <div className="text-sm font-medium text-zinc-800">{label}</div>
      <div className="flex items-center gap-2">
        <input
          type="color"
          id={id}
          ref={inputRef}
          className="sr-only"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          aria-label={label}
        />
        <button
          type="button"
          className="inline-flex items-center gap-2 rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm font-medium text-zinc-900 shadow-sm outline-none hover:bg-zinc-50 focus-visible:ring-2 focus-visible:ring-violet-500 focus-visible:ring-offset-2"
          onClick={() => inputRef.current?.click()}
          aria-label={`${label} select`}
        >
          <span
            className="h-4 w-4 rounded-md border border-zinc-200"
            style={{ backgroundColor: value }}
            aria-hidden="true"
          />
          Select
        </button>
        <input
          className="w-28 rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-950 shadow-sm outline-none focus-visible:ring-2 focus-visible:ring-violet-500 focus-visible:ring-offset-2"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          aria-label={`${label} hex`}
        />
      </div>
    </div>
  )
}

function SelectRow({
  label,
  value,
  onChange,
  options,
}: {
  label: string
  value: string
  onChange: (next: string) => void
  options: { value: string; label: string }[]
}) {
  return (
    <div className="flex items-center justify-between gap-3">
      <div className="text-sm font-medium text-zinc-800">{label}</div>
      <Select value={value} onChange={onChange} ariaLabel={label} options={options} />
    </div>
  )
}

function Select({
  value,
  onChange,
  ariaLabel,
  options,
}: {
  value: string
  onChange: (next: string) => void
  ariaLabel: string
  options: { value: string; label: string }[]
}) {
  return (
    <div className="relative">
      <select
        className="w-40 appearance-none rounded-xl border border-zinc-200 bg-white px-3 py-2 pr-9 text-sm text-zinc-950 shadow-sm outline-none focus-visible:ring-2 focus-visible:ring-violet-500 focus-visible:ring-offset-2"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        aria-label={ariaLabel}
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
      <svg
        className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-zinc-500"
        width="16"
        height="16"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        aria-hidden="true"
      >
        <path d="M6 9l6 6 6-6" />
      </svg>
    </div>
  )
}

