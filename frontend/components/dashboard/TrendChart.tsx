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
  const data = {
    labels: points.map((p) => p.label),
    datasets: [
      {
        label: title,
        data: points.map((p) => p.value),
        borderColor: "#7C3AED",
        backgroundColor: "rgba(124, 58, 237, 0.12)",
        tension: 0.4,
        fill: true,
        pointRadius: 3,
      },
    ],
  }

  return (
    <Card className="flex flex-col gap-3">
      <div className="text-sm font-semibold text-zinc-900">{title}</div>
      <div className="h-40">
        <Line
          data={data}
          options={{
            responsive: true,
            maintainAspectRatio: false,
            plugins: { legend: { display: false } },
            scales: {
              x: { grid: { display: false } },
              y: { grid: { color: "#f4f4f5" } },
            },
            onClick: (_evt, elements) => {
              if (!onPointClick || elements.length === 0) return
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

