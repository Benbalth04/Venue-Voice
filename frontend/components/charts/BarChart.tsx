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
import ChartDataLabels from "chartjs-plugin-datalabels";
import type { BarChartProps } from "@/lib/dashboard/transformers";

ChartJS.register(CategoryScale, LinearScale, BarElement, Tooltip, Legend, ChartDataLabels);

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Resolve bar colour from a scalar or per-bar array. */
function resolveBarColor(
  bg: unknown,
  index: number,
  fallback = "#a1a1aa"
): string {
  if (Array.isArray(bg)) {
    const c = bg[index];
    return typeof c === "string" ? c : fallback;
  }
  return typeof bg === "string" ? bg : fallback;
}

/** Format y-axis ticks: 1234 → "1.2k", 75.3 → "75.3", 5 → "5". */
function fmtTick(value: number | string): string {
  const n = Number(value);
  if (n >= 10000) return Math.round(n / 1000) + "k";
  if (n >= 1000) return (n / 1000).toFixed(1).replace(/\.0$/, "") + "k";
  if (n % 1 !== 0) return n.toFixed(1);
  return String(n);
}

/** Format data label values. */
function fmtLabel(value: unknown): string | null {
  if (typeof value !== "number") return null;
  if (value <= 0) return null;
  return fmtTick(value);
}

// ── Chart defaults ────────────────────────────────────────────────────────────

const DEFAULT_OPTIONS: ChartOptions<"bar"> = {
  responsive: true,
  maintainAspectRatio: false,
  layout: { padding: { top: 22 } }, // room for above-bar labels
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
    datalabels: {
      anchor: "end",
      align: "top",
      // Colour matches the bar's own backgroundColor
      color: (ctx) =>
        resolveBarColor(ctx.dataset.backgroundColor, ctx.dataIndex),
      font: { size: 11, weight: "bold" },
      formatter: fmtLabel,
      // Hide zero values and non-numbers
      display: (ctx) => {
        const v = ctx.dataset.data[ctx.dataIndex];
        return typeof v === "number" && v > 0;
      },
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
    bar: { borderRadius: 6, borderSkipped: false },
  },
};

// ── Component ─────────────────────────────────────────────────────────────────

interface Props extends BarChartProps {
  options?: ChartOptions<"bar">;
  height?: number;
  /** Rotate x-axis tick labels 45° — useful in wider expanded chart modals. */
  xLabelAngled?: boolean;
  /** Show a bottom legend (default false, matching dashboard cards). */
  showLegend?: boolean;
}

export function BarChart({ labels, datasets, options, height = 260, xLabelAngled, showLegend }: Props) {
  const data = { labels, datasets };
  const merged = { ...DEFAULT_OPTIONS, ...options } as ChartOptions<"bar">;
  if (showLegend) {
    merged.plugins = {
      ...merged.plugins,
      legend: {
        display: true,
        position: "bottom",
        labels: { color: "#71717a", font: { size: 11 }, padding: 12, boxWidth: 12 },
      },
    };
  }
  if (xLabelAngled) {
    const baseX = (merged.scales?.["x"] ?? {}) as Record<string, unknown>;
    const baseTicks = (baseX["ticks"] ?? {}) as Record<string, unknown>;
    merged.scales = {
      ...merged.scales,
      x: { ...baseX, ticks: { ...baseTicks, maxRotation: 45, minRotation: 45 } },
    } as ChartOptions<"bar">["scales"];
  }
  return (
    <div style={{ height }}>
      <Bar data={data} options={merged} />
    </div>
  );
}
