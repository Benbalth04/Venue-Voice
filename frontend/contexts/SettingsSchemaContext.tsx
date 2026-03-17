"use client"

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react"
import {
  fetchSettingsSchema,
  fetchThemeSettingsSchema,
  extractErrorMessage,
  type QuestionSettingDefinition,
  type SettingsSchemaResponse,
  type ThemeSettingDefinition,
  type ThemeSettingsSchemaResponse,
} from "@/lib/api/client"

const SettingsSchemaContext = createContext<{
  schema: SettingsSchemaResponse | null
  themeSchema: ThemeSettingsSchemaResponse | null
  loading: boolean
  error: string | null
  getSettingsForType: (questionType: string) => QuestionSettingDefinition[]
  getDefaultsForType: (questionType: string) => Record<string, unknown>
  getThemeSettings: () => ThemeSettingDefinition[]
} | null>(null)

function parseDefaultValue(val: unknown, settingType: string): unknown {
  if (val === null || val === undefined) return undefined
  if (settingType === "boolean") return val === true || val === "true" || val === "1"
  if (settingType === "integer") return typeof val === "number" ? val : parseInt(String(val), 10) || 0
  if (Array.isArray(val)) return val
  return val
}

export function SettingsSchemaProvider({ children }: { children: ReactNode }) {
  const [schema, setSchema] = useState<SettingsSchemaResponse | null>(null)
  const [themeSchema, setThemeSchema] = useState<ThemeSettingsSchemaResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    Promise.all([fetchSettingsSchema(), fetchThemeSettingsSchema()])
      .then(([s, t]) => {
        setSchema(s)
        setThemeSchema(t)
      })
      .catch((err) => setError(extractErrorMessage(err, "Failed to load schema")))
      .finally(() => setLoading(false))
  }, [])

  const getSettingsForType = useCallback(
    (questionType: string): QuestionSettingDefinition[] => {
      if (!schema) return []
      const qt = schema.question_types.find((t) => t.question_type === questionType)
      return qt?.settings ?? []
    },
    [schema],
  )

  const getDefaultsForType = useCallback(
    (questionType: string): Record<string, unknown> => {
      const defs = getSettingsForType(questionType)
      const out: Record<string, unknown> = {}
      for (const d of defs) {
        if (d.key === "options" && d.default_value == null) {
          out[d.key] = ["Option 1", "Option 2"]
        } else if (d.default_value !== null && d.default_value !== undefined) {
          out[d.key] = parseDefaultValue(d.default_value, d.type)
        }
      }
      return out
    },
    [getSettingsForType],
  )

  const getThemeSettings = useCallback(() => themeSchema?.settings ?? [], [themeSchema])

  return (
    <SettingsSchemaContext.Provider
      value={{ schema, themeSchema, loading, error, getSettingsForType, getDefaultsForType, getThemeSettings }}
    >
      {children}
    </SettingsSchemaContext.Provider>
  )
}

export function useSettingsSchema() {
  const ctx = useContext(SettingsSchemaContext)
  if (!ctx) {
    throw new Error("useSettingsSchema must be used within SettingsSchemaProvider")
  }
  return ctx
}
