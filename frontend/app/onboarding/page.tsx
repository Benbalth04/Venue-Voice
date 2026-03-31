"use client"

import { Fragment, useState } from "react"
import { useRouter } from "next/navigation"
import { AuthGuard } from "@/components/auth/AuthGuard"
import { EmailVerifiedGuard } from "@/components/auth/EmailVerifiedGuard"
import { OnboardingIncompleteGuard } from "@/components/auth/OnboardingIncompleteGuard"
import { PlanCard } from "@/components/onboarding/PlanCard"
import { BillingToggle } from "@/components/subscription/BillingToggle"
import { Button } from "@/components/ui/button"
import { setupAccount, createCheckoutSession, extractErrorMessage } from "@/lib/api/client"
import { SUBSCRIBE_PLANS, type BillingInterval, type SubscribePlanId } from "@/lib/subscription/plans"
import { useAuth } from "@/contexts/AuthContext"
import { SingleSelectDropdown } from "@/components/ui/DropdownSelect"
import type { DropdownOption } from "@/components/ui/DropdownSelect"

// ─── Constants ──────────────────────────────────────────────────────────────────

const INDUSTRY_OPTIONS: DropdownOption[] = [
  "Retail",
  "Hospitality",
  "Healthcare",
  "Fitness",
  "Entertainment",
  "Food & Beverage",
  "Real Estate",
  "Education",
  "Other",
].map((o) => ({ value: o, label: o }))

const COMPANY_SIZE_OPTIONS: DropdownOption[] = [
  "0-10",
  "10-30",
  "30-50",
  "50-100",
  "100-250",
  "250-500",
  "500-1000",
  "1000+",
].map((o) => ({ value: o, label: `${o} employees` }))

const HOW_HEARD_OPTIONS: DropdownOption[] = [
  "Internet Search",
  "Social media",
  "Referral",
  "Advertisement",
  "Event",
  "Other",
].map((o) => ({ value: o, label: o }))

const STEP_LABELS = ["Your Business", "About You", "Choose Plan"]

// ─── Step Indicator ─────────────────────────────────────────────────────────────

function StepIndicator({ current, labels }: { current: number; labels: string[] }) {
  return (
    <div className="mb-8 flex items-center justify-center">
      {labels.map((label, i) => (
        <Fragment key={i}>
          <div className="flex flex-col items-center gap-1.5">
            <div
              className={`flex h-8 w-8 items-center justify-center rounded-full text-sm font-semibold transition-all duration-200 ${
                i < current
                  ? "bg-violet-600 text-white"
                  : i === current
                  ? "bg-violet-600 text-white ring-4 ring-violet-100"
                  : "bg-zinc-100 text-zinc-400"
              }`}
            >
              {i < current ? (
                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                </svg>
              ) : (
                i + 1
              )}
            </div>
            <span className={`text-xs font-medium ${i <= current ? "text-violet-700" : "text-zinc-400"}`}>
              {label}
            </span>
          </div>
          {i < labels.length - 1 && (
            <div
              className={`mb-5 h-px w-10 flex-shrink-0 transition-colors duration-200 ${
                i < current ? "bg-violet-600" : "bg-zinc-200"
              }`}
            />
          )}
        </Fragment>
      ))}
    </div>
  )
}

// ─── Field wrapper ───────────────────────────────────────────────────────────────

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

// ─── Page content ────────────────────────────────────────────────────────────────

function OnboardingPageContent() {
  const router = useRouter()
  const { session } = useAuth()
  const [step, setStep] = useState(0)

  const [form, setFormState] = useState({
    companyName: "",
    locationName: "",
    locationState: "",
    locationCountry: "",
    locationGoogleUrl: "",
    primaryIndustry: "",
    companySize: "",
    locationCount: "",
    howHeard: "",
  })

  const [fieldErrors, setFieldErrors] = useState<{ companyName?: string; locationName?: string }>({})
  const [submitError, setSubmitError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [billing, setBilling] = useState<BillingInterval>("monthly")
  const [loadingPlanId, setLoadingPlanId] = useState<SubscribePlanId | null>(null)

  function setField(field: keyof typeof form, value: string) {
    setFormState((prev) => ({ ...prev, [field]: value }))
  }

  // ── Slide 1 ──────────────────────────────────────────────────────────────────

  function handleSlide1Continue() {
    const errs: typeof fieldErrors = {}
    if (!form.companyName.trim()) errs.companyName = "Company name is required"
    if (!form.locationName.trim()) errs.locationName = "Location name is required"
    setFieldErrors(errs)
    if (Object.keys(errs).length === 0) setStep(1)
  }

  // ── Slide 2 ──────────────────────────────────────────────────────────────────

  async function handleSlide2Continue() {
    if (!session?.access_token) { router.replace("/login"); return }
    setSubmitError(null)
    setLoading(true)
    try {
      await setupAccount(session.access_token, {
        company_name: form.companyName,
        location_name: form.locationName,
        location_state: form.locationState || null,
        location_country: form.locationCountry || null,
        location_google_business_url: form.locationGoogleUrl || null,
        primary_industry: form.primaryIndustry || null,
        company_size: form.companySize || null,
        location_count: form.locationCount ? parseInt(form.locationCount, 10) || null : null,
        how_heard: form.howHeard || null,
      })
      setStep(2)
    } catch (err) {
      setSubmitError(extractErrorMessage(err, "Setup failed. Please try again."))
    } finally {
      setLoading(false)
    }
  }

  // ── Slide 3 ──────────────────────────────────────────────────────────────────

  async function handleSubscribe(planId: SubscribePlanId) {
    if (!session?.access_token) {
      router.replace("/login")
      return
    }
    setLoading(true)
    setLoadingPlanId(planId)
    setSubmitError(null)
    try {
      const { checkout_url } = await createCheckoutSession(session.access_token, {
        plan: planId,
        billingInterval: billing,
      })
      window.location.href = checkout_url
    } catch (err) {
      setSubmitError(extractErrorMessage(err, "Failed to start checkout. Please try again."))
      setLoading(false)
      setLoadingPlanId(null)
    }
  }

  // ── Render ────────────────────────────────────────────────────────────────────

  return (
    <div className="flex min-h-screen items-center justify-center bg-zinc-50 px-4 py-12">
      <div className={`w-full ${step === 2 ? "max-w-6xl" : "max-w-lg"}`}>

        {/* Brand header */}
        <div className="mb-8 text-center">
          <h1 className="text-2xl font-bold text-zinc-900">Venue Voice</h1>
          <p className="mt-1 text-sm text-zinc-500">Let&apos;s get your account set up</p>
        </div>

        <div className="rounded-2xl border border-zinc-200 bg-white p-8 shadow-sm">
          <StepIndicator current={step} labels={STEP_LABELS} />

          {/* ── Slide 1: Your Business ── */}
          {step === 0 && (
            <div>
              <div className="mb-6">
                <h2 className="text-xl font-semibold text-zinc-900">Set up your business</h2>
                <p className="mt-1 text-sm text-zinc-500">
                  Tell us about your company and first location.
                </p>
              </div>

              <div className="space-y-4">
                <Field label="Company name" required error={fieldErrors.companyName}>
                  <input
                    className={inputClass(!!fieldErrors.companyName)}
                    placeholder="e.g. Brisbane Hospitality Group"
                    value={form.companyName}
                    onChange={(e) => {
                      setField("companyName", e.target.value)
                      if (fieldErrors.companyName) setFieldErrors((p) => ({ ...p, companyName: undefined }))
                    }}
                  />
                </Field>

                <Field label="First location name" required error={fieldErrors.locationName}>
                  <input
                    className={inputClass(!!fieldErrors.locationName)}
                    placeholder="e.g. Brisbane CBD Branch"
                    value={form.locationName}
                    onChange={(e) => {
                      setField("locationName", e.target.value)
                      if (fieldErrors.locationName) setFieldErrors((p) => ({ ...p, locationName: undefined }))
                    }}
                  />
                </Field>

                <div className="grid grid-cols-2 gap-3">
                  <Field label="State">
                    <input
                      className={inputClass()}
                      placeholder="e.g. QLD"
                      value={form.locationState}
                      onChange={(e) => setField("locationState", e.target.value)}
                    />
                  </Field>
                  <Field label="Country">
                    <input
                      className={inputClass()}
                      placeholder="e.g. Australia"
                      value={form.locationCountry}
                      onChange={(e) => setField("locationCountry", e.target.value)}
                    />
                  </Field>
                </div>

                <Field label="Google Business URL">
                  <input
                    className={inputClass()}
                    placeholder="https://maps.google.com/… (optional)"
                    value={form.locationGoogleUrl}
                    onChange={(e) => setField("locationGoogleUrl", e.target.value)}
                  />
                </Field>
              </div>

              <Button className="mt-6 w-full" onClick={handleSlide1Continue}>
                Continue →
              </Button>
            </div>
          )}

          {/* ── Slide 2: About You ── */}
          {step === 1 && (
            <div>
              <div className="mb-6">
                <h2 className="text-xl font-semibold text-zinc-900">Tell us about yourself</h2>
                <p className="mt-1 text-sm text-zinc-500">
                  All these questions are optional, but will help us improve your experience on Venue Voice.
                </p>
              </div>

              <div className="space-y-4">
                <Field label="Industry">
                  <SingleSelectDropdown
                    className="mt-1"
                    options={INDUSTRY_OPTIONS}
                    value={form.primaryIndustry}
                    onChange={(v) => setField("primaryIndustry", v)}
                    placeholder="Select (optional)"
                  />
                </Field>

                <Field label="Company size">
                  <SingleSelectDropdown
                    className="mt-1"
                    options={COMPANY_SIZE_OPTIONS}
                    value={form.companySize}
                    onChange={(v) => setField("companySize", v)}
                    placeholder="Select (optional)"
                  />
                </Field>

                <Field label="How many locations do you have?">
                  <input
                    type="number"
                    min={0}
                    className={inputClass()}
                    placeholder="e.g. 5 (optional)"
                    value={form.locationCount}
                    onChange={(e) => setField("locationCount", e.target.value)}
                  />
                </Field>

                <Field label="How did you hear about us?">
                  <SingleSelectDropdown
                    className="mt-1"
                    options={HOW_HEARD_OPTIONS}
                    value={form.howHeard}
                    onChange={(v) => setField("howHeard", v)}
                    placeholder="Select (optional)"
                  />
                </Field>
              </div>

              {submitError && (
                <div className="mt-4 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
                  {submitError}
                </div>
              )}

              <div className="mt-6 flex gap-3">
                <Button
                  variant="outline"
                  className="flex-1"
                  onClick={() => { setSubmitError(null); setStep(0) }}
                  disabled={loading}
                >
                  ← Back
                </Button>
                <Button className="flex-1" onClick={handleSlide2Continue} disabled={loading}>
                  {loading ? "Saving…" : "Continue →"}
                </Button>
              </div>
            </div>
          )}

          {/* ── Slide 3: Choose Plan ── */}
          {step === 2 && (
            <div>
              <div className="mb-2 text-center">
                <h2 className="text-xl font-semibold text-zinc-900">Choose your plan</h2>
                <p className="mt-1 text-sm text-zinc-500">
                  Every plan includes a 7-day free trial. No charge until the trial ends.
                </p>
              </div>

              <BillingToggle value={billing} onChange={setBilling} />

              <div className="grid grid-cols-1 gap-6 md:grid-cols-3 md:items-stretch">
                {SUBSCRIBE_PLANS.map((plan) => {
                  const isMonthly = billing === "monthly"
                  const yearlyPriceDetails = !isMonthly
                    ? {
                        regularMonthly: `$${plan.monthlyPrice}/mo`,
                        effectiveMonthly: `$${plan.yearlyMonthlyEquiv}`,
                        annualTotalNote: `$${plan.yearlyPrice}/year billed annually`,
                      }
                    : undefined

                  return (
                    <PlanCard
                      key={plan.id}
                      name={plan.name}
                      price={isMonthly ? `$${plan.monthlyPrice}` : `$${plan.yearlyPrice}`}
                      billingCycle={isMonthly ? "/month" : "/year"}
                      bestFor={plan.bestFor}
                      yearlyPriceDetails={yearlyPriceDetails}
                      popular={plan.popular}
                      features={plan.features}
                      onSelect={() => handleSubscribe(plan.id)}
                      loading={loading && loadingPlanId === plan.id}
                    />
                  )
                })}
              </div>

              {submitError && (
                <div className="mt-4 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
                  {submitError}
                </div>
              )}

              <Button
                variant="outline"
                className="mt-6 w-full"
                onClick={() => {
                  setSubmitError(null)
                  setStep(1)
                }}
                disabled={loading}
              >
                ← Back
              </Button>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

// ─── Page export with guards ────────────────────────────────────────────────────

export default function OnboardingPage() {
  return (
    <AuthGuard>
      <EmailVerifiedGuard>
        <OnboardingIncompleteGuard>
          <OnboardingPageContent />
        </OnboardingIncompleteGuard>
      </EmailVerifiedGuard>
    </AuthGuard>
  )
}
