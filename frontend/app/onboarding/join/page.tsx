"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { ArrowLeft, LogOut, Mail, Loader2, CheckCircle2 } from "lucide-react"
import { AuthGuard } from "@/components/auth/AuthGuard"
import { EmailVerifiedGuard } from "@/components/auth/EmailVerifiedGuard"
import { OnboardingIncompleteGuard } from "@/components/auth/OnboardingIncompleteGuard"
import { useAuth } from "@/contexts/AuthContext"
import { supabase } from "@/lib/supabase/client"
import { completeJoin, extractErrorMessage } from "@/lib/api/client"
import { Card } from "@/components/ui/card"
import { AuthShell } from "@/components/auth/AuthShell"

function JoinCompanyContent() {
  const router = useRouter()
  const { user, refreshUser } = useAuth()
  const [checking, setChecking] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleCheckMembership() {
    setChecking(true)
    setError(null)
    try {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) {
        router.replace("/login")
        return
      }
      await completeJoin(session.access_token)
      await refreshUser()
      router.push("/dashboard")
    } catch (e) {
      const msg = extractErrorMessage(e)
      if (msg.toLowerCase().includes("membership") || msg.toLowerCase().includes("company")) {
        setError("You haven't been added to any company yet. Ask your admin to invite you first.")
      } else {
        setError(msg)
      }
    } finally {
      setChecking(false)
    }
  }

  async function handleLogout() {
    await supabase.auth.signOut()
    router.push("/login")
  }

  return (
    <AuthShell>
      <div className="w-full max-w-lg">
        {/* Nav row */}
        <div className="mb-8 flex items-center justify-between">
          <button
            type="button"
            onClick={() => router.push("/onboarding")}
            className="inline-flex items-center gap-1.5 text-sm font-medium text-zinc-500 hover:text-zinc-700"
          >
            <ArrowLeft className="h-4 w-4" />
            Back
          </button>
          <button
            type="button"
            onClick={handleLogout}
            className="inline-flex items-center gap-1.5 text-sm font-medium text-zinc-500 hover:text-zinc-700"
          >
            <LogOut className="h-4 w-4" />
            Log out
          </button>
        </div>

        <Card className="p-8">
          {/* Icon + heading */}
          <div className="mb-6 flex flex-col items-center text-center">
            <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-violet-50">
              <Mail className="h-7 w-7 text-violet-600" />
            </div>
            <h1 className="text-xl font-semibold text-zinc-900">Check your email for an invite</h1>
            <p className="mt-2 text-sm text-zinc-500">
              Your admin needs to add you to their company before you can access the dashboard.
            </p>
          </div>

          {/* User email */}
          {user?.email && (
            <div className="mb-6">
              <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-zinc-400">
                Your email address
              </p>
              <div className="flex items-center gap-2 rounded-xl border border-zinc-200 bg-zinc-50 px-3 py-2.5">
                <Mail className="h-4 w-4 shrink-0 text-zinc-400" />
                <span className="select-all text-sm font-medium text-zinc-800">{user.email}</span>
              </div>
            </div>
          )}

          {/* Instructions */}
          <div className="mb-6 rounded-xl border border-zinc-100 bg-zinc-50 p-4">
            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-zinc-400">
              What to tell your admin
            </p>
            <ol className="space-y-1.5 text-sm text-zinc-600">
              <li className="flex items-start gap-2">
                <span className="mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-violet-100 text-[10px] font-bold text-violet-700">1</span>
                Go to <strong className="text-zinc-700">User Management</strong> in the sidebar
              </li>
              <li className="flex items-start gap-2">
                <span className="mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-violet-100 text-[10px] font-bold text-violet-700">2</span>
                Click <strong className="text-zinc-700">Invite Viewer</strong>
              </li>
              <li className="flex items-start gap-2">
                <span className="mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-violet-100 text-[10px] font-bold text-violet-700">3</span>
                Enter your email address shown above
              </li>
            </ol>
          </div>

          {/* Check button */}
          <div className="border-t border-zinc-100 pt-6">
            <p className="mb-3 text-center text-sm text-zinc-500">
              Already been added by your admin?
            </p>
            <button
              type="button"
              onClick={handleCheckMembership}
              disabled={checking}
              className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-violet-600 px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-violet-700 disabled:opacity-60"
            >
              {checking ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Checking…
                </>
              ) : (
                <>
                  <CheckCircle2 className="h-4 w-4" />
                  Check if I&apos;m a member
                </>
              )}
            </button>

            {error && (
              <p className="mt-3 text-center text-sm text-red-600" role="alert">
                {error}
              </p>
            )}
          </div>
        </Card>
      </div>
    </AuthShell>
  )
}

export default function JoinCompanyPage() {
  return (
    <AuthGuard>
      <EmailVerifiedGuard>
        <OnboardingIncompleteGuard>
          <JoinCompanyContent />
        </OnboardingIncompleteGuard>
      </EmailVerifiedGuard>
    </AuthGuard>
  )
}
