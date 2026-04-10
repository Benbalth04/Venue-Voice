"use client"

import { useState } from "react"
import Link from "next/link"
import { Card } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { AuthShell } from "@/components/auth/AuthShell"
import { requestPasswordReset } from "@/lib/api/client"

type PageState = "form" | "loading" | "success"

export default function ForgotPasswordClient() {
  const [email, setEmail] = useState("")
  const [fieldError, setFieldError] = useState<string | undefined>()
  const [pageState, setPageState] = useState<PageState>("form")

  function validate(): boolean {
    if (!email.trim()) {
      setFieldError("Email is required")
      return false
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      setFieldError("Please enter a valid email address")
      return false
    }
    return true
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    setFieldError(undefined)
    if (!validate()) return
    setPageState("loading")

    try {
      await requestPasswordReset(email.trim())
    } catch {
      // Intentionally suppress errors — always show success to prevent enumeration
    } finally {
      setPageState("success")
    }
  }

  if (pageState === "success") {
    return (
      <AuthShell>
        <Card className="w-full max-w-md p-8 text-center">
          <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-violet-100">
            <svg className="h-6 w-6 text-violet-700" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
            </svg>
          </div>
          <h1 className="text-xl font-semibold text-zinc-900">Check your email</h1>
          <p className="mt-2 text-sm text-zinc-600">
            If an account exists for <span className="font-medium text-zinc-800">{email}</span>, you will receive a password reset link shortly.
          </p>
          <div className="mt-6">
            <Link className="text-sm font-medium text-violet-700 hover:underline" href="/login">
              Back to login
            </Link>
          </div>
        </Card>
      </AuthShell>
    )
  }

  return (
    <AuthShell>
      <Card className="w-full max-w-md p-8">
        <h1 className="text-xl font-semibold text-zinc-900">Reset your password</h1>
        <p className="mt-1 text-sm text-zinc-600">
          Enter your email address and we will send you a link to reset your password.
        </p>

        <form className="mt-6 space-y-4" onSubmit={onSubmit}>
          <label className="block">
            <span className="text-sm font-medium text-zinc-700">Email <span className="text-red-500">*</span></span>
            <input
              className={`mt-1 w-full rounded-xl border px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-violet-500 ${
                fieldError ? "border-red-300 bg-red-50" : "border-zinc-200 bg-white"
              }`}
              type="email"
              autoComplete="email"
              inputMode="email"
              value={email}
              onChange={(e) => {
                setEmail(e.target.value)
                if (fieldError) setFieldError(undefined)
              }}
              aria-invalid={!!fieldError}
              aria-describedby={fieldError ? "email-error" : undefined}
            />
            {fieldError && (
              <p id="email-error" className="mt-1 text-xs text-red-600">{fieldError}</p>
            )}
          </label>

          <Button className="w-full" type="submit" disabled={pageState === "loading"}>
            {pageState === "loading" ? "Sending…" : "Send reset link"}
          </Button>
        </form>

        <p className="mt-4 text-center text-sm text-zinc-500">
          <Link className="font-medium text-violet-700 hover:underline" href="/login">
            Back to login
          </Link>
        </p>
      </Card>
    </AuthShell>
  )
}
