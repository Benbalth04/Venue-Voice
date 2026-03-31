"use client"

import type { ReactNode } from "react"
import { usePathname, useSearchParams } from "next/navigation"
import { Sidebar } from "@/components/layout/Sidebar"
import { Topbar } from "@/components/layout/Topbar"
import { UnreadResponsesProvider } from "@/components/layout/UnreadResponsesContext"
import { BrokenRulesProvider } from "@/components/layout/BrokenRulesContext"
import { BrokenFlowsProvider } from "@/components/layout/BrokenFlowsContext"
import { QRSubmissionBlockedProvider } from "@/components/layout/QRSubmissionBlockedContext"
import { OnboardingTourProvider } from "@/contexts/OnboardingTourContext"
import { OnboardingTourOverlay } from "@/components/onboarding/OnboardingTourOverlay"

export function DashboardLayout({ children }: { children: ReactNode }) {
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const isEmbedded = searchParams.get("embedded") === "1"
  const isSurveyEditorRoute = /^\/dashboard\/surveys\/[^/]+$/.test(pathname)
  const isFlowEditorRoute = /^\/dashboard\/automations\/flows\/[^/]+$/.test(pathname)
  const isSurveyDashboardRoute = pathname.startsWith("/dashboard/analytics/survey_dashboard")

  if (isEmbedded) {
    return (
      <UnreadResponsesProvider>
        <BrokenRulesProvider>
          <BrokenFlowsProvider>
            <QRSubmissionBlockedProvider>
              <main className="mx-auto flex-1 w-[80%] max-w-6xl py-8">{children}</main>
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
      <div className="flex min-h-screen bg-zinc-50">
        <Sidebar />
        <div className="flex min-h-screen min-w-0 flex-1 flex-col">
          <Topbar />
          <main
            className={
              isSurveyEditorRoute || isFlowEditorRoute
                ? "flex min-h-0 flex-1 flex-col overflow-hidden"
                : isSurveyDashboardRoute
                ? "mx-auto flex-1 w-[95%] max-w-screen-2xl py-8"
                : "mx-auto flex-1 w-[80%] max-w-6xl py-8"
            }
          >
            {children}
          </main>
        </div>
      </div>
      <OnboardingTourOverlay />
      </OnboardingTourProvider>
      </QRSubmissionBlockedProvider>
      </BrokenFlowsProvider>
      </BrokenRulesProvider>
    </UnreadResponsesProvider>
  )
}

