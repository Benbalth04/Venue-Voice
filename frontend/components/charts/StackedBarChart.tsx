"use client";

import { Bar } from "react-chartjs-2";
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  BarElement,
  Tooltip,
  Legend,
  type ChartOptions,
} from "chart.js";
import type { StackedBarChartProps } from "@/lib/dashboard/transformers";

ChartJS.register(CategoryScale, LinearScale, BarElement, Tooltip, Legend);

const DEFAULT_OPTIONS: ChartOptions<"bar"> = {
  responsive: true,
  maintainAspectRatio: false,
  plugins: {
    legend: {
      position: "bottom",
      labels: { color: "#71717a", font: { size: 11 }, padding: 12, boxWidth: 12 },
    },
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
      stacked: true,
      border: { display: false },
      grid: { display: false },
      ticks: { color: "#a1a1aa", font: { size: 11 }, maxTicksLimit: 6 },
    },
    y: {
      stacked: true,
      border: { display: false },
      grid: { color: "#f4f4f5" },
      ticks: { display: false },
      beginAtZero: true,
      max: 100,
    },
  },
  elements: {
    bar: { borderRadius: 4 },
  },
};

interface Props extends StackedBarChartProps {
  options?: ChartOptions<"bar">;
  height?: number;
}

export function StackedBarChart({ labels, datasets, options, height = 260 }: Props) {
  const data = { labels, datasets };
  const merged = { ...DEFAULT_OPTIONS, ...options } as ChartOptions<"bar">;
  return (
    <div style={{ height }}>
      <Bar data={data} options={merged} />
    </div>
  );
}
