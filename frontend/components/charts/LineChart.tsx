"use client";

import { Line } from "react-chartjs-2";
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Filler,
  Tooltip,
  Legend,
  type ChartOptions,
} from "chart.js";
import type { LineChartProps } from "@/lib/dashboard/transformers";

ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Filler,
  Tooltip,
  Legend
);

const DEFAULT_OPTIONS: ChartOptions<"line"> = {
  responsive: true,
  maintainAspectRatio: false,
  interaction: { mode: "index", intersect: false },
  plugins: {
    legend: { display: false },
    tooltip: {
      backgroundColor: "#18181b",
      titleColor: "#fff",
      bodyColor: "#d4d4d8",
      borderColor: "#3f3f46",
      borderWidth: 1,
      padding: 10,
      cornerRadius: 8,
    },
  },
  scales: {
    x: {
      border: { display: false },
      grid: { display: false },
      ticks: { color: "#a1a1aa", font: { size: 11 }, maxTicksLimit: 6 },
    },
    y: {
      border: { display: false },
      grid: { color: "#f4f4f5" },
      ticks: { display: false },
      beginAtZero: true,
    },
  },
  elements: {
    point: { radius: 0, hoverRadius: 4 },
    line: { borderWidth: 2 },
  },
};

interface Props extends LineChartProps {
  options?: ChartOptions<"line">;
  showLegend?: boolean;
  height?: number;
}

export function LineChart({
  labels,
  datasets,
  options,
  showLegend = false,
  height = 260,
}: Props) {
  const data = { labels, datasets };
  const merged: ChartOptions<"line"> = {
    ...DEFAULT_OPTIONS,
    ...options,
    plugins: {
      ...DEFAULT_OPTIONS.plugins,
      ...options?.plugins,
      legend: {
        display: showLegend,
        position: "bottom",
        labels: { color: "#71717a", font: { size: 11 }, padding: 12, boxWidth: 12 },
      },
    },
  };
  return (
    <div style={{ height }}>
      <Line data={data} options={merged} />
    </div>
  );
}
