"use client"

import { useEffect, useId, useMemo, useRef, useState } from "react"
import { Check, ChevronDown } from "lucide-react"

export type DropdownOption = {
  value: string
  label: string
  disabled?: boolean
}

function selectionLabel(
  options: DropdownOption[],
  selectedValues: string[],
  placeholder: string,
  multiple: boolean,
) {
  if (selectedValues.length === 0) return placeholder
  const selected = options.filter((option) => selectedValues.includes(option.value))
  if (!multiple) return selected[0]?.label ?? placeholder
  if (selected.length <= 2) return selected.map((option) => option.label).join(", ")
  return `${selected.length} selected`
}

export function DropdownSelect({
  options,
  value,
  onChange,
  placeholder = "Select",
  multiple = false,
  disabled = false,
  className = "",
}: {
  options: DropdownOption[]
  value: string | string[]
  onChange: (next: string | string[]) => void
  placeholder?: string
  multiple?: boolean
  disabled?: boolean
  className?: string
}) {
  const [open, setOpen] = useState(false)
  const rootRef = useRef<HTMLDivElement | null>(null)
  const inputName = useId()
  const selectedValues = useMemo(() => (Array.isArray(value) ? value : value ? [value] : []), [value])

  useEffect(() => {
    function handleOutside(event: MouseEvent) {
      if (!rootRef.current?.contains(event.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener("mousedown", handleOutside)
    return () => document.removeEventListener("mousedown", handleOutside)
  }, [])

  function toggleOption(optionValue: string) {
    if (multiple) {
      const next = selectedValues.includes(optionValue)
        ? selectedValues.filter((item) => item !== optionValue)
        : [...selectedValues, optionValue]
      onChange(next)
      return
    }
    onChange(optionValue)
    setOpen(false)
  }

  return (
    <div ref={rootRef} className={`relative ${className}`}>
      <button
        type="button"
        disabled={disabled}
        onClick={() => setOpen((current) => !current)}
        className="flex w-full items-center justify-between rounded-xl border border-zinc-200 bg-white px-3 py-2 text-left text-sm text-zinc-700 outline-none transition-colors hover:border-zinc-300 focus:ring-2 focus:ring-violet-500 disabled:cursor-not-allowed disabled:bg-zinc-50 disabled:text-zinc-400"
      >
        <span className="truncate">{selectionLabel(options, selectedValues, placeholder, multiple)}</span>
        <ChevronDown className={`h-4 w-4 shrink-0 text-zinc-400 transition-transform ${open ? "rotate-180" : ""}`} />
      </button>

      {open ? (
        <div className="absolute z-20 mt-2 max-h-72 w-full overflow-auto rounded-2xl border border-zinc-200 bg-white p-2 shadow-lg">
          {options.length === 0 ? (
            <div className="px-3 py-2 text-sm text-zinc-500">No options</div>
          ) : (
            options.map((option) => {
              const checked = selectedValues.includes(option.value)
              return (
                <label
                  key={option.value}
                  className={[
                    "flex cursor-pointer items-center gap-3 rounded-xl px-3 py-2 text-sm",
                    option.disabled ? "cursor-not-allowed text-zinc-400" : "text-zinc-700 hover:bg-zinc-50",
                  ].join(" ")}
                >
                  <input
                    type={multiple ? "checkbox" : "radio"}
                    name={multiple ? option.value : inputName}
                    checked={checked}
                    disabled={option.disabled}
                    onChange={() => toggleOption(option.value)}
                    className="h-4 w-4 rounded border-zinc-300 accent-violet-600 text-violet-600 focus:ring-violet-500"
                  />
                  <span className="flex-1 truncate">{option.label}</span>
                  {checked ? <Check className="h-4 w-4 text-violet-600" /> : null}
                </label>
              )
            })
          )}
        </div>
      ) : null}
    </div>
  )
}

export function SingleSelectDropdown({
  value,
  onChange,
  ...props
}: Omit<Parameters<typeof DropdownSelect>[0], "multiple" | "value" | "onChange"> & {
  value: string
  onChange: (next: string) => void
}) {
  return (
    <DropdownSelect
      {...props}
      multiple={false}
      value={value}
      onChange={(next) => onChange(next as string)}
    />
  )
}
