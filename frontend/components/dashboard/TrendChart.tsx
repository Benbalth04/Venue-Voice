"use client"

import { Line } from "react-chartjs-2"
import {
  CategoryScale,
  Chart as ChartJS,
  Legend,
  LinearScale,
  LineElement,
  PointElement,
  Tooltip,
} from "chart.js"
import { Card } from "@/components/ui/card"

ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Tooltip,
  Legend,
)

export type TrendPoint = { label: string; value: number }

export function TrendChart({
  title,
  points,
  onPointClick,
}: {
  title: string
  points: TrendPoint[]
  onPointClick?: (point: TrendPoint) => void
}) {
  const hasData = points.length > 0

  const data = {
    labels: hasData ? points.map((p) => p.label) : [""],
    datasets: [
      {
        data: hasData ? points.map((p) => p.value) : [0],
        borderColor: "#7C3AED",
        borderWidth: 2,
        tension: 0.4,
        fill: true,

        // Gradient fill
        backgroundColor: (context: any) => {
          const chart = context.chart
          const { ctx, chartArea } = chart

          if (!chartArea) return null

          const gradient = ctx.createLinearGradient(
            0,
            chartArea.top,
            0,
            chartArea.bottom
          )
          gradient.addColorStop(0, "rgba(124, 58, 237, 0.25)")
          gradient.addColorStop(1, "rgba(124, 58, 237, 0.02)")

          return gradient
        },

        pointRadius: 0,
        pointHoverRadius: 4,
        pointHoverBackgroundColor: "#7C3AED",
      },
    ],
  }

  return (
    <Card className="relative flex flex-col gap-3 overflow-hidden">
      <div className="text-sm font-semibold text-zinc-900">{title}</div>
      <div className="relative h-40">
        {!hasData && (
          <div className="absolute inset-0 z-10 flex items-center justify-center bg-white/80 backdrop-blur-sm">
            <p className="text-sm font-medium text-zinc-500">No data available</p>
          </div>
        )}
        <Line
          data={data}
          options={{
            responsive: true,
            maintainAspectRatio: false,
            interaction: {
              mode: "index",
              intersect: false,
            },
            plugins: {
              legend: { display: false },
              tooltip: {
                backgroundColor: "#18181b",
                titleColor: "#fff",
                bodyColor: "#fff",
                borderColor: "#27272a",
                borderWidth: 1,
                padding: 10,
                displayColors: false,
              },
            },
            elements: {
              line: {
                capBezierPoints: true,
              },
            },
            layout: {
              padding: {
                top: 8,
                bottom: 4,
                left: 4,
                right: 8,
              },
            },
            onClick: (_evt, elements) => {
              if (!hasData || !onPointClick || elements.length === 0) return
              const idx = elements[0].index
              const point = points[idx]
              if (point) onPointClick(point)
            },
          }}
        />
      </div>
    </Card>
  )
}

