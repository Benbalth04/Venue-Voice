"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"

const REDIRECT_SECONDS = 5

export type RecoveryScreenProps = {
  title: string
  description: string
  /** Optional second action (e.g. error boundary reset) */
  secondaryAction?: { label: string; onClick: () => void }
}

export function RecoveryScreen({ title, description, secondaryAction }: RecoveryScreenProps) {
  const router = useRouter()
  const [secondsLeft, setSecondsLeft] = useState(REDIRECT_SECONDS)
  const redirectedRef = useRef(false)

  const goDashboard = useCallback(() => {
    if (redirectedRef.current) return
    redirectedRef.current = true
    router.replace("/dashboard")
  }, [router])

  useEffect(() => {
    if (secondsLeft <= 0) {
      goDashboard()
      return
    }
    const t = window.setTimeout(() => setSecondsLeft((s) => s - 1), 1000)
    return () => window.clearTimeout(t)
  }, [secondsLeft, goDashboard])

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-zinc-50 px-4 py-12">
      <div className="w-full max-w-md rounded-2xl border border-zinc-200 bg-white p-8 text-center shadow-sm">
        <h1 className="text-xl font-semibold tracking-tight text-zinc-900">{title}</h1>
        <p className="mt-3 text-sm leading-relaxed text-zinc-600">{description}</p>
        <p className="mt-6 text-sm font-medium text-zinc-700">
          Returning to your dashboard in{" "}
          <span className="tabular-nums text-violet-600">{Math.max(0, secondsLeft)}</span>
          {secondsLeft === 1 ? " second" : " seconds"}
          …
        </p>
        <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:justify-center">
          <Button type="button" onClick={goDashboard}>
            Return home
          </Button>
          {secondaryAction ? (
            <Button type="button" variant="outline" onClick={secondaryAction.onClick}>
              {secondaryAction.label}
            </Button>
          ) : null}
        </div>
      </div>
    </div>
  )
}
