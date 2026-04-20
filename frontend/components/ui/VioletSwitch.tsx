"use client"

import { useCallback, type KeyboardEvent } from "react"

export type VioletSwitchProps = {
  checked: boolean
  onCheckedChange: (checked: boolean) => void
  disabled?: boolean
  id?: string
  /** Visually hidden label for screen readers when using ArchivedDataSwitch */
  "aria-label"?: string
}

/**
 * Accessible toggle; violet-600 when on, zinc when off.
 */
export function VioletSwitch({
  checked,
  onCheckedChange,
  disabled = false,
  id,
  "aria-label": ariaLabel,
}: VioletSwitchProps) {
  const toggle = useCallback(() => {
    if (!disabled) onCheckedChange(!checked)
  }, [checked, disabled, onCheckedChange])

  const onKeyDown = useCallback(
    (e: KeyboardEvent<HTMLButtonElement>) => {
      if (e.key === " " || e.key === "Enter") {
        e.preventDefault()
        toggle()
      }
    },
    [toggle],
  )

  return (
    <button
      type="button"
      role="switch"
      id={id}
      aria-checked={checked}
      aria-label={ariaLabel}
      disabled={disabled}
      onClick={toggle}
      onKeyDown={onKeyDown}
      className={[
        "relative inline-flex h-7 w-12 shrink-0 items-center rounded-full border-2 border-transparent transition-colors",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500 focus-visible:ring-offset-2",
        disabled ? "cursor-not-allowed opacity-50" : "cursor-pointer",
        checked ? "bg-violet-600" : "bg-zinc-300",
      ].join(" ")}
    >
      <span
        className={[
          "pointer-events-none inline-block h-6 w-6 transform rounded-full bg-white shadow transition-transform",
          checked ? "translate-x-5" : "translate-x-0.5",
        ].join(" ")}
      />
    </button>
  )
}

export type ArchivedDataSwitchProps = Omit<VioletSwitchProps, "aria-label"> & {
  label?: string
}

export function ArchivedDataSwitch({
  label = "Show archived data",
  checked,
  onCheckedChange,
  disabled,
  id,
}: ArchivedDataSwitchProps) {
  return (
    <label
      id={id}
      className={`inline-flex items-center gap-2 select-none ${disabled ? "cursor-not-allowed opacity-50" : "cursor-pointer"}`}
    >
      <VioletSwitch
        checked={checked}
        onCheckedChange={onCheckedChange}
        disabled={disabled}
        aria-label={label}
      />
      <span className="text-sm text-zinc-700">{label}</span>
    </label>
  )
}
