"use client"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import Link from "next/link"
import { supabase } from "@/lib/supabase/client"
import { confirmEmail, fetchUser } from "@/lib/api/client"
import { useAuth } from "@/contexts/AuthContext"
import { Card } from "@/components/ui/card"

type CallbackState = "loading" | "error" | "success"

function decodeJwtSub(accessToken: string): string | null {
  try {
    const parts = accessToken.split(".")
    if (parts.length < 2) return null
    const base64Url = parts[1]
    const base64 = base64Url.replace(/-/g, "+").replace(/_/g, "/")
    const padded = base64.padEnd(base64.length + ((4 - (base64.length % 4)) % 4), "=")
    const json = decodeURIComponent(
      atob(padded)
        .split("")
        .map((c) => "%" + ("00" + c.charCodeAt(0).toString(16)).slice(-2))
        .join("")
    )
    const payload = JSON.parse(json) as { sub?: string }
    return typeof payload.sub === "string" ? payload.sub : null
  } catch {
    return null
  }
}

export default function AuthCallbackPage() {
  const router = useRouter()
  const { refreshUser } = useAuth()
  const [state, setState] = useState<CallbackState>("loading")
  const [errorMessage, setErrorMessage] = useState<string>("")

  useEffect(() => {
    async function handleCallback() {
      const hash = window.location.hash.slice(1)
      const params = new URLSearchParams(hash)

      const error = params.get("error")
      const errorDescription = params.get("error_description")

      if (error) {
        const {
          data: { session },
        } = await supabase.auth.getSession()
        if (session?.user?.email_confirmed_at) {
          router.replace("/dashboard")
          return
        }

        const msg =
          error === "access_denied"
            ? errorDescription?.includes("expired") || errorDescription?.includes("invalid")
              ? "This verification link has already been used or has expired. Please request a new one."
              : (errorDescription ?? "Verification failed.")
            : (errorDescription ?? "Verification failed.")
        setErrorMessage(msg)
        setState("error")
        return
      }

      const access_token = params.get("access_token")
      const refresh_token = params.get("refresh_token")

      const {
        data: { session: existing },
      } = await supabase.auth.getSession()

      if (access_token && refresh_token) {
        const newSub = decodeJwtSub(access_token)
        if (existing?.user?.id && newSub && existing.user.id !== newSub) {
          await supabase.auth.signOut()
        }
        const { error: setErr } = await supabase.auth.setSession({
          access_token,
          refresh_token,
        })
        if (setErr) {
          setErrorMessage(setErr.message ?? "Could not establish a session. The link may have expired.")
          setState("error")
          return
        }
      } else {
        let found = (await supabase.auth.getSession()).data.session
        if (!found) {
          await new Promise((resolve) => setTimeout(resolve, 500))
          found = (await supabase.auth.getSession()).data.session
        }
        if (!found) {
          await new Promise((resolve) => setTimeout(resolve, 500))
          found = (await supabase.auth.getSession()).data.session
        }
        if (!found) {
          setErrorMessage("Could not establish a session. The link may have expired.")
          setState("error")
          return
        }
      }

      const {
        data: { session: finalSession },
      } = await supabase.auth.getSession()
      if (!finalSession?.access_token) {
        setErrorMessage("Could not establish a session. The link may have expired.")
        setState("error")
        return
      }

      const linkType = new URLSearchParams(window.location.search).get("type")

      if (linkType === "recovery") {
        // Password recovery flow — session is established; let the user set a new password.
        setState("success")
        router.replace("/reset-password")
        return
      }

      try {
        await confirmEmail(finalSession.access_token)
        // Refresh AuthContext so EmailVerifiedGuard sees email_verified=true
        // before we navigate away. Without this, the stale context value
        // (fetched before confirmEmail ran) bounces the user back to /verify-email.
        await refreshUser()
        const me = await fetchUser(finalSession.access_token)
        setState("success")
        if (me.invite_pending || linkType === "invite") {
          router.replace("/onboarding/invite-setup")
        } else {
          router.replace(me.onboarding_complete ? "/dashboard" : "/onboarding")
        }
      } catch {
        setErrorMessage("Account verified, but we could not load your profile. Please log in.")
        setState("error")
      }
    }

    void handleCallback()
  }, [router, refreshUser])

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

  return null
}
