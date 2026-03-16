"use client"

import { Suspense } from "react"
import ThankYouPageContent from "./ThankYouPageContent" // move your existing component here

export default function ThankYouPage() {
  return (
    <Suspense fallback={<div>Loading...</div>}>
      <ThankYouPageContent />
    </Suspense>
  )
}