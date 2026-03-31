"use client"

import { useEffect, useId, useMemo, useRef, useState } from "react"
import { Calendar, ChevronLeft, ChevronRight } from "lucide-react"

const WEEKDAYS = ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"] as const

function pad2(n: number) {
  return n < 10 ? `0${n}` : `${n}`
}

/** Calendar date string for API query params (`date_start` / `date_end`). */
export function toDateApiString(y: number, monthIndex: number, day: number) {
  return `${y}-${pad2(monthIndex + 1)}-${pad2(day)}`
}

function parseYmd(s: string): { y: number; m0: number; d: number } | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s.trim())
  if (!m) return null
  const y = Number(m[1])
  const mo = Number(m[2]) - 1
  const d = Number(m[3])
  const dt = new Date(y, mo, d)
  if (dt.getFullYear() !== y || dt.getMonth() !== mo || dt.getDate() !== d) return null
  return { y, m0: mo, d }
}

function daysInMonth(y: number, m0: number) {
  return new Date(y, m0 + 1, 0).getDate()
}

function todayParts() {
  const n = new Date()
  return { y: n.getFullYear(), m0: n.getMonth(), d: n.getDate() }
}

function splitDateTimeLocal(v: string): { date: string; time: string } {
  if (!v.trim()) return { date: "", time: "00:00" }
  const [d, t] = v.split("T")
  const time = (t ?? "00:00").slice(0, 5)
  return { date: d ?? "", time: /^\d{2}:\d{2}$/.test(time) ? time : "00:00" }
}

function joinDateTimeLocal(date: string, time: string) {
  if (!date) return ""
  return `${date}T${time || "00:00"}`
}

const triggerClass =
  "flex w-full items-center justify-between gap-2 rounded-xl border border-zinc-200 bg-white px-3 py-2 text-left text-sm text-zinc-700 outline-none transition-colors hover:border-zinc-300 focus-visible:ring-2 focus-visible:ring-violet-600 disabled:cursor-not-allowed disabled:bg-zinc-50 disabled:text-zinc-400"

const popoverClass =
  "absolute z-30 mt-2 w-[min(100vw-2rem,20rem)] rounded-2xl border border-zinc-200 bg-white p-3 shadow-lg"

type CalendarPanelProps = {
  viewYear: number
  viewMonth0: number
  onViewPrev: () => void
  onViewNext: () => void
  selectedYmd: string | null
  onSelectDay: (ymd: string) => void
}

function CalendarPanel({
  viewYear,
  viewMonth0,
  onViewPrev,
  onViewNext,
  selectedYmd,
  onSelectDay,
}: CalendarPanelProps) {
  const header = useMemo(
    () =>
      new Intl.DateTimeFormat("en", { month: "long", year: "numeric" }).format(
        new Date(viewYear, viewMonth0, 1),
      ),
    [viewYear, viewMonth0],
  )

  const firstDow = new Date(viewYear, viewMonth0, 1).getDay()
  const dim = daysInMonth(viewYear, viewMonth0)
  const { y: ty, m0: tm0, d: td } = todayParts()

  const cells: (number | null)[] = []
  for (let i = 0; i < firstDow; i++) cells.push(null)
  for (let d = 1; d <= dim; d++) cells.push(d)

  return (
    <div>
      <div className="mb-2 flex items-center justify-between gap-2">
        <button
          type="button"
          onClick={onViewPrev}
          className="rounded-lg p-1.5 text-zinc-500 hover:bg-zinc-100 hover:text-zinc-800"
          aria-label="Previous month"
        >
          <ChevronLeft className="h-4 w-4" />
        </button>
        <span className="text-sm font-semibold text-zinc-900">{header}</span>
        <button
          type="button"
          onClick={onViewNext}
          className="rounded-lg p-1.5 text-zinc-500 hover:bg-zinc-100 hover:text-zinc-800"
          aria-label="Next month"
        >
          <ChevronRight className="h-4 w-4" />
        </button>
      </div>
      <div className="grid grid-cols-7 gap-0.5 text-center text-[10px] font-medium uppercase tracking-wide text-zinc-400">
        {WEEKDAYS.map((w) => (
          <div key={w} className="py-1">
            {w}
          </div>
        ))}
      </div>
      <div className="mt-1 grid grid-cols-7 gap-0.5">
        {cells.map((day, i) => {
          if (day === null) {
            return <div key={`e-${i}`} className="aspect-square" />
          }
          const ymd = toDateApiString(viewYear, viewMonth0, day)
          const selected = selectedYmd === ymd
          const isToday = viewYear === ty && viewMonth0 === tm0 && day === td
          return (
            <button
              key={ymd}
              type="button"
              onClick={() => onSelectDay(ymd)}
              className={[
                "aspect-square rounded-lg text-sm font-medium transition-colors",
                selected
                  ? "bg-violet-600 text-white shadow-sm"
                  : isToday
                    ? "bg-violet-50 text-violet-800 ring-1 ring-violet-200"
                    : "text-zinc-700 hover:bg-violet-50 hover:text-violet-900",
              ].join(" ")}
            >
              {day}
            </button>
          )
        })}
      </div>
    </div>
  )
}

export type DatePickerProps = {
  /** `YYYY-MM-DD` or empty string — matches analytics `date_start` / `date_end`. */
  value: string
  onChange: (next: string) => void
  id?: string
  disabled?: boolean
  className?: string
  placeholder?: string
}

/**
 * Date-only picker. `value` / `onChange` use **`YYYY-MM-DD`**, ready for API query params.
 */
export function DatePicker({
  value,
  onChange,
  id,
  disabled = false,
  className = "",
  placeholder = "Select date",
}: DatePickerProps) {
  const autoId = useId()
  const labelId = id ?? autoId
  const rootRef = useRef<HTMLDivElement | null>(null)
  const [open, setOpen] = useState(false)

  const parsed = value ? parseYmd(value) : null
  const initialView = parsed ?? todayParts()
  const [viewYear, setViewYear] = useState(initialView.y)
  const [viewMonth0, setViewMonth0] = useState(initialView.m0)

  function openPopover() {
    const p = value ? parseYmd(value) : null
    if (p) {
      setViewYear(p.y)
      setViewMonth0(p.m0)
    } else {
      const t = todayParts()
      setViewYear(t.y)
      setViewMonth0(t.m0)
    }
    setOpen(true)
  }

  useEffect(() => {
    function handleOutside(event: MouseEvent) {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false)
    }
    function handleKey(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false)
    }
    document.addEventListener("mousedown", handleOutside)
    document.addEventListener("keydown", handleKey)
    return () => {
      document.removeEventListener("mousedown", handleOutside)
      document.removeEventListener("keydown", handleKey)
    }
  }, [])

  const display = useMemo(() => {
    if (!value) return placeholder
    const p = parseYmd(value)
    if (!p) return value
    return new Intl.DateTimeFormat(undefined, {
      dateStyle: "medium",
    }).format(new Date(p.y, p.m0, p.d))
  }, [value, placeholder])

  function shiftMonth(delta: number) {
    const d = new Date(viewYear, viewMonth0 + delta, 1)
    setViewYear(d.getFullYear())
    setViewMonth0(d.getMonth())
  }

  function handleSelectDay(ymd: string) {
    onChange(ymd)
    setOpen(false)
  }

  return (
    <div ref={rootRef} className={`relative ${className}`}>
      <button
        type="button"
        id={labelId}
        disabled={disabled}
        aria-expanded={open}
        aria-haspopup="dialog"
        onClick={() => (open ? setOpen(false) : openPopover())}
        className={triggerClass}
      >
        <span className={value ? "text-zinc-900" : "text-zinc-400"}>{display}</span>
        <Calendar className="h-4 w-4 shrink-0 text-violet-600" aria-hidden />
      </button>
      {open ? (
        <div className={popoverClass} role="dialog" aria-label="Choose date">
          <CalendarPanel
            viewYear={viewYear}
            viewMonth0={viewMonth0}
            onViewPrev={() => shiftMonth(-1)}
            onViewNext={() => shiftMonth(1)}
            selectedYmd={parseYmd(value) ? value : null}
            onSelectDay={handleSelectDay}
          />
          {value ? (
            <button
              type="button"
              onClick={() => {
                onChange("")
                setOpen(false)
              }}
              className="mt-2 w-full rounded-lg py-1.5 text-xs font-medium text-zinc-500 hover:bg-zinc-50 hover:text-violet-700"
            >
              Clear
            </button>
          ) : null}
        </div>
      ) : null}
    </div>
  )
}

export type DateTimePickerProps = {
  /**
   * `YYYY-MM-DDTHH:mm` (same as `datetime-local`) or empty.
   * Parent can convert to ISO for APIs: `new Date(value).toISOString()`.
   */
  value: string
  onChange: (next: string) => void
  id?: string
  disabled?: boolean
  className?: string
  placeholder?: string
}

/**
 * Date + time picker. `value` / `onChange` use **`YYYY-MM-DDTHH:mm`** (datetime-local shape).
 */
export function DateTimePicker({
  value,
  onChange,
  id,
  disabled = false,
  className = "",
  placeholder = "Select date & time",
}: DateTimePickerProps) {
  const autoId = useId()
  const labelId = id ?? autoId
  const rootRef = useRef<HTMLDivElement | null>(null)
  const [open, setOpen] = useState(false)

  const { date: datePart, time: timePart } = splitDateTimeLocal(value)
  const parsed = datePart ? parseYmd(datePart) : null
  const initialView = parsed ?? todayParts()
  const [viewYear, setViewYear] = useState(initialView.y)
  const [viewMonth0, setViewMonth0] = useState(initialView.m0)

  function openPopover() {
    const { date } = splitDateTimeLocal(value)
    const p = date ? parseYmd(date) : null
    if (p) {
      setViewYear(p.y)
      setViewMonth0(p.m0)
    } else {
      const t = todayParts()
      setViewYear(t.y)
      setViewMonth0(t.m0)
    }
    setOpen(true)
  }

  useEffect(() => {
    function handleOutside(event: MouseEvent) {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false)
    }
    function handleKey(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false)
    }
    document.addEventListener("mousedown", handleOutside)
    document.addEventListener("keydown", handleKey)
    return () => {
      document.removeEventListener("mousedown", handleOutside)
      document.removeEventListener("keydown", handleKey)
    }
  }, [])

  const display = useMemo(() => {
    if (!value.trim()) return placeholder
    const { date, time } = splitDateTimeLocal(value)
    const p = date ? parseYmd(date) : null
    if (!p) return value
    const d = new Date(p.y, p.m0, p.d)
    const dateStr = new Intl.DateTimeFormat(undefined, { dateStyle: "medium" }).format(d)
    return `${dateStr}, ${time}`
  }, [value, placeholder])

  function shiftMonth(delta: number) {
    const d = new Date(viewYear, viewMonth0 + delta, 1)
    setViewYear(d.getFullYear())
    setViewMonth0(d.getMonth())
  }

  function handleSelectDay(ymd: string) {
    const { time } = splitDateTimeLocal(value)
    onChange(joinDateTimeLocal(ymd, time))
  }

  function handleTimeChange(nextTime: string) {
    const { date } = splitDateTimeLocal(value)
    if (!date) return
    onChange(joinDateTimeLocal(date, nextTime))
  }

  const selectedYmd = datePart && parseYmd(datePart) ? datePart : null

  return (
    <div ref={rootRef} className={`relative ${className}`}>
      <button
        type="button"
        id={labelId}
        disabled={disabled}
        aria-expanded={open}
        aria-haspopup="dialog"
        onClick={() => (open ? setOpen(false) : openPopover())}
        className={triggerClass}
      >
        <span className={value.trim() ? "text-zinc-900" : "text-zinc-400"}>{display}</span>
        <Calendar className="h-4 w-4 shrink-0 text-violet-600" aria-hidden />
      </button>
      {open ? (
        <div className={popoverClass} role="dialog" aria-label="Choose date and time">
          <CalendarPanel
            viewYear={viewYear}
            viewMonth0={viewMonth0}
            onViewPrev={() => shiftMonth(-1)}
            onViewNext={() => shiftMonth(1)}
            selectedYmd={selectedYmd}
            onSelectDay={handleSelectDay}
          />
          <div className="mt-3 flex items-center justify-between gap-2 border-t border-zinc-100 pt-3">
            <span className="text-xs font-medium text-zinc-500">Time</span>
            <input
              type="time"
              step={60}
              value={datePart ? timePart : "00:00"}
              onChange={(e) => handleTimeChange(e.target.value)}
              disabled={!datePart}
              className="rounded-lg border border-zinc-200 px-2 py-1.5 text-sm text-zinc-800 focus:outline-none focus:ring-2 focus:ring-violet-600 disabled:cursor-not-allowed disabled:bg-zinc-50"
            />
          </div>
          {value.trim() ? (
            <button
              type="button"
              onClick={() => {
                onChange("")
                setOpen(false)
              }}
              className="mt-2 w-full rounded-lg py-1.5 text-xs font-medium text-zinc-500 hover:bg-zinc-50 hover:text-violet-700"
            >
              Clear
            </button>
          ) : null}
        </div>
      ) : null}
    </div>
  )
}
