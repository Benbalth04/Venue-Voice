"use client"

import { useEffect, useRef, useState } from "react"
import { supabase } from "@/lib/supabase/client"
import { deleteAnalyticsResponse, extractErrorMessage } from "@/lib/api/client"
import { LoadingSpinner } from "@/components/ui/LoadingSpinner"

const CONFIRMATION_PHRASE = "delete now"

interface DeleteResponseDialogProps {
  open: boolean
  responseId: string | null
  onClose: () => void
  onDeleted: (responseId: string) => void
}

export function DeleteResponseDialog({
  open,
  responseId,
  onClose,
  onDeleted,
}: DeleteResponseDialogProps) {
  const [inputValue, setInputValue] = useState("")
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  // Reset state whenever dialog opens/closes
  useEffect(() => {
    if (open) {
      setInputValue("")
      setError(null)
      setLoading(false)
      // Small delay so the element is mounted and visible before focusing
      setTimeout(() => inputRef.current?.focus(), 50)
    }
  }, [open])

  if (!open || !responseId) return null

  const confirmed = inputValue === CONFIRMATION_PHRASE

  async function handleDelete() {
    if (!confirmed || !responseId) return

    setLoading(true)
    setError(null)

    try {
      const { data } = await supabase.auth.getSession()
      const token = data.session?.access_token
      if (!token) {
        setError("Session expired. Please refresh and try again.")
        setLoading(false)
        return
      }

      await deleteAnalyticsResponse(token, responseId, inputValue)
      onDeleted(responseId)
    } catch (err) {
      setError(extractErrorMessage(err, "Failed to delete response. Please try again."))
      setLoading(false)
    }
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter" && confirmed && !loading) {
      void handleDelete()
    }
    if (e.key === "Escape") {
      onClose()
    }
  }

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="delete-response-title"
      aria-describedby="delete-response-desc"
    >
      <div
        className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <h2
          id="delete-response-title"
          className="text-lg font-semibold text-zinc-900"
        >
          Delete response
        </h2>

        <div id="delete-response-desc" className="mt-2 space-y-3">
          <p className="text-sm text-zinc-600">
            This will permanently remove the response and all associated data
            (answers, AI analysis, photos). This action cannot be undone.
          </p>

          <div className="space-y-1.5">
            <label
              htmlFor="delete-confirmation-input"
              className="block text-sm font-medium text-zinc-700"
            >
              Type<span className="font-mono font-semibold text-zinc-900"> "{CONFIRMATION_PHRASE}" </span>to confirm
              to confirm
            </label>
            <input
              ref={inputRef}
              id="delete-confirmation-input"
              type="text"
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
              onKeyDown={handleKeyDown}
              disabled={loading}
              placeholder={`type "${CONFIRMATION_PHRASE}" to confirm`}
              autoComplete="off"
              spellCheck={false}
              className="w-full rounded-xl border border-zinc-200 px-3 py-2 text-sm text-zinc-900 placeholder-zinc-400 focus:border-red-400 focus:outline-none focus:ring-2 focus:ring-red-300 disabled:opacity-50"
            />
          </div>

          {error && (
            <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
              {error}
            </p>
          )}
        </div>

        <div className="mt-6 flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            disabled={loading}
            className="rounded-xl border border-zinc-200 bg-white px-4 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-50 focus:outline-none focus:ring-2 focus:ring-violet-500 focus:ring-offset-2 disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={() => void handleDelete()}
            disabled={!confirmed || loading}
            className="flex items-center gap-2 rounded-xl bg-red-600 px-4 py-2 text-sm font-semibold text-white hover:bg-red-700 focus:outline-none focus:ring-2 focus:ring-red-500 focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-40"
          >
            {loading && <LoadingSpinner size="xs" aria-label="Deleting" />}
            Delete response
          </button>
        </div>
      </div>
    </div>
  )
}
