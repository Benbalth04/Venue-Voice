"use client"

import { Suspense, useEffect, useState } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import Link from "next/link"
import { supabase } from "@/lib/supabase/client"
import { useAuth } from "@/contexts/AuthContext"
import { Card } from "@/components/ui/card"
import { Button } from "@/components/ui/button"

function VerifyEmailContent() {
  const router = useRouter()
  const params = useSearchParams()
  const { loading, user, session } = useAuth()

  const emailParam = params.get("email") ?? ""
  // If the user is logged in we can get their email from the session
  const displayEmail = user?.email ?? emailParam

  const [resendState, setResendState] = useState<"idle" | "sending" | "sent" | "error">("idle")
  const [resendError, setResendError] = useState("")

  // If the user is already verified, send them along
  useEffect(() => {
    if (!loading && user?.email_verified) {
      router.replace(user.onboarding_complete ? "/dashboard" : "/onboarding")
    }
  }, [loading, user, router])

  async function handleResend() {
    const email = displayEmail || session?.user?.email
    if (!email) return

    setResendState("sending")
    setResendError("")

    const { error } = await supabase.auth.resend({
      type: "signup",
      email,
    })

    if (error) {
      setResendError(error.message ?? "Failed to resend. Please try again.")
      setResendState("error")
    } else {
      setResendState("sent")
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-zinc-50 px-4">
      <Card className="w-full max-w-md p-8 text-center">
        <div className="mx-auto mb-5 flex h-14 w-14 items-center justify-center rounded-full bg-violet-100">
          <svg className="h-7 w-7 text-violet-700" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={1.75}
              d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"
            />
          </svg>
        </div>

        <h1 className="text-xl font-semibold text-zinc-900">Verify your email</h1>

        <p className="mt-2 text-sm text-zinc-600">
          We sent a verification link to{" "}
          {displayEmail ? (
            <span className="font-medium text-zinc-900">{displayEmail}</span>
          ) : (
            "your email address"
          )}
          . Click it to activate your account.
        </p>

        <p className="mt-3 text-sm text-zinc-500">
          Can&apos;t find it? Check your spam folder.
        </p>

        <div className="mt-6 space-y-3">
          {resendState === "sent" ? (
            <p className="rounded-xl bg-green-50 px-3 py-2 text-sm text-green-700 border border-green-200">
              Verification email resent — check your inbox.
            </p>
          ) : (
            <Button
              variant="outline"
              className="w-full"
              onClick={handleResend}
              disabled={resendState === "sending"}
            >
              {resendState === "sending" ? "Sending…" : "Resend verification email"}
            </Button>
          )}

          {resendState === "error" && (
            <p className="text-xs text-red-600">{resendError}</p>
          )}
        </div>

        <p className="mt-6 text-xs text-zinc-400">
          Already verified?{" "}
          <Link className="font-medium text-violet-700 hover:underline" href="/login">
            Log in
          </Link>
        </p>
      </Card>
    </div>
  )
}

export default function VerifyEmailPage() {
  return (
    <Suspense>
      <VerifyEmailContent />
    </Suspense>
  )
}
