"use client"

import { useEffect, useState } from "react"
import { useSearchParams } from "next/navigation"
import { CheckCircle2, Loader2 } from "lucide-react"
import { fetchThankYouData } from "@/lib/api/client"

export default function ThankYouPageContent() {
  const searchParams = useSearchParams()
  const sessionId = searchParams.get("session") ?? ""
  const qrCodeId = searchParams.get("qr") ?? ""

  const [message, setMessage] = useState("Thank you for your feedback!")
  const [companyName, setCompanyName] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!sessionId || !qrCodeId) {
      setLoading(false)
      setError("Invalid session")
      return
    }

    let cancelled = false

    async function load() {
      try {
        const data = await fetchThankYouData(sessionId, qrCodeId)
        if (!cancelled) {
          setMessage(data.thank_you_message)
          setCompanyName(data.company_name)
        }
      } catch {
        if (!cancelled) {
          setMessage("Thank you for your feedback!")
        }
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    load()
  }, [sessionId, qrCodeId])

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-zinc-50">
        <Loader2 className="h-8 w-8 animate-spin text-violet-600" />
      </div>
    )
  }

  if (error) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-zinc-50 px-4">
        <p className="text-zinc-600">{error}</p>
      </div>
    )
  }

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-zinc-50 px-4">
      <div
        className="w-full max-w-md rounded-2xl border border-zinc-200 bg-white p-8 text-center shadow-lg"
        style={{ borderTopWidth: "4px", borderTopColor: "#7C3AED" }}
      >
        <CheckCircle2 className="mx-auto h-16 w-16 text-emerald-500" />
        <h1 className="mt-4 text-xl font-semibold text-zinc-900">Thank you</h1>
        <p className="mt-2 text-zinc-600">{message}</p>
      </div>
      <img
        src="/venue_voice_logo_3.png"
        alt="Venue Voice"
        className="mt-8 h-12 w-auto object-contain"
        aria-hidden
      />
    </div>
  )
}
