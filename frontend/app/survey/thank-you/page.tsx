"use client"

import { Suspense } from "react"
import { LoadingBlock } from "@/components/ui/LoadingSpinner"
import ThankYouPageContent from "./ThankYouPageContent" // move your existing component here

export default function ThankYouPage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-screen items-center justify-center bg-zinc-50">
          <LoadingBlock message="Loading…" />
        </div>
      }
    >
      <ThankYouPageContent />
    </Suspense>
  )
}