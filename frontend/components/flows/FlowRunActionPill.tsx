"use client"

import { useLayoutEffect, useRef, useState } from "react"
import { createPortal } from "react-dom"
import { ArrowUpRight, ChevronDown, Mail } from "lucide-react"
import type { FlowRunAction, NotificationGroupResponse } from "@/lib/api/client"

export function distinctEmailCountInGroup(group: NotificationGroupResponse): number {
  const seen = new Set<string>()
  for (const m of group.members) {
    const e = (m.email ?? "").trim().toLowerCase()
    if (e) seen.add(e)
  }
  return seen.size
}

function groupLineWithRecipientCount(group: NotificationGroupResponse): string {
  const n = distinctEmailCountInGroup(group)
  const addrLabel = n === 1 ? "1 address" : `${n} addresses`
  return `${group.name} (${addrLabel})`
}

export function FlowRunActionPill({
  action,
  locationId,
  notificationGroups,
  compact = false,
}: {
  action: FlowRunAction
  locationId: string | null
  notificationGroups: NotificationGroupResponse[]
  compact?: boolean
}) {
  const [open, setOpen] = useState(false)
  const buttonRef = useRef<HTMLButtonElement>(null)
  const [menuPos, setMenuPos] = useState<{
    top: number
    left: number
    minWidth: number
  } | null>(null)
  const isRedirect = action.action_type === "redirect"

  useLayoutEffect(() => {
    if (!open || typeof document === "undefined") return
    const el = buttonRef.current
    if (!el) return
    const update = () => {
      const rect = el.getBoundingClientRect()
      setMenuPos({
        top: rect.bottom + 4,
        left: rect.left,
        minWidth: Math.max(rect.width, 200),
      })
    }
    update()
    window.addEventListener("resize", update)
    window.addEventListener("scroll", update, true)
    return () => {
      window.removeEventListener("resize", update)
      window.removeEventListener("scroll", update, true)
    }
  }, [open])

  const detailLines: string[] = []
  if (isRedirect) {
    const url = action.config.url as string | null | undefined
    detailLines.push(url ? url : "Google Business URL")
  } else {
    const target = action.config.email_target as string | undefined
    const email = action.config.recipient_email as string | null | undefined
    const groupId = action.config.notification_group_id as string | null | undefined

    if (target === "custom_email" && email) {
      detailLines.push(email)
    } else if (target === "notification_group" && groupId) {
      const group = notificationGroups.find((g) => g.id === groupId)
      detailLines.push(group ? groupLineWithRecipientCount(group) : groupId)
    } else {
      const locationGroups = locationId
        ? notificationGroups.filter((g) => g.location_ids.includes(locationId))
        : []
      if (locationGroups.length > 0) {
        for (const g of locationGroups) detailLines.push(groupLineWithRecipientCount(g))
      } else {
        detailLines.push("Location notification groups")
      }
    }
  }

  const btnClass = compact
    ? "relative z-20 inline-flex items-center gap-1 rounded-full border border-zinc-200 bg-zinc-50 px-2 py-0.5 text-[11px] font-medium text-zinc-700 transition hover:border-zinc-300 hover:bg-zinc-100"
    : "relative z-20 inline-flex items-center gap-1.5 rounded-full border border-zinc-200 bg-zinc-50 px-2.5 py-1 text-xs font-medium text-zinc-700 transition hover:border-zinc-300 hover:bg-zinc-100"

  const iconClass = compact ? "h-2.5 w-2.5" : "h-3 w-3"

  const portal =
    open && menuPos && typeof document !== "undefined"
      ? createPortal(
          <>
            <div
              className="fixed inset-0 z-[90]"
              aria-hidden
              onClick={(e) => {
                e.stopPropagation()
                setOpen(false)
              }}
            />
            <div
              className={`fixed z-[100] w-max rounded-xl border border-zinc-200 bg-white p-2.5 shadow-xl ${compact ? "max-w-[min(280px,85vw)]" : ""}`}
              style={{
                top: menuPos.top,
                left: menuPos.left,
                minWidth: menuPos.minWidth,
              }}
              onClick={(e) => e.stopPropagation()}
            >
              <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-wide text-zinc-400">
                {isRedirect ? "Redirect target" : "Email recipients"}
              </p>
              <div className="space-y-1">
                {detailLines.map((line, i) => (
                  <p
                    key={i}
                    className={`whitespace-normal break-words text-zinc-900 ${compact ? "text-xs" : "text-sm"}`}
                  >
                    {line}
                  </p>
                ))}
              </div>
            </div>
          </>,
          document.body,
        )
      : null

  return (
    <div className="relative">
      {portal}
      <button
        ref={buttonRef}
        type="button"
        onClick={(e) => {
          e.stopPropagation()
          setOpen((v) => !v)
        }}
        className={btnClass}
      >
        {isRedirect ? (
          <ArrowUpRight className={`${iconClass} text-violet-500`} />
        ) : (
          <Mail className={`${iconClass} text-emerald-600`} />
        )}
        {isRedirect ? "Redirect" : "Email"}
        <ChevronDown className={`${iconClass} text-zinc-400`} />
      </button>
    </div>
  )
}
