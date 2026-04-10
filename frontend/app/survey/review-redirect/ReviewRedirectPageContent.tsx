"use client"

import { useEffect, useState } from "react"
import { useSearchParams, useRouter } from "next/navigation"
import { Star, Loader2 } from "lucide-react"
import { fetchThankYouData, recordRedirectConfirmation } from "@/lib/api/client"

const DEFAULT_TITLE = "Thank you for your response"
const DEFAULT_SUBTITLE =
  "The survey owner would love for you to provide some feedback on Google Reviews, would you like to?"
const DEFAULT_CONFIRM_LABEL = "Yes, I'd love to!"
const DEFAULT_DECLINE_LABEL = "No thanks"

function isValidHttpUrl(value: string): boolean {
  try {
    const url = new URL(value)
    return url.protocol === "http:" || url.protocol === "https:"
  } catch {
    return false
  }
}

export default function ReviewRedirectPageContent() {
  const searchParams = useSearchParams()
  const router = useRouter()

  const dest = searchParams.get("dest") ?? ""
  const sessionId = searchParams.get("session") ?? ""
  const qrCodeId = searchParams.get("qr") ?? ""
  const title = searchParams.get("title") || DEFAULT_TITLE
  const subtitle = searchParams.get("subtitle") || DEFAULT_SUBTITLE
  const confirmLabel = searchParams.get("confirm") || DEFAULT_CONFIRM_LABEL
  const declineLabel = searchParams.get("decline") || DEFAULT_DECLINE_LABEL

  const [confirming, setConfirming] = useState(false)
  const [primaryColor, setPrimaryColor] = useState("#7C3AED")

  const validDest = isValidHttpUrl(dest)

  useEffect(() => {
    if (!sessionId || !qrCodeId || !validDest) return
    let cancelled = false
    fetchThankYouData(sessionId, qrCodeId)
      .then((data) => {
        if (!cancelled && data.primary_color) setPrimaryColor(data.primary_color)
      })
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [sessionId, qrCodeId, validDest])

  async function handleYes() {
    if (!validDest || confirming) return
    setConfirming(true)
    try {
      await recordRedirectConfirmation(sessionId, qrCodeId)
    } catch {
      // Non-critical — proceed with redirect even if recording fails
    }
    window.location.href = dest
  }

  function handleNoThanks() {
    router.push(
      `/survey/thank-you?session=${encodeURIComponent(sessionId)}&qr=${encodeURIComponent(qrCodeId)}`,
    )
  }

  if (!validDest) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-zinc-50 px-4">
        <p className="text-zinc-600">Invalid redirect destination.</p>
      </div>
    )
  }

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-zinc-50 px-4">
      <div
        className="w-full max-w-md rounded-2xl border border-zinc-200 bg-white p-8 text-center shadow-lg"
        style={{ borderTopWidth: "4px", borderTopColor: primaryColor }}
      >
        <Star className="mx-auto h-16 w-16 text-amber-400" />
        <h1 className="mt-4 text-xl font-semibold text-zinc-900">{title}</h1>
        <p className="mt-2 text-zinc-600">{subtitle}</p>
        <div className="mt-6 flex flex-col gap-3">
          <button
            type="button"
            onClick={handleYes}
            disabled={confirming}
            className="flex w-full items-center justify-center gap-2 rounded-xl px-4 py-3 text-sm font-semibold text-white transition-opacity hover:opacity-95 active:opacity-90 disabled:opacity-70"
            style={{ backgroundColor: primaryColor }}
          >
            {confirming ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            {confirmLabel}
          </button>
          <button
            type="button"
            onClick={handleNoThanks}
            disabled={confirming}
            className="w-full rounded-xl border border-zinc-200 bg-white px-4 py-3 text-sm font-medium text-zinc-600 transition-colors hover:bg-zinc-50 active:bg-zinc-100 disabled:opacity-70"
          >
            {declineLabel}
          </button>
        </div>
      </div>
      <img
        src="/PrimaryLogo_PoweredBy.svg"
        alt="Venue Voice"
        className="h-20 w-auto object-contain"
        aria-hidden
      />
    </div>
  )
}
