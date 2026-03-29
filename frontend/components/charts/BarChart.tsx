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
import type { BarChartProps } from "@/lib/dashboard/transformers";

ChartJS.register(CategoryScale, LinearScale, BarElement, Tooltip, Legend);

const DEFAULT_OPTIONS: ChartOptions<"bar"> = {
  responsive: true,
  maintainAspectRatio: false,
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
      ticks: { color: "#a1a1aa", font: { size: 11 }, maxTicksLimit: 8 },
    },
    y: {
      border: { display: false },
      grid: { color: "#f4f4f5" },
      ticks: { display: false },
      beginAtZero: true,
    },
  },
  elements: {
    bar: { borderRadius: 6, borderSkipped: false },
  },
};

interface Props extends BarChartProps {
  options?: ChartOptions<"bar">;
  height?: number;
}

export function BarChart({ labels, datasets, options, height = 260 }: Props) {
  const data = { labels, datasets };
  const merged = { ...DEFAULT_OPTIONS, ...options } as ChartOptions<"bar">;
  return (
    <div style={{ height }}>
      <Bar data={data} options={merged} />
    </div>
  );
}
