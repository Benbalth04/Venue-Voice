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
import type { PieChartProps } from "@/lib/dashboard/transformers";

ChartJS.register(ArcElement, Tooltip, Legend, DoughnutController);

const DEFAULT_OPTIONS: ChartOptions<"doughnut"> = {
  responsive: true,
  maintainAspectRatio: false,
  cutout: "65%",
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
  },
};

const DEFAULT_COLORS = [
  "#7c3aed", "#a78bfa", "#c4b5fd", "#6d28d9",
  "#8b5cf6", "#4c1d95", "#ddd6fe", "#ede9fe",
];

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
