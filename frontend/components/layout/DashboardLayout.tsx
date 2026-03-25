"use client"

import type { ReactNode } from "react"
import { usePathname } from "next/navigation"
import { Sidebar } from "@/components/layout/Sidebar"
import { Topbar } from "@/components/layout/Topbar"
import { UnreadResponsesProvider } from "@/components/layout/UnreadResponsesContext"
import { BrokenRulesProvider } from "@/components/layout/BrokenRulesContext"

export function DashboardLayout({ children }: { children: ReactNode }) {
  const pathname = usePathname()
  const isSurveyEditorRoute = /^\/dashboard\/surveys\/[^/]+$/.test(pathname)
  const isFlowEditorRoute = /^\/dashboard\/automations\/flows\/[^/]+$/.test(pathname)

  return (
    <UnreadResponsesProvider>
      <BrokenRulesProvider>
      <div className="flex min-h-screen bg-zinc-50">
        <Sidebar />
        <div className="flex min-h-screen min-w-0 flex-1 flex-col">
          <Topbar />
          <main
            className={
              isSurveyEditorRoute || isFlowEditorRoute
                ? "flex min-h-0 flex-1 flex-col overflow-hidden"
                : "mx-auto flex-1 w-[80%] max-w-6xl py-8"
            }
          >
            {children}
          </main>
        </div>
      </div>
      </BrokenRulesProvider>
    </UnreadResponsesProvider>
  )
}

