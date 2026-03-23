"use client"

import { Suspense } from "react"
import { LoadingBlock } from "@/components/ui/LoadingSpinner"
import PublicSurveyPageContent from "./PublicSurveyPageContent" // move your existing component here

export default function PublicSurveyPage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-screen items-center justify-center bg-zinc-50">
          <LoadingBlock message="Loading survey…" />
        </div>
      }
    >
      <PublicSurveyPageContent />
    </Suspense>
  )
}