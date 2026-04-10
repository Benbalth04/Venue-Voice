"use client"

import type { ReactNode } from "react"
import { useEffect } from "react"
import { usePathname, useRouter, useSearchParams } from "next/navigation"
import { Sidebar } from "@/components/layout/Sidebar"
import { Topbar } from "@/components/layout/Topbar"
import { UnreadResponsesProvider } from "@/components/layout/UnreadResponsesContext"
import { BrokenRulesProvider } from "@/components/layout/BrokenRulesContext"
import { BrokenFlowsProvider } from "@/components/layout/BrokenFlowsContext"
import { QRSubmissionBlockedProvider } from "@/components/layout/QRSubmissionBlockedContext"
import { OnboardingTourProvider } from "@/contexts/OnboardingTourContext"
import { OnboardingTourOverlay } from "@/components/onboarding/OnboardingTourOverlay"
import { SubscriptionWarningBanner } from "@/components/subscription/SubscriptionWarningBanner"
import { useAuth } from "@/contexts/AuthContext"
import { NewResponseNotificationsProvider } from "@/components/layout/NewResponseNotificationsContext"
import { Toaster } from "sonner"
import type { ToasterProps } from "sonner"

/** Matches `Card`: white surface, zinc border, soft shadow; violet accents for actions / close. */
const dashboardSonnerToastOptions: NonNullable<ToasterProps["toastOptions"]> = {
  classNames: {
    toast:
      "!rounded-2xl !border !border-zinc-200 !bg-white !p-4 !shadow-sm !gap-3 !text-zinc-900",
    title: "!text-sm !font-semibold !text-zinc-900",
    description: "!text-sm !text-zinc-500 !font-normal",
    content: "!gap-0.5",
    actionButton:
      "!shrink-0 !rounded-xl !border-0 !bg-violet-600 !px-3 !py-1.5 !text-xs !font-semibold !text-white !shadow-sm hover:!bg-violet-700",
    closeButton:
      "!border-0 !bg-transparent !text-violet-600 hover:!bg-violet-50 hover:!text-violet-700",
  },
}

const VIEWER_ALLOWED_PREFIXES = [
  "/dashboard/analytics/view_responses",
  "/dashboard/analytics/survey_dashboard",
  "/dashboard/distribution/qr_codes",
]

function ViewerRouteGuard({ children }: { children: ReactNode }) {
  const { activeMembership } = useAuth()
  const pathname = usePathname()
  const router = useRouter()

  useEffect(() => {
    if (activeMembership?.role !== "viewer") return
    const allowed = VIEWER_ALLOWED_PREFIXES.some(
      (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
    )
    if (!allowed) {
      router.replace("/dashboard/analytics/view_responses")
    }
  }, [activeMembership, pathname, router])

  if (
    activeMembership?.role === "viewer" &&
    !VIEWER_ALLOWED_PREFIXES.some(
      (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
    )
  ) {
    return null
  }

  return <>{children}</>
}

export function DashboardLayout({ children }: { children: ReactNode }) {
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const isEmbedded = searchParams.get("embedded") === "1"
  const isSurveyEditorRoute = /^\/dashboard\/surveys\/[^/]+$/.test(pathname)
  const isFlowEditorRoute = /^\/dashboard\/automations\/flows\/[^/]+$/.test(pathname)
  const isSurveyDashboardRoute = pathname.startsWith("/dashboard/analytics/survey_dashboard")
  const isViewResponsesRoute =
    pathname === "/dashboard/analytics/view_responses" ||
    pathname.startsWith("/dashboard/analytics/view_responses/")

  if (isEmbedded) {
    return (
      <UnreadResponsesProvider>
        <BrokenRulesProvider>
          <BrokenFlowsProvider>
            <QRSubmissionBlockedProvider>
              <NewResponseNotificationsProvider>
                <ViewerRouteGuard>
                  <main className="mx-auto flex-1 w-[80%] max-w-6xl py-8">{children}</main>
                </ViewerRouteGuard>
                <Toaster
                  theme="light"
                  closeButton
                  position="bottom-right"
                  toastOptions={dashboardSonnerToastOptions}
                />
              </NewResponseNotificationsProvider>
            </QRSubmissionBlockedProvider>
          </BrokenFlowsProvider>
        </BrokenRulesProvider>
      </UnreadResponsesProvider>
    )
  }

  return (
    <UnreadResponsesProvider>
      <BrokenRulesProvider>
      <BrokenFlowsProvider>
      <QRSubmissionBlockedProvider>
      <OnboardingTourProvider>
      <NewResponseNotificationsProvider>
      <div className="flex min-h-screen bg-zinc-50">
        <Sidebar />
        <div className="flex min-h-screen min-w-0 flex-1 flex-col">
          <Topbar />
          <SubscriptionWarningBanner />
          <main
            className={
              isSurveyEditorRoute || isFlowEditorRoute
                ? "flex min-h-0 flex-1 flex-col overflow-hidden"
                : isSurveyDashboardRoute || isViewResponsesRoute
                ? "mx-auto flex-1 w-[95%] max-w-screen-2xl py-8"
                : "mx-auto flex-1 w-[80%] max-w-6xl py-8"
            }
          >
            <ViewerRouteGuard>{children}</ViewerRouteGuard>
          </main>
        </div>
      </div>
      <OnboardingTourOverlay />
      <Toaster
        theme="light"
        closeButton
        position="bottom-right"
        toastOptions={dashboardSonnerToastOptions}
      />
      </NewResponseNotificationsProvider>
      </OnboardingTourProvider>
      </QRSubmissionBlockedProvider>
      </BrokenFlowsProvider>
      </BrokenRulesProvider>
    </UnreadResponsesProvider>
  )
}

