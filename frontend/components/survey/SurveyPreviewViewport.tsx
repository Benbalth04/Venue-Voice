"use client"

import { useState } from "react"
import { Monitor, Smartphone } from "lucide-react"
import type { Survey } from "@/lib/survey/types"
import { SurveyPreview } from "@/components/survey/SurveyPreview"

export type SurveyPreviewViewportMode = "mobile" | "desktop"

export function SurveyPreviewViewport({
  survey,
  className,
  defaultMode = "desktop",
}: {
  survey: Survey
  className?: string
  defaultMode?: SurveyPreviewViewportMode
}) {
  const [viewport, setViewport] = useState<SurveyPreviewViewportMode>(defaultMode)

  return (
    <div className={`flex min-h-0 min-w-0 flex-1 flex-col ${className ?? ""}`}>
      <div className="flex shrink-0 flex-wrap items-center justify-center gap-2 border-b border-zinc-200 bg-white px-3 py-2">
        <span className="text-xs font-medium text-zinc-500">Preview as</span>
        <div className="inline-flex rounded-lg border border-zinc-200 bg-zinc-50 p-0.5">
          <button
            type="button"
            onClick={() => setViewport("mobile")}
            className={[
              "inline-flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs font-semibold transition-colors",
              viewport === "mobile"
                ? "bg-white text-zinc-900 shadow-sm"
                : "text-zinc-500 hover:text-zinc-700",
            ].join(" ")}
            aria-pressed={viewport === "mobile"}
          >
            <Smartphone className="h-3.5 w-3.5" aria-hidden />
            Mobile
          </button>
          <button
            type="button"
            onClick={() => setViewport("desktop")}
            className={[
              "inline-flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs font-semibold transition-colors",
              viewport === "desktop"
                ? "bg-white text-zinc-900 shadow-sm"
                : "text-zinc-500 hover:text-zinc-700",
            ].join(" ")}
            aria-pressed={viewport === "desktop"}
          >
            <Monitor className="h-3.5 w-3.5" aria-hidden />
            Desktop
          </button>
        </div>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto bg-zinc-200/70 p-4 md:p-6">
        <div
          className={[
            "mx-auto transition-[max-width] duration-200",
            viewport === "mobile"
              ? "w-full max-w-[390px] overflow-hidden rounded-[2rem] border-[10px] border-zinc-900 bg-zinc-900 shadow-2xl"
              : "w-full max-w-4xl overflow-hidden rounded-2xl border border-zinc-200 bg-white shadow-lg",
          ].join(" ")}
        >
          <div
            className={[
              "overflow-y-auto bg-white",
              viewport === "mobile"
                ? "max-h-[min(72vh,760px)] rounded-[1.35rem]"
                : "min-h-[min(50vh,480px)] max-h-[min(78vh,900px)]",
            ].join(" ")}
          >
            <SurveyPreview survey={survey} />
          </div>
        </div>
      </div>
    </div>
  )
}
