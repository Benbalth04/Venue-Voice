"use client"

import { useEffect, useRef, useState } from "react"
import { useParams } from "next/navigation"
import { Loader2 } from "lucide-react"
import { fetchSurveyRedirect } from "@/lib/api/client"

export default function SurveyRouterPage() {
  const params = useParams()
  const qrCodeId = params.qrCodeId as string
  const idempotencyKeyRef = useRef<string | null>(null)
  if (!idempotencyKeyRef.current && typeof crypto !== "undefined" && crypto.randomUUID) {
    idempotencyKeyRef.current = crypto.randomUUID()
  }

  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!qrCodeId) {
      setError("Invalid QR code")
      return
    }

    let cancelled = false

    async function redirect() {
      try {
        const result = await fetchSurveyRedirect(qrCodeId, idempotencyKeyRef.current ?? undefined)
        if (cancelled) return

        if (result.valid && result.redirect_url) {
          window.location.href = result.redirect_url
          return
        }

        setError(result.error ?? "We couldn't detect which QR code you scanned. Please try again.")
      } catch {
        if (!cancelled) {
          setError("We couldn't detect which QR code you scanned. Please try again.")
        }
      }
    }

    redirect()
    return () => {
      cancelled = true
    }
  }, [qrCodeId])

  if (error) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-zinc-50 px-4">
        <div className="w-full max-w-md rounded-2xl border border-zinc-200 bg-white p-8 text-center shadow-sm">
          <p className="text-lg font-medium text-zinc-900">{error}</p>
          <p className="mt-2 text-sm text-zinc-500">
            Please scan the QR code again or contact the venue for assistance.
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-zinc-50 px-4">
      <div className="flex flex-col items-center gap-4">
        <Loader2 className="h-10 w-10 animate-spin text-violet-600" />
        <p className="text-sm font-medium text-zinc-700">Redirecting to survey page...</p>
      </div>
    </div>
  )
}
