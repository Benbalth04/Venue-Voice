"use client";

import { BarChart } from "@/components/charts/BarChart";
import { LineChart } from "@/components/charts/LineChart";
import { transformEngagementTotals, transformEngagementTimeSeries } from "@/lib/dashboard/transformers";
import type { EngagementData } from "@/lib/dashboard/types";
import { ChartCard } from "./ChartCard";

interface Props {
  engagement: EngagementData;
  onExpandScanCompletion?: () => void;
}

export function EngagementSection({ engagement, onExpandScanCompletion }: Props) {
  const totalsProps = transformEngagementTotals(engagement);
  const timeSeriesProps = transformEngagementTimeSeries(engagement);

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-3">
        <span className="font-medium text-zinc-900 text-sm">Survey Engagement</span>
        <span className="text-xs text-zinc-500">
          {engagement.total_scans} scans · {engagement.total_completions} completions
        </span>
      </div>

      <div
        className="grid gap-4"
        style={{ gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))" }}
      >
        <ChartCard
          title="Scans vs Completions"
          isEmpty={engagement.total_scans === 0}
          onExpand={onExpandScanCompletion}
        >
          <BarChart {...totalsProps} />
        </ChartCard>

        <ChartCard
          title="Completion Rate Over Time"
          isEmpty={engagement.daily_completion_rate.length === 0}
        >
          <LineChart {...timeSeriesProps} />
        </ChartCard>
      </div>
    </div>
  );
}
