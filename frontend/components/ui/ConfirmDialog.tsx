"use client"

import { useCallback, useEffect, useRef, useState } from "react"

export interface ConfirmOptions {
  title: string
  message: string
  confirmLabel?: string
  cancelLabel?: string
  variant?: "default" | "danger"
}

export interface ConfirmDialogProps {
  open: boolean
  title: string
  message: string
  confirmLabel?: string
  cancelLabel?: string
  variant?: "default" | "danger"
  onConfirm: () => void
  onCancel: () => void
}

export function ConfirmDialog({
  open,
  title,
  message,
  confirmLabel = "Confirm",
  cancelLabel = "Cancel",
  variant = "default",
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  const cancelRef = useRef<HTMLButtonElement>(null)


  function renderMessage(message: string): React.ReactNode[] {
    const lines = message.split("\n")

    const elements: React.ReactNode[] = []
    let currentList: string[] = []

    const flushList = (key: number) => {
      if (currentList.length === 0) return null
      const list = (
        <ul
          key={`list-${key}`}
          className="ml-5 list-disc space-y-1 text-sm text-zinc-600"
        >
          {currentList.map((item, i) => (
            <li key={i} className="marker:text-zinc-400">
              {item}
            </li>
          ))}
        </ul>
      )
      currentList = []
      return list
    }

    lines.forEach((line, index) => {
      const trimmed = line.trim()

      // Bullet point
      if (trimmed.startsWith("- ")) {
        currentList.push(trimmed.slice(2))
      } else {
        // Flush any existing list before adding normal text
        const list = flushList(index)
        if (list) elements.push(list)

        if (trimmed.length > 0) {
          elements.push(
            <p key={`p-${index}`} className="text-sm text-zinc-600">
              {trimmed}
            </p>
          )
        }
      }
    })

    // Flush remaining list at end
    const finalList = flushList(lines.length)
    if (finalList) elements.push(finalList)

    return elements
  }

  useEffect(() => {
    if (!open) return
    cancelRef.current?.focus()
  }, [open])

  if (!open) return null

  const isDanger = variant === "danger"

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="confirm-dialog-title"
      aria-describedby="confirm-dialog-desc"
    >
      <div
        className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <h2
          id="confirm-dialog-title"
          className="text-lg font-semibold text-zinc-900"
        >
          {title}
        </h2>
        <div id="confirm-dialog-desc" className="mt-2 space-y-2">
          {renderMessage(message)}
        </div>
        <div className="mt-6 flex justify-end gap-2">
          <button
            ref={cancelRef}
            type="button"
            onClick={onCancel}
            className="rounded-xl border border-zinc-200 bg-white px-4 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-50 focus:outline-none focus:ring-2 focus:ring-violet-500 focus:ring-offset-2"
          >
            {cancelLabel}
          </button>
          <button
            type="button"
            onClick={onConfirm}
            className={[
              "rounded-xl px-4 py-2 text-sm font-semibold text-white focus:outline-none focus:ring-2 focus:ring-violet-500 focus:ring-offset-2",
              isDanger
                ? "bg-red-600 hover:bg-red-700"
                : "bg-violet-600 hover:bg-violet-700",
            ].join(" ")}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  )
}

export function useConfirm() {
  const [state, setState] = useState<
    (ConfirmOptions & { resolve: (value: boolean) => void }) | null
  >(null)

  const confirm = useCallback((opts: ConfirmOptions) => {
    return new Promise<boolean>((resolve) => {
      setState({ ...opts, resolve })
    })
  }, [])

  const handleConfirm = useCallback(() => {
    state?.resolve(true)
    setState(null)
  }, [state])

  const handleCancel = useCallback(() => {
    state?.resolve(false)
    setState(null)
  }, [state])

  const ConfirmDialogRender = state ? (
    <ConfirmDialog
      open
      title={state.title}
      message={state.message}
      confirmLabel={state.confirmLabel}
      cancelLabel={state.cancelLabel}
      variant={state.variant}
      onConfirm={handleConfirm}
      onCancel={handleCancel}
    />
  ) : null

  return { confirm, ConfirmDialogRender }
}
