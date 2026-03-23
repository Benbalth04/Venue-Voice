"use client"

import { useEffect, useState } from "react"
import { useParams } from "next/navigation"
import { LoadingBlock } from "@/components/ui/LoadingSpinner"
import { extractErrorMessage, fetchSurveyRedirect } from "@/lib/api/client"

export default function SurveyRouterPage() {
  const params = useParams()
  const qrCodeId = params.qrCodeId as string
  const [idempotencyKey] = useState<string | null>(() =>
    typeof crypto !== "undefined" && crypto.randomUUID ? crypto.randomUUID() : null,
  )

  const [error, setError] = useState<string | null>(null)
  const invalidQrCode = !qrCodeId

  useEffect(() => {
    if (invalidQrCode) {
      return
    }

    let cancelled = false

    async function redirect() {
      try {
        const result = await fetchSurveyRedirect(qrCodeId, idempotencyKey ?? undefined)
        if (cancelled) return

        if (result.redirect_url) {
          window.location.href = result.redirect_url
          return
        }

        setError(result.error ?? "We couldn't detect which QR code you scanned. Please try again.")
      } catch (err) {
        if (!cancelled) {
          setError(extractErrorMessage(err, "We couldn't detect which QR code you scanned. Please try again."))
        }
      }
    }

    redirect()
    return () => {
      cancelled = true
    }
  }, [idempotencyKey, invalidQrCode, qrCodeId])

  if (invalidQrCode || error) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-zinc-50 px-4">
        <div className="w-full max-w-md rounded-2xl border border-zinc-200 bg-white p-8 text-center shadow-sm">
          <p className="text-lg font-medium text-zinc-900">{error ?? "Invalid QR code"}</p>
          <p className="mt-2 text-sm text-zinc-500">
            Please scan the QR code again or contact the venue for assistance.
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-zinc-50 px-4">
      <LoadingBlock message="Redirecting to survey page…" size="xl" />
    </div>
  )
}
