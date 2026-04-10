"use client"

import { useRouter } from "next/navigation"
import { Building2, Users } from "lucide-react"
import { AuthGuard } from "@/components/auth/AuthGuard"
import { EmailVerifiedGuard } from "@/components/auth/EmailVerifiedGuard"
import { OnboardingIncompleteGuard } from "@/components/auth/OnboardingIncompleteGuard"
import { AuthShell } from "@/components/auth/AuthShell"

function OnboardingChoiceContent() {
  const router = useRouter()

  return (
    <AuthShell>
      <div className="w-full max-w-2xl">
        <div className="mb-10 text-center">
          <h1 className="text-2xl font-bold text-zinc-900">Welcome to Venue Voice</h1>
          <p className="mt-2 text-sm text-zinc-500">How would you like to get started?</p>
        </div>

        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
          {/* Create a company */}
          <button
            type="button"
            onClick={() => router.push("/onboarding/create")}
            className="group flex flex-col items-center rounded-2xl border-2 border-zinc-200 bg-white p-8 text-center shadow-sm transition-all hover:border-violet-400 hover:shadow-md focus:outline-none focus:ring-2 focus:ring-violet-500 focus:ring-offset-2"
          >
            <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-violet-50 transition-colors group-hover:bg-violet-100">
              <Building2 className="h-7 w-7 text-violet-600" />
            </div>
            <h2 className="text-lg font-semibold text-zinc-900">Create a company</h2>
            <p className="mt-2 text-sm text-zinc-500">
              Set up your business, add your first location, and choose a subscription plan.
            </p>
            <span className="mt-6 inline-flex items-center gap-1.5 rounded-xl bg-violet-600 px-5 py-2 text-sm font-medium text-white transition-colors group-hover:bg-violet-700">
              Get started →
            </span>
          </button>

          {/* Join a company */}
          <button
            type="button"
            onClick={() => router.push("/onboarding/join")}
            className="group flex flex-col items-center rounded-2xl border-2 border-zinc-200 bg-white p-8 text-center shadow-sm transition-all hover:border-violet-400 hover:shadow-md focus:outline-none focus:ring-2 focus:ring-violet-500 focus:ring-offset-2"
          >
            <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-zinc-50 transition-colors group-hover:bg-zinc-100">
              <Users className="h-7 w-7 text-zinc-600" />
            </div>
            <h2 className="text-lg font-semibold text-zinc-900">Join a company</h2>
            <p className="mt-2 text-sm text-zinc-500">
              You&apos;ve been invited to access an existing company&apos;s account.
            </p>
            <span className="mt-6 inline-flex items-center gap-1.5 rounded-xl border border-zinc-200 px-5 py-2 text-sm font-medium text-zinc-700 transition-colors group-hover:border-zinc-300 group-hover:bg-zinc-50">
              Continue →
            </span>
          </button>
        </div>
      </div>
    </AuthShell>
  )
}

export default function OnboardingPage() {
  return (
    <AuthGuard>
      <EmailVerifiedGuard>
        <OnboardingIncompleteGuard>
          <OnboardingChoiceContent />
        </OnboardingIncompleteGuard>
      </EmailVerifiedGuard>
    </AuthGuard>
  )
}
