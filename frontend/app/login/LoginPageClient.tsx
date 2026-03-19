"use client"

import { useSearchParams, useRouter } from "next/navigation"
import { useMemo, useState } from "react"
import Link from "next/link"
import { Card } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { supabase } from "@/lib/supabase/client"

export default function LoginPageClient() {
  const router = useRouter()
  const params = useSearchParams()
  const next = useMemo(() => params.get("next") ?? "/dashboard", [params])

  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [fieldErrors, setFieldErrors] = useState<{ email?: string; password?: string }>({})
  const [loading, setLoading] = useState(false)

  function validate(): boolean {
    const errs: { email?: string; password?: string } = {}
    if (!email.trim()) errs.email = "Email is required"
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) errs.email = "Please enter a valid email address"
    if (!password) errs.password = "Password is required"
    setFieldErrors(errs)
    return Object.keys(errs).length === 0
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setFieldErrors({})
    if (!validate()) return
    setLoading(true)

    try {
      const { error: signInError } = await supabase.auth.signInWithPassword({
        email,
        password,
      })
      if (signInError) {
        setError(signInError.message ?? "Login failed")
        return
      }

      // User record is auto-bootstrapped on first GET /me (dashboard load)
      router.push(next)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-zinc-50 px-4">
      <Card className="w-full max-w-md p-6">
        <h1 className="text-xl font-semibold text-zinc-900">Log in</h1>

        <p className="mt-1 text-sm text-zinc-600">
          New here?{" "}
          <Link className="font-medium text-violet-700" href="/signup">
            Create an account
          </Link>
        </p>

        <form className="mt-6 space-y-4" onSubmit={onSubmit}>
          <label className="block">
            <span className="text-sm font-medium text-zinc-700">Email <span className="text-red-500">*</span></span>
            <input
              className={`mt-1 w-full rounded-xl border px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-violet-500 ${
                fieldErrors.email ? "border-red-300 bg-red-50" : "border-zinc-200 bg-white"
              }`}
              autoComplete="email"
              inputMode="email"
              value={email}
              onChange={(e) => {
                setEmail(e.target.value)
                if (fieldErrors.email) setFieldErrors((p) => ({ ...p, email: undefined }))
              }}
              aria-invalid={!!fieldErrors.email}
              aria-describedby={fieldErrors.email ? "email-error" : undefined}
            />
            {fieldErrors.email && (
              <p id="email-error" className="mt-1 text-xs text-red-600">{fieldErrors.email}</p>
            )}
          </label>

          <label className="block">
            <span className="text-sm font-medium text-zinc-700">Password <span className="text-red-500">*</span></span>
            <input
              className={`mt-1 w-full rounded-xl border px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-violet-500 ${
                fieldErrors.password ? "border-red-300 bg-red-50" : "border-zinc-200 bg-white"
              }`}
              type="password"
              autoComplete="current-password"
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

          {error && (
            <div className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
              {error}
            </div>
          )}

          <Button className="w-full" type="submit" disabled={loading}>
            {loading ? "Signing in…" : "Sign in"}
          </Button>
        </form>
      </Card>
    </div>
  )
}