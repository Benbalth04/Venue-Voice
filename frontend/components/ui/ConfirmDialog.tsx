"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { AlertTriangle, Info, Loader2, ShieldAlert } from "lucide-react"

export interface ConfirmOptions {
  title: string
  message: string
  confirmLabel?: string
  cancelLabel?: string
  variant?: "default" | "danger" | "warning"
}

export interface ConfirmDialogProps {
  open: boolean
  title: string
  message: string
  confirmLabel?: string
  cancelLabel?: string
  variant?: "default" | "danger" | "warning"
  onConfirm: () => void
  onCancel: () => void
  /** When set, the confirm button stays disabled until the user types this exact string. */
  requiredConfirmText?: string
  /** Optional API or validation message shown above the actions. */
  errorMessage?: string | null
  /** Disables both actions and shows a spinner on the confirm button. */
  pending?: boolean
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
  requiredConfirmText,
  errorMessage,
  pending = false,
}: ConfirmDialogProps) {
  const cancelRef = useRef<HTMLButtonElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const [typedConfirm, setTypedConfirm] = useState("")

  const needsTypedConfirm = Boolean(requiredConfirmText)
  const typedMatches =
    !needsTypedConfirm ||
    (requiredConfirmText !== undefined && typedConfirm === requiredConfirmText)
  const canSubmit = typedMatches && !pending


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
    const t = window.setTimeout(() => {
      if (needsTypedConfirm) inputRef.current?.focus()
      else cancelRef.current?.focus()
    }, 0)
    return () => window.clearTimeout(t)
  }, [open, needsTypedConfirm])

  if (!open) return null

  const isDanger = variant === "danger"
  const isWarning = variant === "warning"

  const inputFocusRing =
    isDanger
      ? "focus:border-red-400 focus:ring-red-400"
      : isWarning
        ? "focus:border-amber-400 focus:ring-amber-400"
        : "focus:border-violet-500 focus:ring-violet-500"

  const confirmButtonClass = isDanger
    ? "bg-red-600 hover:bg-red-700"
    : isWarning
      ? "bg-amber-600 hover:bg-amber-700"
      : "bg-violet-600 hover:bg-violet-700"

  const iconEl = isDanger ? (
    <ShieldAlert className="h-5 w-5 text-red-600" />
  ) : isWarning ? (
    <AlertTriangle className="h-5 w-5 text-amber-600" />
  ) : (
    <Info className="h-5 w-5 text-violet-600" />
  )

  const iconBg = isDanger
    ? "bg-red-100"
    : isWarning
      ? "bg-amber-100"
      : "bg-violet-100"

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="confirm-dialog-title"
      aria-describedby="confirm-dialog-desc"
    >
      <div
        className="w-full max-w-md overflow-hidden rounded-2xl bg-white shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Body */}
        <div className="px-6 pt-6 pb-2 text-center">
          <div className={["mb-4 mx-auto flex h-10 w-10 items-center justify-center rounded-full", iconBg].join(" ")}>
            {iconEl}
          </div>
          <h2
            id="confirm-dialog-title"
            className="text-base font-semibold text-zinc-900"
          >
            {title}
          </h2>
          <div id="confirm-dialog-desc" className="mt-1.5 space-y-2">
            {renderMessage(message)}
          </div>

          {needsTypedConfirm && requiredConfirmText !== undefined && (
            <div className="mt-4">
              <label className="mb-1.5 block text-xs font-medium text-zinc-700">
                Type{" "}
                <span className="font-semibold text-zinc-900">{requiredConfirmText}</span>{" "}
                to continue
              </label>
              <input
                ref={inputRef}
                value={typedConfirm}
                onChange={(e) => setTypedConfirm(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && canSubmit) onConfirm()
                }}
                placeholder={requiredConfirmText}
                disabled={pending}
                autoComplete="off"
                className={[
                  "w-full rounded-xl border border-zinc-200 px-3 py-2 text-sm outline-none focus:ring-1 disabled:opacity-50",
                  inputFocusRing,
                ].join(" ")}
              />
            </div>
          )}

          {errorMessage ? (
            <p className="mt-3 text-sm text-red-600" role="alert">
              {errorMessage}
            </p>
          ) : null}
        </div>

        {/* Footer */}
        <div className="mt-4 flex justify-center gap-2 border-t border-zinc-100 bg-zinc-50/60 px-6 py-4">
          <button
            ref={cancelRef}
            type="button"
            onClick={onCancel}
            disabled={pending}
            className="rounded-xl border border-zinc-200 bg-white px-4 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-50 focus:outline-none focus:ring-2 focus:ring-violet-500 focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {cancelLabel}
          </button>
          <button
            type="button"
            onClick={() => {
              if (!canSubmit) return
              onConfirm()
            }}
            disabled={!canSubmit}
            className={[
              "inline-flex items-center justify-center gap-2 rounded-xl px-4 py-2 text-sm font-semibold text-white focus:outline-none focus:ring-2 focus:ring-violet-500 focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50",
              confirmButtonClass,
            ].join(" ")}
          >
            {pending && <Loader2 className="h-4 w-4 animate-spin" />}
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
