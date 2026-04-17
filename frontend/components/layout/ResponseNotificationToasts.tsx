"use client"

import { useEffect } from "react"
import { Layers, X } from "lucide-react"
import type { NewResponseNotification } from "@/lib/api/client"

const AUTO_DISMISS_MS = 6_000

type ResponseNotificationStackProps = {
  items: NewResponseNotification[]
  overflowCount: number
  onDismiss: (responseId: string) => void
  onView: () => void
  onViewOverflow: () => void
}

function NotificationCard({
  notification,
  onDismissById,
  onView,
}: {
  notification: NewResponseNotification
  onDismissById: (responseId: string) => void
  onView: () => void
}) {
  useEffect(() => {
    const id = notification.response_id
    const t = window.setTimeout(() => onDismissById(id), AUTO_DISMISS_MS)
    return () => window.clearTimeout(t)
  }, [notification.response_id, onDismissById])

  return (
    <div
      role="status"
      className="pointer-events-auto w-[min(100vw-2rem,20rem)] overflow-hidden rounded-2xl border border-zinc-200 bg-white shadow-sm"
    >
      <div className="h-1 w-full bg-violet-600" aria-hidden />
      <div className="flex gap-2 p-4">
        <div className="min-w-0 flex-1 space-y-2">
          <p className="text-sm font-semibold text-zinc-900">New response received</p>
          <dl className="space-y-1.5 text-xs text-zinc-600">
            <div className="flex gap-2">
              <dt className="shrink-0 font-semibold text-zinc-500">Location:</dt>
              <dd className="min-w-0 truncate">{notification.location_name}</dd>
            </div>
            <div className="flex gap-2">
              <dt className="shrink-0 font-semibold text-zinc-500">Survey:</dt>
              <dd className="min-w-0 truncate">{notification.survey_name}</dd>
            </div>
            <div className="flex gap-2">
              <dt className="shrink-0 font-semibold text-zinc-500">QR code:</dt>
              <dd className="min-w-0 truncate">{notification.qr_code_title}</dd>
            </div>
          </dl>
          <button
            type="button"
            onClick={onView}
            className="mt-1 rounded-xl bg-violet-600 px-3 py-1.5 text-xs font-semibold text-white shadow-sm hover:bg-violet-700"
          >
            View
          </button>
        </div>
        <button
          type="button"
          onClick={() => onDismissById(notification.response_id)}
          className="h-8 w-8 shrink-0 rounded-xl text-violet-600 hover:bg-violet-50"
          aria-label="Dismiss notification"
        >
          <X className="mx-auto h-4 w-4" strokeWidth={2.25} />
        </button>
      </div>
    </div>
  )
}

export function ResponseNotificationStack({
  items,
  overflowCount,
  onDismiss,
  onView,
  onViewOverflow,
}: ResponseNotificationStackProps) {
  if (items.length === 0 && overflowCount <= 0) return null

  /** Newest-first in `items` → show oldest at top, newest nearest the bottom edge. */
  const stackOrder = [...items].reverse()

  return (
    <div
      className="pointer-events-none fixed bottom-4 right-4 z-[100] flex flex-col items-end gap-2"
      aria-live="polite"
      aria-relevant="additions removals"
    >
      {overflowCount > 0 && (
        <button
          type="button"
          onClick={onViewOverflow}
          title={`${overflowCount} more response${overflowCount === 1 ? "" : "s"}`}
          className="pointer-events-auto flex h-12 w-12 flex-col items-center justify-center gap-0 rounded-2xl border border-zinc-200 bg-white text-violet-600 shadow-sm hover:bg-violet-50"
          aria-label={`${overflowCount} more new responses. Open responses list.`}
        >
          <Layers className="h-5 w-5" strokeWidth={2} />
          <span className="text-[10px] font-bold leading-none">+{overflowCount}</span>
        </button>
      )}
      {stackOrder.map((n) => (
        <NotificationCard
          key={n.response_id}
          notification={n}
          onDismissById={onDismiss}
          onView={onView}
        />
      ))}
    </div>
  )
}
