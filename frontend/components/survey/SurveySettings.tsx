"use client"

import { useId, useRef } from "react"
import type { Survey, TextContent, TextStyle } from "@/lib/survey/types"
import type { EditorSelection } from "@/components/survey/SurveyEditor"
import { useSettingsSchema } from "@/contexts/SettingsSchemaContext"
import { SingleSelectDropdown } from "@/components/ui/DropdownSelect"

const THEME_KEY_MAP: Record<string, { source: "theme" | "settings"; key: string }> = {
  font: { source: "theme", key: "fontFamily" },
  text_color: { source: "theme", key: "textColor" },
  content_alignment: { source: "settings", key: "contentAlign" },
  primary_color: { source: "theme", key: "primaryColor" },
  background_color: { source: "theme", key: "backgroundColor" },
  show_progress_bar: { source: "settings", key: "showProgressBar" },
  progress_bar_color: { source: "settings", key: "progressBarColor" },
}

export function SurveySettings({
  survey,
  selection,
  onSurveyChange,
}: {
  survey: Survey
  selection: EditorSelection
  onSurveyChange: (next: Survey) => void
}) {
  const { getThemeSettings, loading } = useSettingsSchema()
  const themeDefs = getThemeSettings()

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
        />
      </Section>

      {loading ? (
        <div className="text-xs text-zinc-500">Loading settings...</div>
      ) : (
        <Section title="Theme">
          <div className="grid grid-cols-1 gap-3">
            {themeDefs.map((def) => {
              const map = THEME_KEY_MAP[def.key]
              if (!map) return null
              const value =
                map.source === "theme"
                  ? (survey.theme as Record<string, unknown>)[map.key]
                  : (survey.settings as Record<string, unknown>)[map.key]
              const current = value ?? def.default_value

              if (def.type === "select" && def.allowed_values?.length) {
                return (
                  <SelectRow
                    key={def.key}
                    label={def.label}
                    value={String(current)}
                    onChange={(next) => {
                      if (map.source === "theme") {
                        onSurveyChange({
                          ...survey,
                          version: survey.version + 1,
                          theme: { ...survey.theme, [map.key]: next },
                        })
                      } else {
                        onSurveyChange({
                          ...survey,
                          version: survey.version + 1,
                          settings: { ...survey.settings, [map.key]: next },
                        })
                      }
                    }}
                    options={def.allowed_values.map((v) => ({ value: v, label: v.charAt(0).toUpperCase() + v.slice(1) }))}
                  />
                )
              }
              if (def.type === "boolean") {
                return (
                  <label key={def.key} className="flex items-center justify-between gap-3">
                    <span className="text-sm font-medium text-zinc-800">{def.label}</span>
                    <input
                      type="checkbox"
                      className="h-4 w-4 accent-violet-600"
                      checked={Boolean(current)}
                      onChange={(e) => {
                        if (map.source === "settings") {
                          onSurveyChange({
                            ...survey,
                            version: survey.version + 1,
                            settings: { ...survey.settings, [map.key]: e.target.checked },
                          })
                        }
                      }}
                      aria-label={def.label}
                    />
                  </label>
                )
              }
              if (def.type === "color") {
                return (
                  <ColorRow
                    key={def.key}
                    label={def.label}
                    value={String(current ?? "#7C3AED")}
                    onChange={(next) => {
                      if (map.source === "theme") {
                        onSurveyChange({
                          ...survey,
                          version: survey.version + 1,
                          theme: { ...survey.theme, [map.key]: next },
                        })
                      } else {
                        onSurveyChange({
                          ...survey,
                          version: survey.version + 1,
                          settings: { ...survey.settings, [map.key]: next },
                        })
                      }
                    }}
                  />
                )
              }
              return null
            })}
          </div>
        </Section>
      )}
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

      <div className="col-span-2 flex flex-col gap-2">
        <span className="text-xs font-medium text-zinc-600">Text size</span>
        <SingleSelectDropdown
          value={style.size}
          onChange={(next) => onChange({ ...style, size: next as TextStyle["size"] })}
          options={[
            { value: "h1", label: "H1" },
            { value: "h2", label: "H2" },
            { value: "h3", label: "H3" },
            { value: "body", label: "Body" },
          ]}
        />
      </div>
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
    <div className="flex flex-wrap items-center gap-2">
      <div className="text-sm font-medium text-zinc-800 shrink-0">{label}</div>
      <div className="flex flex-wrap items-center gap-2">
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
      <SingleSelectDropdown
        className="w-40"
        value={value}
        onChange={onChange}
        options={options}
      />
    </div>
  )
}

