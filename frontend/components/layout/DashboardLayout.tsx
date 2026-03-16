"use client"

import type { ReactNode } from "react"
import { usePathname } from "next/navigation"
import { Sidebar } from "@/components/layout/Sidebar"
import { Topbar } from "@/components/layout/Topbar"

export function DashboardLayout({ children }: { children: ReactNode }) {
  const pathname = usePathname()
  const isSurveyEditorRoute = /^\/dashboard\/surveys\/[^/]+$/.test(pathname)

  return (
    <div className="flex min-h-screen bg-zinc-50">
      <Sidebar />
      <div className="flex min-h-screen min-w-0 flex-1 flex-col">
        <Topbar />
        <main
          className={
            isSurveyEditorRoute
              ? "flex min-h-0 flex-1 flex-col overflow-hidden"
              : "mx-auto flex-1 w-[80%] max-w-6xl py-8"
          }
        >
          {children}
        </main>
      </div>
    </div>
  )
}

