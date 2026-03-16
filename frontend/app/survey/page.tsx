"use client"

import { Suspense } from "react"
import PublicSurveyPageContent from "./PublicSurveyPageContent" // move your existing component here

export default function PublicSurveyPage() {
  return (
    <Suspense fallback={<div>Loading...</div>}>
      <PublicSurveyPageContent />
    </Suspense>
  )
}