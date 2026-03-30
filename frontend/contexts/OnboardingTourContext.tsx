"use client"

import { createContext, useContext, useState, useCallback, type ReactNode } from "react"
import { useRouter, useSearchParams, usePathname } from "next/navigation"

export type TourStep = {
  targetId: string
  route: string
  title: string
  description: string
}

export const TOUR_STEPS: TourStep[] = [
  {
    targetId: "tour-surveys",
    route: "/dashboard/surveys",
    title: "Surveys",
    description:
      "Create and manage surveys using the interactive drag-and-drop editor. Build multi-question surveys with various question types like ratings, text, and multiple choice.",
  },
  {
    targetId: "tour-locations",
    route: "/dashboard/locations",
    title: "Locations",
    description:
      "Create your physical locations — stores, venues, or any place where you want to collect feedback. Each location can run multiple surveys.",
  },
  {
    targetId: "tour-assign-surveys",
    route: "/dashboard/distribution/assign_surveys",
    title: "Assign Surveys",
    description:
      "Link a survey to a specific location to create a deployment. Each deployment gets its own QR codes and tracks responses independently.",
  },
  {
    targetId: "tour-qr-codes",
    route: "/dashboard/distribution/qr_codes",
    title: "QR Codes",
    description:
      "Generate and manage QR codes for your survey deployments. Customers scan these codes to access your survey — place them on tables, receipts, or signage.",
  },
  {
    targetId: "tour-rules",
    route: "/dashboard/automations/rules",
    title: "Rules",
    description:
      "Create reusable conditions that evaluate survey responses — for example, \"rating is less than 3\" or \"sentiment is negative\". Rules are then used inside flows to trigger actions.",
  },
  {
    targetId: "tour-flows",
    route: "/dashboard/automations/flows",
    title: "Flows",
    description:
      "Build automated workflows that trigger when rules are matched. Flows can redirect customers to Google Reviews, send email alerts to your team, or perform other actions automatically.",
  },
  {
    targetId: "tour-view-responses",
    route: "/dashboard/analytics/view_responses",
    title: "View Responses",
    description:
      "Browse all raw survey responses submitted by your customers. Filter by location, date, or survey and see individual response details including sentiment analysis.",
  },
  {
    targetId: "tour-survey-dashboards",
    route: "/dashboard/analytics/survey_dashboard",
    title: "Survey Dashboards",
    description:
      "See aggregated analytics for all your surveys — response trends, rating distributions, sentiment breakdowns, and more — in one visual dashboard.",
  },
]

type OnboardingTourContextValue = {
  isActive: boolean
  currentStep: number
  totalSteps: number
  currentTourStep: TourStep
  next: () => void
  skip: () => void
}

const OnboardingTourContext = createContext<OnboardingTourContextValue | null>(null)

export function OnboardingTourProvider({ children }: { children: ReactNode }) {
  const searchParams = useSearchParams()
  const router = useRouter()
  const pathname = usePathname()
  const isActive = searchParams.get("tour") === "1"

  const [currentStep, setCurrentStep] = useState(0)

  const skip = useCallback(() => {
    // Remove ?tour=1 from URL, keeping on current page
    const params = new URLSearchParams(searchParams.toString())
    params.delete("tour")
    const query = params.toString()
    router.push(pathname + (query ? `?${query}` : ""))
  }, [router, pathname, searchParams])

  const next = useCallback(() => {
    const nextStep = currentStep + 1
    if (nextStep >= TOUR_STEPS.length) {
      // Last step done — redirect to dashboard overview without ?tour=1
      router.push("/dashboard")
    } else {
      setCurrentStep(nextStep)
      router.push(`${TOUR_STEPS[nextStep].route}?tour=1`)
    }
  }, [currentStep, router, pathname, searchParams])

  // Reset step when tour becomes active (e.g. after a page refresh)
  // We deliberately don't reset on every render — step is managed in state

  return (
    <OnboardingTourContext.Provider
      value={{
        isActive,
        currentStep,
        totalSteps: TOUR_STEPS.length,
        currentTourStep: TOUR_STEPS[currentStep],
        next,
        skip,
      }}
    >
      {children}
    </OnboardingTourContext.Provider>
  )
}

export function useOnboardingTour() {
  const ctx = useContext(OnboardingTourContext)
  if (!ctx) throw new Error("useOnboardingTour must be used inside OnboardingTourProvider")
  return ctx
}
