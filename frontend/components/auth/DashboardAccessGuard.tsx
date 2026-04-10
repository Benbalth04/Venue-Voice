"use client"

import { useEffect, useState, type ReactNode } from "react"
import { useRouter } from "next/navigation"
import { useAuth } from "@/contexts/AuthContext"
import { fetchSubscription } from "@/lib/api/client"
import { supabase } from "@/lib/supabase/client"
import { Button } from "@/components/ui/button"

type BlockReason = "email" | "invite" | "onboarding" | "subscription" | "sub_error"

interface OverlayConfig {
  icon: "warning" | "lock" | "card"
  title: string
  message: string
  button: string
  href: string | null
}

const OVERLAY_CONFIG: Record<BlockReason, OverlayConfig> = {
  email: {
    icon: "warning",
    title: "Verify your email",
    message:
      "Please verify your email address to access the dashboard. Check your inbox for a confirmation link.",
    button: "Go to Inbox",
    href: "/verify-email",
  },
  invite: {
    icon: "lock",
    title: "Complete your account setup",
    message:
      "Please finish setting up your account — set a password and select your timezone to get started.",
    button: "Complete Setup",
    href: "/onboarding/invite-setup",
  },
  onboarding: {
    icon: "lock",
    title: "Complete your setup",
    message:
      "You haven't finished setting up your account. Complete the onboarding process to get started.",
    button: "Complete Setup",
    href: "/onboarding",
  },
  subscription: {
    icon: "card",
    title: "Subscription required",
    message:
      "Your subscription is inactive. Set up billing to continue using Venue Voice.",
    button: "Manage Billing",
    href: "/subscribe",
  },
  sub_error: {
    icon: "warning",
    title: "Could not verify subscription",
    message:
      "We couldn't confirm your subscription status. Please refresh the page or try again.",
    button: "Refresh",
    href: null,
  },
}

function OverlayIcon({ type }: { type: OverlayConfig["icon"] }) {
  if (type === "lock") {
    return (
      <svg className="h-7 w-7 text-amber-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={2}
          d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"
        />
      </svg>
    )
  }
  if (type === "card") {
    return (
      <svg className="h-7 w-7 text-amber-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={2}
          d="M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z"
        />
      </svg>
    )
  }
  // warning (default)
  return (
    <svg className="h-7 w-7 text-amber-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M12 9v2m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"
      />
    </svg>
  )
}

export function DashboardAccessGuard({ children }: { children: ReactNode }) {
  const { loading: authLoading, user, session } = useAuth()
  const router = useRouter()
  const [checking, setChecking] = useState(true)
  const [blockReason, setBlockReason] = useState<BlockReason | null>(null)

  function handleLogout() {
    supabase.auth.signOut().catch((err) => {
      console.error("Supabase signOut failed:", err)
    })
    router.push("/login")
    router.refresh()
  }

  /* eslint-disable react-hooks/set-state-in-effect -- sync guard branches before async fetchSubscription */
  useEffect(() => {
    if (authLoading) return

    // AuthGuard (above this in the tree) handles unauthenticated users.
    // If we reach here without a session, just stop checking — AuthGuard
    // will redirect to /login.
    const token = session?.access_token ?? null
    if (!user || !token) {
      setChecking(false)
      return
    }

    if (!user.email_verified) {
      setBlockReason("email")
      setChecking(false)
      return
    }

    if (user.invite_pending) {
      setBlockReason("invite")
      setChecking(false)
      return
    }

    if (!user.onboarding_complete) {
      setBlockReason("onboarding")
      setChecking(false)
      return
    }

    fetchSubscription(token)
      .then((sub) => {
        if (!sub.is_active) setBlockReason("subscription")
        else setBlockReason(null)
      })
      .catch(() => setBlockReason("sub_error"))
      .finally(() => setChecking(false))
  }, [authLoading, user, session])
  /* eslint-enable react-hooks/set-state-in-effect */

  // Show spinner while AuthContext or subscription check is in progress
  if (authLoading || checking) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-zinc-50">
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-violet-600 border-t-transparent" />
      </div>
    )
  }

  // All checks passed — render dashboard normally
  if (!blockReason) {
    return <>{children}</>
  }

  const config = OVERLAY_CONFIG[blockReason]

  return (
    <div className="relative min-h-screen overflow-hidden">
      {/* Blurred dashboard shell rendered behind the overlay */}
      <div className="pointer-events-none select-none blur-sm" aria-hidden="true">
        {children}
      </div>

      {/* Full-screen overlay */}
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-white/70 backdrop-blur-sm px-4">
        <div className="w-full max-w-sm rounded-2xl border border-zinc-200 bg-white p-8 shadow-xl text-center">
          <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-amber-50">
            <OverlayIcon type={config.icon} />
          </div>

          <h2 className="text-lg font-semibold text-zinc-900">{config.title}</h2>
          <p className="mt-2 text-sm text-zinc-500 leading-relaxed">{config.message}</p>

          <Button
            className="mt-6 w-full"
            onClick={() =>
              config.href ? router.push(config.href) : window.location.reload()
            }
          >
            {config.button}
          </Button>
          <Button
            type="button"
            variant="outline"
            className="mt-3 w-full"
            onClick={handleLogout}
          >
            Log out
          </Button>
        </div>
      </div>
    </div>
  )
}
