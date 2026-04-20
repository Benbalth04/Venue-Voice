"use client"

import { Fragment, useState } from "react"
import { useRouter } from "next/navigation"
import { AuthGuard } from "@/components/auth/AuthGuard"
import { EmailVerifiedGuard } from "@/components/auth/EmailVerifiedGuard"
import { OnboardingIncompleteGuard } from "@/components/auth/OnboardingIncompleteGuard"
import { BillingToggle } from "@/components/subscription/BillingToggle"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { AuthShell } from "@/components/auth/AuthShell"
import { Check } from "lucide-react"
import { setupAccount, createCheckoutSession, extractErrorMessage } from "@/lib/api/client"
import {
  AUSTRALIA_TIMEZONE_OPTIONS,
  guessBrowserAustraliaTimezone,
} from "@/lib/timezone/australia"
import {
  LOCATION_COUNT_MAX,
  LOCATION_COUNT_MIN,
  LOCATION_FEATURES,
  LOCATION_PRICE_MONTHLY,
  LOCATION_PRICE_YEARLY_MONTHLY_EQUIV,
  LOCATION_PRICE_YEARLY_TOTAL,
  calcLocationTotal,
  type BillingInterval,
} from "@/lib/subscription/plans"
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

/** Dropdown value for free-text follow-up (must match option value above). */
const OTHER_OPTION_VALUE = "Other"

const TIMEZONE_OPTIONS: DropdownOption[] = AUSTRALIA_TIMEZONE_OPTIONS.map((o) => ({
  value: o.value,
  label: o.label,
}))

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
  `mt-1 w-full rounded-xl border px-3 py-2 text-sm outline-none transition-colors focus:ring-2 focus:ring-violet-500 ${
    hasError ? "border-red-300 bg-red-50" : "border-zinc-200 bg-white hover:border-zinc-300"
  }`

/** Optional text below a dropdown; same visual language as text inputs, slightly more top spacing. */
const otherDetailInputClass =
  "mt-2 w-full rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-800 outline-none transition-colors placeholder:text-zinc-400 hover:border-zinc-300 focus:ring-2 focus:ring-violet-500"

// ─── Page content ────────────────────────────────────────────────────────────────

function CreateCompanyContent() {
  const router = useRouter()
  const { session } = useAuth()
  const [step, setStep] = useState(0)

  const [form, setFormState] = useState(() => ({
    companyName: "",
    locationName: "",
    timezone: guessBrowserAustraliaTimezone(),
    locationState: "",
    locationCountry: "",
    locationGoogleUrl: "",
    primaryIndustry: "",
    companySize: "",
    locationCount: "",
    howHeard: "",
    primaryIndustryOther: "",
    howHeardOther: "",
  }))

  const [fieldErrors, setFieldErrors] = useState<{ companyName?: string; locationName?: string }>({})
  const [submitError, setSubmitError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [billing, setBilling] = useState<BillingInterval>("monthly")
  const [locationCount, setLocationCount] = useState(1)

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

  function buildPrimaryIndustryPayload(): string | null {
    if (!form.primaryIndustry) return null
    if (form.primaryIndustry === OTHER_OPTION_VALUE) {
      const detail = form.primaryIndustryOther.trim()
      return detail ? `Other — ${detail}` : OTHER_OPTION_VALUE
    }
    return form.primaryIndustry
  }

  function buildHowHeardPayload(): string | null {
    if (!form.howHeard) return null
    if (form.howHeard === OTHER_OPTION_VALUE) {
      const detail = form.howHeardOther.trim()
      return detail ? `Other — ${detail}` : OTHER_OPTION_VALUE
    }
    return form.howHeard
  }

  async function handleSlide2Continue() {
    if (!session?.access_token) { router.replace("/login"); return }
    setSubmitError(null)
    setLoading(true)
    try {
      await setupAccount(session.access_token, {
        company_name: form.companyName,
        location_name: form.locationName,
        timezone: form.timezone,
        location_state: form.locationState || null,
        location_country: form.locationCountry || null,
        location_google_business_url: form.locationGoogleUrl || null,
        primary_industry: buildPrimaryIndustryPayload(),
        company_size: form.companySize || null,
        location_count: form.locationCount ? parseInt(form.locationCount, 10) || null : null,
        how_heard: buildHowHeardPayload(),
      })
      setStep(2)
    } catch (err) {
      setSubmitError(extractErrorMessage(err, "Setup failed. Please try again."))
    } finally {
      setLoading(false)
    }
  }

  // ── Slide 3 ──────────────────────────────────────────────────────────────────

  async function handleSubscribe() {
    if (!session?.access_token) {
      router.replace("/login")
      return
    }
    setLoading(true)
    setSubmitError(null)
    try {
      const { checkout_url } = await createCheckoutSession(session.access_token, {
        locationCount,
        billingInterval: billing,
      })
      window.location.href = checkout_url
    } catch (err) {
      setSubmitError(extractErrorMessage(err, "Failed to start checkout. Please try again."))
      setLoading(false)
    }
  }

  // ── Render ────────────────────────────────────────────────────────────────────

  return (
    <AuthShell>
      <div className="w-full max-w-2xl">
        <Card className="p-8">
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

                <Field label="Your timezone">
                  <SingleSelectDropdown
                    className="mt-1"
                    options={TIMEZONE_OPTIONS}
                    value={form.timezone}
                    onChange={(v) => setField("timezone", v)}
                    placeholder="Select timezone"
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
                    onChange={(v) => {
                      setFormState((prev) => ({
                        ...prev,
                        primaryIndustry: v,
                        ...(v !== OTHER_OPTION_VALUE ? { primaryIndustryOther: "" } : {}),
                      }))
                    }}
                    placeholder="Select (optional)"
                  />
                  {form.primaryIndustry === OTHER_OPTION_VALUE ? (
                    <input
                      className={otherDetailInputClass}
                      placeholder="Add details (optional)"
                      value={form.primaryIndustryOther}
                      maxLength={2000}
                      onChange={(e) => setField("primaryIndustryOther", e.target.value)}
                      aria-label="Industry, other details"
                    />
                  ) : null}
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
                    onChange={(v) => {
                      setFormState((prev) => ({
                        ...prev,
                        howHeard: v,
                        ...(v !== OTHER_OPTION_VALUE ? { howHeardOther: "" } : {}),
                      }))
                    }}
                    placeholder="Select (optional)"
                  />
                  {form.howHeard === OTHER_OPTION_VALUE ? (
                    <input
                      className={otherDetailInputClass}
                      placeholder="Add details (optional)"
                      value={form.howHeardOther}
                      maxLength={2000}
                      onChange={(e) => setField("howHeardOther", e.target.value)}
                      aria-label="How you heard about us, other details"
                    />
                  ) : null}
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
              <div className="mb-6 text-center">
                <h2 className="text-xl font-semibold text-zinc-900">Choose your plan</h2>
                <p className="mt-1 text-sm text-zinc-500">
                  Every plan includes a 7-day free trial. No charge until the trial ends.
                </p>
              </div>

              <div className="relative bg-white rounded-2xl border border-zinc-200 shadow-xl overflow-hidden">
                <div className="h-1 w-full bg-gradient-to-r from-violet-500 to-violet-400" />
                <div className="p-8 flex flex-col items-center text-center">

                  <div className="text-xl font-extrabold text-zinc-900 mb-1">Simple Per-location Pricing</div>
                  <p className="text-sm text-zinc-500 mb-6">Scale up or down as your business grows</p>

                  <BillingToggle value={billing} onChange={setBilling} />

                  {(() => {
                    const isYearly = billing === "yearly"
                    const displayPerLocation = isYearly ? LOCATION_PRICE_YEARLY_MONTHLY_EQUIV : LOCATION_PRICE_MONTHLY
                    const { total, annualNote } = calcLocationTotal(locationCount, billing)
                    const monthlyTotal = locationCount * LOCATION_PRICE_MONTHLY
                    return (
                      <>
                        <div className="mb-2 mt-2">
                          <div className="flex items-end justify-center gap-1.5">
                            <span className="text-7xl font-extrabold leading-none text-zinc-900">${displayPerLocation}</span>
                            <div className="mb-2 text-zinc-400 text-sm leading-snug text-left">
                              <div>per location</div>
                              <div>/ month</div>
                            </div>
                          </div>
                          {isYearly ? (
                            <p className="text-sm text-zinc-500 mt-2">
                              Billed annually (${LOCATION_PRICE_YEARLY_TOTAL} per location / year)
                            </p>
                          ) : (
                            <p className="text-sm text-zinc-500 mt-2">Billed monthly — switch to yearly to save 20%</p>
                          )}
                        </div>

                        <div className="mt-6 w-full">
                          <p className="text-sm font-medium text-zinc-700 mb-3">How many locations?</p>
                          <div className="flex flex-col items-center gap-3">
                            <div className="flex items-center gap-2">
                              <button
                                type="button"
                                onClick={() => setLocationCount((c) => Math.max(LOCATION_COUNT_MIN, c - 1))}
                                disabled={locationCount <= LOCATION_COUNT_MIN}
                                className="flex h-9 w-9 items-center justify-center rounded-lg border border-zinc-200 bg-white text-zinc-700 text-lg font-semibold transition hover:bg-zinc-50 disabled:cursor-not-allowed disabled:opacity-40"
                                aria-label="Decrease location count"
                              >
                                −
                              </button>
                              <input
                                type="number"
                                value={locationCount}
                                onChange={(e) => {
                                  const parsed = parseInt(e.target.value, 10)
                                  if (!Number.isNaN(parsed)) {
                                    setLocationCount(Math.min(LOCATION_COUNT_MAX, Math.max(LOCATION_COUNT_MIN, parsed)))
                                  }
                                }}
                                min={LOCATION_COUNT_MIN}
                                max={LOCATION_COUNT_MAX}
                                className="h-9 w-16 rounded-lg border border-zinc-200 bg-white text-center text-sm font-semibold text-zinc-900 focus:outline-none focus:ring-2 focus:ring-violet-500 [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
                                aria-label="Number of locations"
                              />
                              <button
                                type="button"
                                onClick={() => setLocationCount((c) => Math.min(LOCATION_COUNT_MAX, c + 1))}
                                disabled={locationCount >= LOCATION_COUNT_MAX}
                                className="flex h-9 w-9 items-center justify-center rounded-lg border border-zinc-200 bg-white text-zinc-700 text-lg font-semibold transition hover:bg-zinc-50 disabled:cursor-not-allowed disabled:opacity-40"
                                aria-label="Increase location count"
                              >
                                +
                              </button>
                            </div>
                            <div className="inline-flex items-center gap-2 bg-violet-50 text-violet-700 text-sm font-medium px-4 py-2.5 rounded-xl">
                              <span className="opacity-60 text-xs">Total:</span>
                              {locationCount} {locationCount === 1 ? "location" : "locations"} ={" "}
                              {isYearly ? `$${total}/year` : `$${monthlyTotal}/month`}
                            </div>
                            {isYearly && annualNote && (
                              <p className="text-xs text-zinc-400">{annualNote}</p>
                            )}
                          </div>
                        </div>

                        <div className="my-8 h-px bg-zinc-100 w-full" />

                        <p className="text-xs font-bold tracking-widest uppercase text-zinc-400 mb-5">Everything included</p>
                        <ul className="grid sm:grid-cols-2 gap-x-10 gap-y-3.5 text-left w-full mb-8">
                          {LOCATION_FEATURES.map((feature) => (
                            <li key={feature} className="flex items-start gap-3 text-sm text-zinc-700">
                              <span className="mt-0.5 shrink-0 flex items-center justify-center w-4 h-4 rounded-full bg-violet-100">
                                <Check className="w-2.5 h-2.5 text-violet-600 stroke-[3]" />
                              </span>
                              {feature}
                            </li>
                          ))}
                        </ul>

                        <div className="mb-8 h-px bg-zinc-100 w-full" />

                        <button
                          onClick={handleSubscribe}
                          disabled={loading}
                          className="flex items-center justify-center h-12 w-full max-w-sm rounded-xl text-sm font-semibold bg-violet-600 text-white hover:bg-violet-700 transition-colors duration-200 disabled:opacity-60 disabled:cursor-not-allowed"
                        >
                          {loading ? "Redirecting…" : "Start capturing feedback"}
                        </button>
                        <p className="text-xs text-zinc-400 mt-3">Set up in minutes. 7-day free trial. No contracts.</p>
                      </>
                    )
                  })()}
                </div>
              </div>

              {submitError && (
                <div className="mt-4 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
                  {submitError}
                </div>
              )}

              <Button
                variant="outline"
                className="mt-4 w-full"
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
        </Card>
      </div>
    </AuthShell>
  )
}

// ─── Page export with guards ────────────────────────────────────────────────────

export default function CreateCompanyPage() {
  return (
    <AuthGuard>
      <EmailVerifiedGuard>
        <OnboardingIncompleteGuard>
          <CreateCompanyContent />
        </OnboardingIncompleteGuard>
      </EmailVerifiedGuard>
    </AuthGuard>
  )
}
