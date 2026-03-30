"use client";

import { Doughnut } from "react-chartjs-2";
import {
  Chart as ChartJS,
  ArcElement,
  Tooltip,
  Legend,
  DoughnutController,
  type ChartOptions,
} from "chart.js";
import ChartDataLabels from "chartjs-plugin-datalabels";
import type { PieChartProps } from "@/lib/dashboard/transformers";

ChartJS.register(ArcElement, Tooltip, Legend, DoughnutController, ChartDataLabels);

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Return the colour for segment [index], falling back gracefully. */
function resolveSegmentColor(bg: unknown, index: number, fallback = "#a1a1aa"): string {
  if (Array.isArray(bg)) {
    const c = bg[index];
    return typeof c === "string" ? c : fallback;
  }
  return typeof bg === "string" ? bg : fallback;
}

// ── Chart defaults ────────────────────────────────────────────────────────────

const DEFAULT_OPTIONS: ChartOptions<"doughnut"> = {
  responsive: true,
  maintainAspectRatio: false,
  cutout: "65%",
  layout: { padding: 20 }, // breathing room for outside labels
  plugins: {
    legend: {
      position: "bottom",
      labels: { color: "#71717a", font: { size: 11 }, padding: 16, boxWidth: 12 },
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
    datalabels: {
      // Label positioned just outside the arc
      anchor: "end",
      align: "end",
      // Colour matches the segment colour
      color: (ctx) =>
        resolveSegmentColor(ctx.dataset.backgroundColor, ctx.dataIndex),
      font: { size: 11, weight: "bold" },
      formatter: (value, ctx) => {
        const dataset = ctx.dataset.data as number[];
        const total = dataset.reduce((a, b) => (typeof b === "number" ? a + b : a), 0);
        if (!total || typeof value !== "number" || value === 0) return null;
        return Math.round((value / total) * 100) + "%";
      },
      // Hide zero-value segments
      display: (ctx) => {
        const v = ctx.dataset.data[ctx.dataIndex];
        return typeof v === "number" && v > 0;
      },
    },
  },
};

const DEFAULT_COLORS = [
  "#7c3aed", "#a78bfa", "#c4b5fd", "#6d28d9",
  "#8b5cf6", "#4c1d95", "#ddd6fe", "#ede9fe",
];

// ── Component ─────────────────────────────────────────────────────────────────

interface Props extends PieChartProps {
  options?: ChartOptions<"doughnut">;
  height?: number;
}

export function PieChart({ labels, data, backgroundColors, options, height = 260 }: Props) {
  const colors = backgroundColors ?? DEFAULT_COLORS.slice(0, labels.length);
  const chartData = {
    labels,
    datasets: [
      {
        data,
        backgroundColor: colors,
        borderWidth: 0,
      },
    ],
  };
  const merged = { ...DEFAULT_OPTIONS, ...options } as ChartOptions<"doughnut">;
  return (
    <div style={{ height }}>
      <Doughnut data={chartData} options={merged} />
    </div>
  );
}
