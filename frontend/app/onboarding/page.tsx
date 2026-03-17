"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import Link from "next/link"
import { Card } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { setupAccount, extractErrorMessage } from "@/lib/api/client"
import { useAuth } from "@/contexts/AuthContext"
import { AuthGuard } from "@/components/auth/AuthGuard"
import { OnboardingIncompleteGuard } from "@/components/auth/OnboardingIncompleteGuard"

const INDUSTRY_OPTIONS = [
  "Retail",
  "Hospitality",
  "Healthcare",
  "Fitness",
  "Entertainment",
  "Food & Beverage",
  "Real Estate",
  "Education",
  "Other",
]

const COMPANY_SIZE_OPTIONS = [
  "0-10",
  "10-30",
  "30-50",
  "50-100",
  "100-250",
  "250-500",
  "500-1000",
  "1000+",
]

const HOW_HEARD_OPTIONS = [
  "Internet Search",
  "Social media",
  "Referral",
  "Advertisement",
  "Event",
  "Other",
]

function OnboardingPageContent() {
  const router = useRouter()
  const { session } = useAuth()

  const [companyName, setCompanyName] = useState("")
  const [locationName, setLocationName] = useState("")
  const [locationState, setLocationState] = useState("")
  const [locationCountry, setLocationCountry] = useState("")
  const [locationGoogleUrl, setLocationGoogleUrl] = useState("")
  const [primaryIndustry, setPrimaryIndustry] = useState("")
  const [companySize, setCompanySize] = useState("")
  const [locationCount, setLocationCount] = useState<string>("")
  const [howHeard, setHowHeard] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setLoading(true)

    try {
      if (!session?.access_token) {
        router.replace("/login")
        return
      }

      await setupAccount(session.access_token, {
        company_name: companyName,
        location_name: locationName,
        location_state: locationState || null,
        location_country: locationCountry || null,
        location_google_business_url: locationGoogleUrl || null,
        primary_industry: primaryIndustry || null,
        company_size: companySize || null,
        location_count: (() => {
          if (!locationCount) return null
          const n = parseInt(locationCount, 10)
          return Number.isNaN(n) ? null : n
        })(),
        how_heard: howHeard || null,
      })

      router.push("/dashboard")
    } catch (err) {
      setError(extractErrorMessage(err, "Setup failed"))
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-zinc-50 px-4">
      <Card className="w-full max-w-md p-6">
        <h1 className="text-xl font-semibold text-zinc-900">
          Welcome to VenueVoice
        </h1>

        <p className="mt-1 text-sm text-zinc-600">
          First, Let's create your first business location.
        </p>

        <br />

        <p className="mt-1 text-sm text-zinc-600">
          We would love to hear more about your business to help you get the
          most out of VenueVoice, but you can skip any questions you're not
          comfortable answering.
        </p>

        <form className="mt-6 space-y-4" onSubmit={onSubmit}>
          <label className="block">
            <span className="text-sm font-medium text-zinc-700">
              Company Name
            </span>
            <input
              className="mt-1 w-full rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-violet-500"
              value={companyName}
              onChange={(e) => setCompanyName(e.target.value)}
              required
            />
          </label>

          <label className="block">
            <span className="text-sm font-medium text-zinc-700">
              First Location Name
            </span>
            <input
              className="mt-1 w-full rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-violet-500"
              placeholder="e.g. Main Venue, City Branch"
              value={locationName}
              onChange={(e) => setLocationName(e.target.value)}
              required
            />
          </label>

          <div className="grid grid-cols-2 gap-3">
            <label className="block">
              <span className="text-sm font-medium text-zinc-700">State</span>
              <input
                className="mt-1 w-full rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-violet-500"
                placeholder="e.g. NSW (optional)"
                value={locationState}
                onChange={(e) => setLocationState(e.target.value)}
              />
            </label>

            <label className="block">
              <span className="text-sm font-medium text-zinc-700">Country</span>
              <input
                className="mt-1 w-full rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-violet-500"
                placeholder="e.g. AU (optional)"
                value={locationCountry}
                onChange={(e) => setLocationCountry(e.target.value)}
              />
            </label>
          </div>

          <label className="block">
            <span className="text-sm font-medium text-zinc-700">
              Google Business URL
            </span>
            <input
              className="mt-1 w-full rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-violet-500"
              placeholder="https://maps.google.com/… (optional)"
              value={locationGoogleUrl}
              onChange={(e) => setLocationGoogleUrl(e.target.value)}
            />
          </label>

          <label className="block">
            <span className="text-sm font-medium text-zinc-700">
              Company primary industry
            </span>
            <select
              className="mt-1 w-full rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-violet-500"
              value={primaryIndustry}
              onChange={(e) => setPrimaryIndustry(e.target.value)}
            >
              <option value="">Select industry (optional)</option>
              {INDUSTRY_OPTIONS.map((opt) => (
                <option key={opt} value={opt}>
                  {opt}
                </option>
              ))}
            </select>
          </label>

          <label className="block">
            <span className="text-sm font-medium text-zinc-700">
              Company size
            </span>
            <select
              className="mt-1 w-full rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-violet-500"
              value={companySize}
              onChange={(e) => setCompanySize(e.target.value)}
            >
              <option value="">Select size (optional)</option>
              {COMPANY_SIZE_OPTIONS.map((opt) => (
                <option key={opt} value={opt}>
                  {opt} employees
                </option>
              ))}
            </select>
          </label>

          <label className="block">
            <span className="text-sm font-medium text-zinc-700">
              How many locations do you currently have?
            </span>
            <input
              type="number"
              min={0}
              className="mt-1 w-full rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-violet-500"
              placeholder="e.g. 5 (optional)"
              value={locationCount}
              onChange={(e) => setLocationCount(e.target.value)}
            />
          </label>

          <label className="block">
            <span className="text-sm font-medium text-zinc-700">
              How did you hear about us?
            </span>
            <select
              className="mt-1 w-full rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-violet-500"
              value={howHeard}
              onChange={(e) => setHowHeard(e.target.value)}
            >
              <option value="">Select (optional)</option>
              {HOW_HEARD_OPTIONS.map((opt) => (
                <option key={opt} value={opt}>
                  {opt}
                </option>
              ))}
            </select>
          </label>

          {error && (
            <div className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
              {error}
            </div>
          )}

          <Button className="w-full" type="submit" disabled={loading}>
            {loading ? "Setting up…" : "Continue"}
          </Button>
        </form>

        <p className="mt-4 text-center text-xs text-zinc-500">
          Already have an account?{" "}
          <Link className="font-medium text-violet-700" href="/login">
            Log in
          </Link>
        </p>
      </Card>
    </div>
  )
}

export default function OnboardingPage() {
  return (
    <AuthGuard>
      <OnboardingIncompleteGuard>
        <OnboardingPageContent />
      </OnboardingIncompleteGuard>
    </AuthGuard>
  )
}