"use client"

import { useRouter } from "next/navigation"
import { useState } from "react"
import Link from "next/link"
import { Card } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { supabase } from "@/lib/supabase/client"

export default function SignupPage() {
  const router = useRouter()

  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [firstName, setFirstName] = useState("")
  const [lastName, setLastName] = useState("")

  const [error, setError] = useState<string | null>(null)
  const [fieldErrors, setFieldErrors] = useState<{
    firstName?: string
    lastName?: string
    email?: string
    password?: string
  }>({})
  const [loading, setLoading] = useState(false)

  function validate(): boolean {
    const errs: typeof fieldErrors = {}
    if (!firstName.trim()) errs.firstName = "First name is required"
    if (!lastName.trim()) errs.lastName = "Last name is required"
    if (!email.trim()) errs.email = "Email is required"
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) errs.email = "Please enter a valid email address"
    if (!password) errs.password = "Password is required"
    else if (password.length < 6) errs.password = "Password must be at least 6 characters"
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
      const { error: signUpError } = await supabase.auth.signUp({
        email,
        password,
        options: {
          emailRedirectTo: `${process.env.NEXT_PUBLIC_APP_ORIGIN}/auth/callback`,
          data: {
            first_name: firstName,
            last_name: lastName,
          },
        },
      })

      if (signUpError) {
        setError(signUpError.message ?? "Signup failed")
        return
      }

      // If email confirmations are OFF, we may already have a session.
      // If they are ON, user must confirm email before session exists.
      const {
        data: { session },
      } = await supabase.auth.getSession()

      if (session?.access_token) {
        router.push("/dashboard")
        return
      }

      // No session yet — email confirmation required.
      router.push(`/verify-email?email=${encodeURIComponent(email)}`)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-zinc-50 px-4 py-12">
      <div className="w-full max-w-md">
        {/* Brand header */}
        <div className="mb-8 text-center">
          <h1 className="text-2xl font-bold text-zinc-900">Venue Voice</h1>
          <p className="mt-1 text-sm text-zinc-500">Customer feedback that actually does something</p>
        </div>

      <Card className="p-6">
        <h2 className="text-xl font-semibold text-zinc-900">Create your account</h2>
        <p className="mt-1 text-sm text-zinc-600">
          Already have an account?{" "}
          <Link className="font-medium text-violet-700" href="/login">
            Log in
          </Link>
        </p>

        <form className="mt-6 space-y-4" onSubmit={onSubmit}>
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="block">
              <span className="text-sm font-medium text-zinc-700">First name <span className="text-red-500">*</span></span>
              <input
                className={`mt-1 w-full rounded-xl border px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-violet-500 ${
                  fieldErrors.firstName ? "border-red-300 bg-red-50" : "border-zinc-200 bg-white"
                }`}
                autoComplete="given-name"
                value={firstName}
                onChange={(e) => {
                  setFirstName(e.target.value)
                  if (fieldErrors.firstName) setFieldErrors((p) => ({ ...p, firstName: undefined }))
                }}
              />
              {fieldErrors.firstName && (
                <p className="mt-1 text-xs text-red-600">{fieldErrors.firstName}</p>
              )}
            </label>

            <label className="block">
              <span className="text-sm font-medium text-zinc-700">Last name <span className="text-red-500">*</span></span>
              <input
                className={`mt-1 w-full rounded-xl border px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-violet-500 ${
                  fieldErrors.lastName ? "border-red-300 bg-red-50" : "border-zinc-200 bg-white"
                }`}
                autoComplete="family-name"
                value={lastName}
                onChange={(e) => {
                  setLastName(e.target.value)
                  if (fieldErrors.lastName) setFieldErrors((p) => ({ ...p, lastName: undefined }))
                }}
              />
              {fieldErrors.lastName && (
                <p className="mt-1 text-xs text-red-600">{fieldErrors.lastName}</p>
              )}
            </label>
          </div>

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
            />
            {fieldErrors.email && (
              <p className="mt-1 text-xs text-red-600">{fieldErrors.email}</p>
            )}
          </label>

          <label className="block">
            <span className="text-sm font-medium text-zinc-700">Password <span className="text-red-500">*</span></span>
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
            />
            {fieldErrors.password && (
              <p className="mt-1 text-xs text-red-600">{fieldErrors.password}</p>
            )}
          </label>

          {error ? (
            <div className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
              {error}
            </div>
          ) : null}

          <Button className="w-full" type="submit" disabled={loading}>
            {loading ? "Creating…" : "Create account"}
          </Button>
        </form>
      </Card>
      </div>
    </div>
  )
}
