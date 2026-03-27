"use client"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import Link from "next/link"
import { supabase } from "@/lib/supabase/client"
import { confirmEmail, fetchUser } from "@/lib/api/client"
import { Card } from "@/components/ui/card"

type CallbackState = "loading" | "error" | "success"

export default function AuthCallbackPage() {
  const router = useRouter()
  const [state, setState] = useState<CallbackState>("loading")
  const [errorMessage, setErrorMessage] = useState<string>("")

  useEffect(() => {
    async function handleCallback() {
      // Parse hash params — Supabase puts tokens/errors in the URL hash
      const hash = window.location.hash.slice(1)
      const params = new URLSearchParams(hash)

      const error = params.get("error")
      const errorDescription = params.get("error_description")

      if (error) {
        const msg =
          error === "access_denied"
            ? errorDescription?.includes("expired") || errorDescription?.includes("invalid")
              ? "This verification link has already been used or has expired. Please request a new one."
              : errorDescription ?? "Verification failed."
            : errorDescription ?? "Verification failed."
        setErrorMessage(msg)
        setState("error")
        return
      }

      // Supabase SDK auto-processes the access_token from the hash via detectSessionInUrl.
      // Wait for the session to be established.
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) {
        // Give the SDK a moment to process the hash tokens
        await new Promise((resolve) => setTimeout(resolve, 500))
        const { data: { session: retried } } = await supabase.auth.getSession()
        if (!retried) {
          setErrorMessage("Could not establish a session. The link may have expired.")
          setState("error")
          return
        }
      }

      const finalSession = (await supabase.auth.getSession()).data.session
      if (!finalSession) {
        setErrorMessage("Could not establish a session. The link may have expired.")
        setState("error")
        return
      }

      try {
        await confirmEmail(finalSession.access_token)
        const me = await fetchUser(finalSession.access_token)
        setState("success")
        router.replace(me.onboarding_complete ? "/dashboard" : "/onboarding")
      } catch {
        setErrorMessage("Account verified, but we could not load your profile. Please log in.")
        setState("error")
      }
    }

    handleCallback()
  }, [router])

  if (state === "loading") {
    return (
      <div className="flex min-h-screen items-center justify-center bg-zinc-50 px-4">
        <Card className="w-full max-w-md p-6 text-center">
          <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-violet-100">
            <svg className="h-5 w-5 animate-spin text-violet-700" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
            </svg>
          </div>
          <h1 className="text-xl font-semibold text-zinc-900">Verifying your email…</h1>
          <p className="mt-2 text-sm text-zinc-500">Just a moment while we confirm your account.</p>
        </Card>
      </div>
    )
  }

  if (state === "error") {
    return (
      <div className="flex min-h-screen items-center justify-center bg-zinc-50 px-4">
        <Card className="w-full max-w-md p-6 text-center">
          <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-red-100">
            <svg className="h-6 w-6 text-red-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </div>
          <h1 className="text-xl font-semibold text-zinc-900">Verification failed</h1>
          <p className="mt-2 text-sm text-zinc-600">{errorMessage}</p>
          <div className="mt-5 flex flex-col gap-2 text-sm">
            <Link className="font-medium text-violet-700 hover:underline" href="/login">
              Go to login
            </Link>
            <Link className="text-zinc-500 hover:underline" href="/signup">
              Create a new account
            </Link>
          </div>
        </Card>
      </div>
    )
  }

  // success — router.replace already called, render nothing while navigating
  return null
}
