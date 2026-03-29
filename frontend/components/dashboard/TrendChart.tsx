"use client"

import { LineChart } from "@/components/charts/LineChart"
import { CHART_COLORS } from "@/lib/dashboard/transformers"
import { Card } from "@/components/ui/card"

export type TrendPoint = { label: string; value: number }

export function TrendChart({
  title,
  points,
}: {
  title: string
  points: TrendPoint[]
}) {
  const hasData = points.length > 0

  const labels = hasData ? points.map((p) => p.label) : [""]
  const datasets = [
    {
      label: title,
      data: hasData ? points.map((p) => p.value) : [0],
      borderColor: CHART_COLORS.primary,
      backgroundColor: CHART_COLORS.primaryFill,
      tension: 0.4,
      fill: true,
    },
  ]

  return (
    <Card className="relative flex flex-col gap-3 overflow-hidden">
      <div className="text-sm font-semibold text-zinc-900">{title}</div>
      <div className="relative">
        {!hasData && (
          <div className="absolute inset-0 z-10 flex items-center justify-center bg-white/80 backdrop-blur-sm">
            <p className="text-sm font-medium text-zinc-500">No data available</p>
          </div>
        )}
        <LineChart labels={labels} datasets={datasets} height={280} />
      </div>
    </Card>
  )
}
