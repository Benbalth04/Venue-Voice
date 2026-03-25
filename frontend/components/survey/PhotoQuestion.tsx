"use client"

import { useEffect, useRef, useState } from "react"
import { Camera, X, ImageIcon } from "lucide-react"

const ALLOWED_MIME_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/heic",
  // HEIC files from iOS may also arrive with this MIME type
  "image/heif",
])
const MAX_FILE_BYTES = 10 * 1024 * 1024 // 10 MB

export function PhotoQuestion({
  value,
  align = "left",
  onChange,
}: {
  value: File | null
  align?: string
  onChange: (file: File | null) => void
}) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)
  const [validationError, setValidationError] = useState<string | null>(null)

  // Sync preview URL whenever the file value changes from outside (e.g. reset)
  useEffect(() => {
    if (!value) {
      setPreviewUrl(null)
      return
    }
    const url = URL.createObjectURL(value)
    setPreviewUrl(url)
    return () => {
      URL.revokeObjectURL(url)
    }
  }, [value])

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0] ?? null

    // Clear input value so re-selecting the same file triggers onChange again
    if (inputRef.current) {
      inputRef.current.value = ""
    }

    if (!file) {
      setValidationError(null)
      onChange(null)
      return
    }

    // Client-side MIME type validation
    if (!ALLOWED_MIME_TYPES.has(file.type)) {
      setValidationError(
        "Unsupported file type. Please upload a JPEG, PNG, WebP, or HEIC image.",
      )
      onChange(null)
      return
    }

    // Client-side size validation
    if (file.size > MAX_FILE_BYTES) {
      setValidationError(
        `Photo is too large (${(file.size / 1024 / 1024).toFixed(1)} MB). Maximum allowed size is 10 MB.`,
      )
      onChange(null)
      return
    }

    setValidationError(null)
    onChange(file)
  }

  function handleRemove() {
    setValidationError(null)
    onChange(null)
    if (inputRef.current) {
      inputRef.current.value = ""
    }
  }

  const alignClass =
    align === "center"
      ? "items-center"
      : align === "right"
        ? "items-end"
        : "items-start"

  return (
    <div className={`flex flex-col gap-3 ${alignClass}`}>
      {/* Hidden file input — accept="image/*" triggers native iOS action sheet
          ("Take Photo", "Photo Library", "Browse"). The capture attribute is
          intentionally omitted so users can choose either option on iOS. */}
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        aria-label="Upload a photo"
        className="sr-only"
        onChange={handleFileChange}
      />

      {value && previewUrl ? (
        /* ── Preview state ─────────────────────────────────────── */
        <div className="relative w-full max-w-sm overflow-hidden rounded-xl border border-zinc-200 shadow-sm">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={previewUrl}
            alt="Selected photo preview"
            className="block h-48 w-full object-cover"
          />
          <div className="flex items-center justify-between gap-2 bg-white px-3 py-2">
            <div className="flex min-w-0 items-center gap-1.5 text-sm text-zinc-600">
              <ImageIcon className="h-4 w-4 shrink-0 text-zinc-400" aria-hidden />
              <span className="truncate">{value.name}</span>
              <span className="shrink-0 text-zinc-400">
                ({(value.size / 1024 / 1024).toFixed(1)} MB)
              </span>
            </div>
            <button
              type="button"
              onClick={handleRemove}
              aria-label="Remove photo"
              className="shrink-0 rounded-lg p-1 text-zinc-500 hover:bg-zinc-100 hover:text-zinc-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500"
            >
              <X className="h-4 w-4" aria-hidden />
            </button>
          </div>
        </div>
      ) : (
        /* ── Upload prompt state ────────────────────────────────── */
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          className="flex w-full max-w-sm flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed border-zinc-300 bg-zinc-50 px-6 py-8 text-zinc-500 transition-colors hover:border-violet-400 hover:bg-violet-50 hover:text-violet-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500 focus-visible:ring-offset-2"
          aria-label="Choose a photo to upload"
        >
          <Camera className="h-8 w-8" aria-hidden />
          <span className="text-sm font-medium">Tap to take or choose a photo</span>
          <span className="text-xs text-zinc-400">JPEG, PNG, WebP or HEIC · max 10 MB</span>
        </button>
      )}

      {/* Change-photo button shown when a photo is selected */}
      {value && (
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          className="text-sm font-medium text-violet-600 underline-offset-2 hover:text-violet-800 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500"
          aria-label="Change photo"
        >
          Change photo
        </button>
      )}

      {validationError && (
        <p role="alert" className="text-sm text-red-600">
          {validationError}
        </p>
      )}
    </div>
  )
}
