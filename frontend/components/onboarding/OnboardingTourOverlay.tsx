"use client"

import { useEffect, useRef, useState } from "react"
import { X } from "lucide-react"
import { useOnboardingTour, TOUR_STEPS } from "@/contexts/OnboardingTourContext"

type Rect = { top: number; left: number; right: number; bottom: number; width: number; height: number }

const PADDING = 6

export function OnboardingTourOverlay() {
  const { isActive, currentStep, totalSteps, currentTourStep, next, skip } = useOnboardingTour()
  const [rect, setRect] = useState<Rect | null>(null)
  const [visible, setVisible] = useState(false)
  const measureTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  function measure() {
    const el = document.getElementById(TOUR_STEPS[currentStep].targetId)
    if (!el) return
    const r = el.getBoundingClientRect()
    setRect({ top: r.top, left: r.left, right: r.right, bottom: r.bottom, width: r.width, height: r.height })
    setVisible(true)
  }

  useEffect(() => {
    if (!isActive) {
      setVisible(false)
      setRect(null)
      return
    }

    // Fade out, remeasure, fade in
    setVisible(false)
    if (measureTimerRef.current) clearTimeout(measureTimerRef.current)
    measureTimerRef.current = setTimeout(() => {
      measure()
    }, 150)

    return () => {
      if (measureTimerRef.current) clearTimeout(measureTimerRef.current)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isActive, currentStep])

  useEffect(() => {
    if (!isActive) return
    const onResize = () => measure()
    window.addEventListener("resize", onResize)
    return () => window.removeEventListener("resize", onResize)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isActive, currentStep])

  const [isMobile, setIsMobile] = useState(() =>
    typeof window !== "undefined" ? window.innerWidth < 1024 : false,
  )

  useEffect(() => {
    const onResize = () => setIsMobile(window.innerWidth < 1024)
    window.addEventListener("resize", onResize)
    return () => window.removeEventListener("resize", onResize)
  }, [])

  if (!isActive || isMobile) return null

  const isLastStep = currentStep === totalSteps - 1

  // Common overlay style
  const overlayBase: React.CSSProperties = {
    position: "fixed",
    zIndex: 9000,
    background: "rgba(0,0,0,0.65)",
    pointerEvents: "all",
    transition: "opacity 0.15s ease",
    opacity: visible ? 1 : 0,
  }

  if (!rect) {
    // Full-screen fallback while measuring
    return (
      <div style={{ ...overlayBase, inset: 0 }}>
        <TourCard
          currentStep={currentStep}
          totalSteps={totalSteps}
          step={currentTourStep}
          isLastStep={isLastStep}
          onNext={next}
          onSkip={skip}
          visible={false}
          position={{ top: "50%", left: "50%", transform: "translate(-50%,-50%)" }}
        />
      </div>
    )
  }

  const spotTop = rect.top - PADDING
  const spotLeft = rect.left - PADDING
  const spotRight = rect.right + PADDING
  const spotBottom = rect.bottom + PADDING
  const spotWidth = spotRight - spotLeft
  const spotHeight = spotBottom - spotTop

  // Tooltip positioning: to the right of the sidebar item, vertically centred
  const tooltipLeft = spotRight + 20
  const tooltipTop = Math.max(12, spotTop + spotHeight / 2 - 100) // rough vertical centre

  return (
    <>
      {/* Top panel */}
      <div style={{ ...overlayBase, top: 0, left: 0, right: 0, height: Math.max(0, spotTop) }} />
      {/* Bottom panel */}
      <div style={{ ...overlayBase, top: spotBottom, left: 0, right: 0, bottom: 0 }} />
      {/* Left panel (between top and bottom panels) */}
      <div
        style={{
          ...overlayBase,
          top: spotTop,
          left: 0,
          width: Math.max(0, spotLeft),
          height: spotHeight,
        }}
      />
      {/* Right panel (covers all of main content area) */}
      <div
        style={{
          ...overlayBase,
          top: spotTop,
          left: spotRight,
          right: 0,
          height: spotHeight,
        }}
      />

      {/* Tour card */}
      <TourCard
        currentStep={currentStep}
        totalSteps={totalSteps}
        step={currentTourStep}
        isLastStep={isLastStep}
        onNext={next}
        onSkip={skip}
        visible={visible}
        position={{ top: tooltipTop, left: tooltipLeft }}
      />
    </>
  )
}

type TourCardProps = {
  currentStep: number
  totalSteps: number
  step: (typeof TOUR_STEPS)[number]
  isLastStep: boolean
  onNext: () => void
  onSkip: () => void
  visible: boolean
  position: React.CSSProperties
}

function TourCard({ currentStep, totalSteps, step, isLastStep, onNext, onSkip, visible, position }: TourCardProps) {
  return (
    <div
      style={{
        position: "fixed",
        zIndex: 9001,
        width: 300,
        pointerEvents: "all",
        transition: "opacity 0.15s ease",
        opacity: visible ? 1 : 0,
        ...position,
      }}
      className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-2xl"
    >
      {/* Header row */}
      <div className="mb-3 flex items-center justify-between">
        <span className="text-xs font-semibold uppercase tracking-wide text-violet-600">
          Step {currentStep + 1} of {totalSteps}
        </span>
        <button
          type="button"
          onClick={onSkip}
          className="rounded-lg p-1 text-zinc-400 hover:bg-zinc-100 hover:text-zinc-600"
          aria-label="Skip tour"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>

      {/* Step dots */}
      <div className="mb-3 flex gap-1">
        {Array.from({ length: totalSteps }).map((_, i) => (
          <div
            key={i}
            className={[
              "h-1.5 rounded-full transition-all",
              i === currentStep ? "w-4 bg-violet-600" : i < currentStep ? "w-1.5 bg-violet-300" : "w-1.5 bg-zinc-200",
            ].join(" ")}
          />
        ))}
      </div>

      <h3 className="mb-1.5 text-sm font-semibold text-zinc-900">{step.title}</h3>
      <p className="mb-4 text-xs leading-relaxed text-zinc-500">{step.description}</p>

      <div className="flex items-center justify-between gap-2">
        <button
          type="button"
          onClick={onSkip}
          className="text-xs font-medium text-zinc-400 hover:text-zinc-600"
        >
          Skip tour
        </button>
        <button
          type="button"
          onClick={onNext}
          className="rounded-xl bg-violet-600 px-4 py-2 text-xs font-semibold text-white hover:bg-violet-700 active:bg-violet-800"
        >
          {isLastStep ? "Finish" : "Next →"}
        </button>
      </div>
    </div>
  )
}
