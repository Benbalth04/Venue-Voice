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
import ChartDataLabels from "chartjs-plugin-datalabels";
import type { LineChartProps } from "@/lib/dashboard/transformers";

ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Filler,
  Tooltip,
  Legend,
  ChartDataLabels
);

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmtTick(value: number | string): string {
  const n = Number(value);
  if (n >= 10000) return Math.round(n / 1000) + "k";
  if (n >= 1000) return (n / 1000).toFixed(1).replace(/\.0$/, "") + "k";
  if (n % 1 !== 0) return n.toFixed(1);
  return String(n);
}

// ── Chart defaults ────────────────────────────────────────────────────────────

const DEFAULT_OPTIONS: ChartOptions<"line"> = {
  responsive: true,
  maintainAspectRatio: false,
  layout: { padding: { top: 20 } },
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
    // Data labels are intentionally off for line charts — time-series are too
    // dense and the labels clutter the chart more than they help.
    datalabels: { display: false },
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
      ticks: {
        display: true,
        color: "#d4d4d8",
        font: { size: 10 },
        maxTicksLimit: 5,
        callback: (v) => fmtTick(v),
      },
      beginAtZero: true,
    },
  },
  elements: {
    point: { radius: 0, hoverRadius: 4 },
    line: { borderWidth: 2 },
  },
};

// ── Component ─────────────────────────────────────────────────────────────────

interface Props extends LineChartProps {
  options?: ChartOptions<"line">;
  showLegend?: boolean;
  height?: number;
  /** Rotate x-axis tick labels 45° — useful in wider expanded chart modals. */
  xLabelAngled?: boolean;
}

export function LineChart({
  labels,
  datasets,
  options,
  showLegend = false,
  height = 260,
  xLabelAngled,
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
  if (xLabelAngled) {
    const baseX = (merged.scales?.["x"] ?? {}) as Record<string, unknown>;
    const baseTicks = (baseX["ticks"] ?? {}) as Record<string, unknown>;
    merged.scales = {
      ...merged.scales,
      x: { ...baseX, ticks: { ...baseTicks, maxRotation: 45, minRotation: 45 } },
    } as ChartOptions<"line">["scales"];
  }
  return (
    <div style={{ height }}>
      <Line data={data} options={merged} />
    </div>
  );
}
