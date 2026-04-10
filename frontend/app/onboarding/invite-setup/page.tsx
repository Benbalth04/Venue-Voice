"use client"

import { useEffect, useRef, useState } from "react"
import { useRouter } from "next/navigation"
import { supabase } from "@/lib/supabase/client"
import { AuthGuard } from "@/components/auth/AuthGuard"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { completeInviteSetup, extractErrorMessage } from "@/lib/api/client"
import { AuthShell } from "@/components/auth/AuthShell"
import {
  AUSTRALIA_TIMEZONE_OPTIONS,
  guessBrowserAustraliaTimezone,
} from "@/lib/timezone/australia"
import { useAuth } from "@/contexts/AuthContext"
import { SingleSelectDropdown } from "@/components/ui/DropdownSelect"
import type { DropdownOption } from "@/components/ui/DropdownSelect"

const TIMEZONE_OPTIONS: DropdownOption[] = AUSTRALIA_TIMEZONE_OPTIONS.map((o) => ({
  value: o.value,
  label: o.label,
}))

function Field({
  label,
  required,
  error,
  children,
}: {
  label: string
  required?: boolean
  error?: string
  children: React.ReactNode
}) {
  return (
    <label className="block">
      <span className="text-sm font-medium text-zinc-700">
        {label}
        {required && <span className="ml-0.5 text-red-500">*</span>}
      </span>
      {children}
      {error && <p className="mt-1 text-xs text-red-600">{error}</p>}
    </label>
  )
}

const inputClass = (hasError?: boolean) =>
  `mt-1 w-full rounded-xl border px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-violet-500 ${
    hasError ? "border-red-300 bg-red-50" : "border-zinc-200 bg-white"
  }`

function InviteSetupContent() {
  const router = useRouter()
  const { session, user, loading: authLoading, refreshUser } = useAuth()

  // Redirect away if invite is already complete (or user is a regular non-invited account)
  useEffect(() => {
    if (!authLoading && user && !user.invite_pending) {
      router.replace("/dashboard")
    }
  }, [authLoading, user, router])

  const [form, setFormState] = useState({
    firstName: "",
    lastName: "",
    password: "",
    confirmPassword: "",
    timezone: guessBrowserAustraliaTimezone(),
  })

  const userLoaded = useRef(false)
  useEffect(() => {
    if (user && !userLoaded.current) {
      userLoaded.current = true
      setFormState((prev) => ({
        ...prev,
        firstName: user.first_name,
        lastName: user.last_name,
      }))
    }
  }, [user])

  const [fieldErrors, setFieldErrors] = useState<{
    firstName?: string
    lastName?: string
    password?: string
    confirmPassword?: string
  }>({})
  const [submitError, setSubmitError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  // While auth is loading or a redirect is pending, show nothing to avoid flash
  if (authLoading || !user || !user.invite_pending) {
    return null
  }

  function setField(field: keyof typeof form, value: string) {
    setFormState((prev) => ({ ...prev, [field]: value }))
  }

  async function handleSubmit() {
    const errs: typeof fieldErrors = {}
    if (!form.firstName.trim()) errs.firstName = "First name is required"
    if (!form.lastName.trim()) errs.lastName = "Last name is required"
    if (!form.password) errs.password = "Password is required"
    else if (form.password.length < 8) errs.password = "Password must be at least 8 characters"
    if (form.password !== form.confirmPassword) errs.confirmPassword = "Passwords do not match"
    setFieldErrors(errs)
    if (Object.keys(errs).length > 0) return

    if (!session?.access_token) {
      router.replace("/login")
      return
    }

    setSubmitError(null)
    setLoading(true)
    try {
      const { error: pwError } = await supabase.auth.updateUser({ password: form.password })
      if (pwError) throw new Error(pwError.message)

      await completeInviteSetup(session.access_token, {
        first_name: form.firstName.trim(),
        last_name: form.lastName.trim(),
        timezone: form.timezone,
      })

      await refreshUser()
      router.replace("/dashboard")
    } catch (err) {
      setSubmitError(extractErrorMessage(err, "Setup failed. Please try again."))
    } finally {
      setLoading(false)
    }
  }

  return (
    <AuthShell>
      <div className="w-full max-w-md">
        <Card className="p-8">
          <div className="mb-6">
            <h2 className="text-xl font-semibold text-zinc-900">Welcome to the team</h2>
            <p className="mt-1 text-sm text-zinc-500">
              Set a password and confirm your details to get started.
            </p>
          </div>

          <div className="space-y-4">
            <Field label="Email">
              <input
                className={`${inputClass()} cursor-not-allowed opacity-60`}
                value={user?.email ?? ""}
                readOnly
                disabled
              />
            </Field>

            <div className="grid grid-cols-2 gap-3">
              <Field label="First name" required error={fieldErrors.firstName}>
                <input
                  className={inputClass(!!fieldErrors.firstName)}
                  value={form.firstName}
                  onChange={(e) => {
                    setField("firstName", e.target.value)
                    if (fieldErrors.firstName) setFieldErrors((p) => ({ ...p, firstName: undefined }))
                  }}
                />
              </Field>
              <Field label="Last name" required error={fieldErrors.lastName}>
                <input
                  className={inputClass(!!fieldErrors.lastName)}
                  value={form.lastName}
                  onChange={(e) => {
                    setField("lastName", e.target.value)
                    if (fieldErrors.lastName) setFieldErrors((p) => ({ ...p, lastName: undefined }))
                  }}
                />
              </Field>
            </div>

            <Field label="Password" required error={fieldErrors.password}>
              <input
                type="password"
                className={inputClass(!!fieldErrors.password)}
                placeholder="At least 8 characters"
                value={form.password}
                onChange={(e) => {
                  setField("password", e.target.value)
                  if (fieldErrors.password) setFieldErrors((p) => ({ ...p, password: undefined }))
                }}
              />
            </Field>

            <Field label="Confirm password" required error={fieldErrors.confirmPassword}>
              <input
                type="password"
                className={inputClass(!!fieldErrors.confirmPassword)}
                value={form.confirmPassword}
                onChange={(e) => {
                  setField("confirmPassword", e.target.value)
                  if (fieldErrors.confirmPassword)
                    setFieldErrors((p) => ({ ...p, confirmPassword: undefined }))
                }}
              />
            </Field>

            <Field label="Your timezone" required>
              <SingleSelectDropdown
                className="mt-1"
                options={TIMEZONE_OPTIONS}
                value={form.timezone}
                onChange={(v) => setField("timezone", v)}
                placeholder="Select timezone"
              />
            </Field>
          </div>

          {submitError && (
            <p className="mt-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
              {submitError}
            </p>
          )}

          <Button className="mt-6 w-full" onClick={handleSubmit} disabled={loading}>
            {loading ? "Setting up…" : "Get started →"}
          </Button>
        </Card>
      </div>
    </AuthShell>
  )
}

export default function InviteSetupPage() {
  return (
    <AuthGuard>
      <InviteSetupContent />
    </AuthGuard>
  )
}
