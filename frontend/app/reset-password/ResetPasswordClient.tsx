"use client"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import Link from "next/link"
import { Card } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { AuthShell } from "@/components/auth/AuthShell"
import { supabase } from "@/lib/supabase/client"

type PageState = "checking" | "form" | "submitting" | "success" | "error"

export default function ResetPasswordClient() {
  const router = useRouter()
  const [pageState, setPageState] = useState<PageState>("checking")
  const [password, setPassword] = useState("")
  const [confirmPassword, setConfirmPassword] = useState("")
  const [fieldErrors, setFieldErrors] = useState<{ password?: string; confirm?: string }>({})
  const [errorMessage, setErrorMessage] = useState("")

  useEffect(() => {
    async function checkSession() {
      const {
        data: { session },
      } = await supabase.auth.getSession()
      if (!session) {
        router.replace("/login")
        return
      }
      setPageState("form")
    }
    void checkSession()
  }, [router])

  function validate(): boolean {
    const errs: { password?: string; confirm?: string } = {}
    if (!password) {
      errs.password = "Password is required"
    } else if (password.length < 8) {
      errs.password = "Password must be at least 8 characters"
    }
    if (!confirmPassword) {
      errs.confirm = "Please confirm your password"
    } else if (password !== confirmPassword) {
      errs.confirm = "Passwords do not match"
    }
    setFieldErrors(errs)
    return Object.keys(errs).length === 0
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    setErrorMessage("")
    setFieldErrors({})
    if (!validate()) return
    setPageState("submitting")

    const { error } = await supabase.auth.updateUser({ password })
    if (error) {
      setErrorMessage(error.message ?? "Failed to update password. Please try again.")
      setPageState("error")
      return
    }

    // Revoke all sessions globally so existing tokens on other devices are invalidated.
    await supabase.auth.signOut({ scope: "global" })

    setPageState("success")
    setTimeout(() => {
      router.replace("/login")
    }, 2500)
  }

  if (pageState === "checking") {
    return (
      <AuthShell>
        <Card className="w-full max-w-md p-8 text-center">
          <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-violet-100">
            <svg className="h-5 w-5 animate-spin text-violet-700" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
            </svg>
          </div>
          <p className="text-sm text-zinc-500">Verifying your session…</p>
        </Card>
      </AuthShell>
    )
  }

  if (pageState === "success") {
    return (
      <AuthShell>
        <Card className="w-full max-w-md p-8 text-center">
          <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-green-100">
            <svg className="h-6 w-6 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
          </div>
          <h1 className="text-xl font-semibold text-zinc-900">Password updated</h1>
          <p className="mt-2 text-sm text-zinc-600">
            Your password has been updated. Redirecting to login…
          </p>
        </Card>
      </AuthShell>
    )
  }

  if (pageState === "error") {
    return (
      <AuthShell>
        <Card className="w-full max-w-md p-8 text-center">
          <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-red-100">
            <svg className="h-6 w-6 text-red-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </div>
          <h1 className="text-xl font-semibold text-zinc-900">Password reset failed</h1>
          <p className="mt-2 text-sm text-zinc-600">{errorMessage}</p>
          <div className="mt-6 flex flex-col gap-2 text-sm">
            <button
              className="font-medium text-violet-700 hover:underline"
              onClick={() => {
                setPageState("form")
                setErrorMessage("")
              }}
            >
              Try again
            </button>
            <Link className="text-zinc-500 hover:underline" href="/forgot-password">
              Request a new reset link
            </Link>
          </div>
        </Card>
      </AuthShell>
    )
  }

  // pageState === "form" | "submitting"
  return (
    <AuthShell>
      <Card className="w-full max-w-md p-8">
        <h1 className="text-xl font-semibold text-zinc-900">Set new password</h1>
        <p className="mt-1 text-sm text-zinc-600">Choose a strong password for your account.</p>

        <form className="mt-6 space-y-4" onSubmit={onSubmit}>
          <label className="block">
            <span className="text-sm font-medium text-zinc-700">New password <span className="text-red-500">*</span></span>
            <input
              className={`mt-1 w-full rounded-xl border px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-violet-500 ${
                fieldErrors.password ? "border-red-300 bg-red-50" : "border-zinc-200 bg-white"
              }`}
              type="password"
              autoComplete="new-password"
              value={password}
              onChange={(e) => {
                setPassword(e.target.value)
                if (fieldErrors.password) setFieldErrors((p) => ({ ...p, password: undefined }))
              }}
              aria-invalid={!!fieldErrors.password}
              aria-describedby={fieldErrors.password ? "password-error" : undefined}
            />
            {fieldErrors.password && (
              <p id="password-error" className="mt-1 text-xs text-red-600">{fieldErrors.password}</p>
            )}
          </label>

          <label className="block">
            <span className="text-sm font-medium text-zinc-700">Confirm password <span className="text-red-500">*</span></span>
            <input
              className={`mt-1 w-full rounded-xl border px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-violet-500 ${
                fieldErrors.confirm ? "border-red-300 bg-red-50" : "border-zinc-200 bg-white"
              }`}
              type="password"
              autoComplete="new-password"
              value={confirmPassword}
              onChange={(e) => {
                setConfirmPassword(e.target.value)
                if (fieldErrors.confirm) setFieldErrors((p) => ({ ...p, confirm: undefined }))
              }}
              aria-invalid={!!fieldErrors.confirm}
              aria-describedby={fieldErrors.confirm ? "confirm-error" : undefined}
            />
            {fieldErrors.confirm && (
              <p id="confirm-error" className="mt-1 text-xs text-red-600">{fieldErrors.confirm}</p>
            )}
          </label>

          <Button className="w-full" type="submit" disabled={pageState === "submitting"}>
            {pageState === "submitting" ? "Updating…" : "Update password"}
          </Button>
        </form>
        <p className="mt-6 text-center text-xs text-zinc-400">
          <a href="mailto:info@venuevoice.com.au" className="hover:underline">
            Having trouble? Contact support
          </a>
        </p>
      </Card>
    </AuthShell>
  )
}
