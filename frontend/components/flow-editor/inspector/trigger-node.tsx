"use client"

import { X } from "lucide-react"
import { DropdownSelect } from "@/components/ui/DropdownSelect"
import type { LocationSurveyResponse } from "@/lib/api/client"
import type { FlowDraft } from "../types"

type Opt = { value: string; label: string }

export function FlowTriggerInspector(props: {
  draft: FlowDraft
  setDraft: React.Dispatch<React.SetStateAction<FlowDraft | null>>
  locationSurveySelectOptions: Opt[]
  locationSurveys: LocationSurveyResponse[]
}) {
  const { draft, setDraft, locationSurveySelectOptions, locationSurveys } = props
  return (
    <div className="space-y-4">
      <div>
        <span className="text-sm font-medium text-zinc-700">Add trigger locations</span>
        <div className="mt-1">
          <DropdownSelect
            key={`add-loc-${draft.location_survey_ids.slice().sort().join("|")}`}
            options={locationSurveySelectOptions.filter((o) => !draft.location_survey_ids.includes(o.value))}
            value={[]}
            multiple
            placeholder="Add trigger locations"
            onChange={(next) => {
              const raw = Array.isArray(next) ? next : next ? [next] : []
              const add = raw.filter((id) => !draft.location_survey_ids.includes(id))
              if (!add.length) return
              setDraft((current) =>
                current
                  ? {
                      ...current,
                      location_survey_ids: [...new Set([...current.location_survey_ids, ...add])],
                    }
                  : current,
              )
            }}
          />
        </div>
      </div>
      <div className="space-y-2">
        <span className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Trigger locations</span>
        {draft.location_survey_ids.length === 0 ? (
          <p className="text-sm text-zinc-400">No locations yet. Use the dropdown above to add.</p>
        ) : (
          <ul className="space-y-2">
            {draft.location_survey_ids.map((lsId) => {
              const label =
                locationSurveySelectOptions.find((o) => o.value === lsId)?.label ??
                locationSurveys.find((ls) => ls.id === lsId)?.location_name ??
                lsId
              return (
                <li
                  key={lsId}
                  className="flex items-center justify-between gap-2 rounded-xl border border-zinc-200 bg-zinc-50/80 px-3 py-2.5 shadow-sm"
                >
                  <span className="min-w-0 flex-1 truncate text-sm font-medium text-zinc-800">{label}</span>
                  <button
                    type="button"
                    onClick={() =>
                      setDraft((current) =>
                        current
                          ? {
                              ...current,
                              location_survey_ids: current.location_survey_ids.filter((id) => id !== lsId),
                            }
                          : current,
                      )
                    }
                    className="shrink-0 rounded-lg p-1 text-zinc-400 transition hover:bg-zinc-100 hover:text-zinc-700"
                    aria-label="Remove trigger location"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </li>
              )
            })}
          </ul>
        )}
      </div>
    </div>
  )
}
