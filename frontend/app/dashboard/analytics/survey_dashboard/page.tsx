"use client";

import { useCallback, useEffect, useMemo, useState, Suspense } from "react";
import { RefreshCw } from "lucide-react";
import { LoadingBlock } from "@/components/ui/LoadingSpinner";
import { supabase } from "@/lib/supabase/client";
import { fetchAnalyticsFilters, fetchSurveysList, type AnalyticsFilterOption, type SurveyListItem } from "@/lib/api/client";
import type { FilterState, SurveyDashboardResponse } from "@/lib/dashboard/types";
import { useDashboardFilters } from "./hooks/useDashboardFilters";
import { useDashboardData, buildAPIParams } from "./hooks/useDashboardData";
import { SurveySelector } from "./components/SurveySelector";
import { DashboardFilterBar } from "./components/DashboardFilterBar";
import { EngagementSection } from "./components/EngagementSection";
import { ExpandedChartModal } from "./components/ExpandedChartModal";
import { QuestionRow } from "./components/QuestionRow";
import { OldQuestionsAccordion } from "./components/OldQuestionsAccordion";
import type { ExpandChartContext } from "@/lib/dashboard/types";

const REFRESH_COOLDOWN_SECONDS = 60;
const REGENERATE_COOLDOWN_SECONDS = 30;

async function getToken(): Promise<string | null> {
  const { data } = await supabase.auth.getSession();
  return data.session?.access_token ?? null;
}

function useRefreshCooldown(lastFetched: number | null, cooldownSeconds = REFRESH_COOLDOWN_SECONDS): number {
  const [secondsLeft, setSecondsLeft] = useState(0);

  useEffect(() => {
    if (!lastFetched) {
      setSecondsLeft(0);
      return;
    }
    const compute = () =>
      Math.max(0, cooldownSeconds - Math.floor((Date.now() - lastFetched) / 1000));

    setSecondsLeft(compute());

    const interval = setInterval(() => {
      const remaining = compute();
      setSecondsLeft(remaining);
      if (remaining === 0) clearInterval(interval);
    }, 1000);

    return () => clearInterval(interval);
  }, [lastFetched, cooldownSeconds]);

  return secondsLeft;
}

function SurveyDashboardInner() {
  const { filters, resolvedDates, updateFilters } = useDashboardFilters();

  const [surveys, setSurveys] = useState<SurveyListItem[]>([]);
  const [locations, setLocations] = useState<AnalyticsFilterOption[]>([]);
  const [qrCodes, setQrCodes] = useState<AnalyticsFilterOption[]>([]);
  const [metaLoading, setMetaLoading] = useState(true);

  const [generated, setGenerated] = useState<string | null>(filters.surveyId);
  const [appliedFilters, setAppliedFilters] = useState<FilterState>(filters);
  const [appliedDates, setAppliedDates] = useState<{ dateStart: Date; dateEnd: Date }>(resolvedDates);
  const [lastGenerated, setLastGenerated] = useState<number | null>(null);
  const [expandedChart, setExpandedChart] = useState<{ context: ExpandChartContext; title: string } | null>(null);

  useEffect(() => {
    let mounted = true;
    setMetaLoading(true);
    getToken().then(async (token) => {
      if (!token || !mounted) return;
      try {
        const [surveyList, filterOpts] = await Promise.all([
          fetchSurveysList(token),
          fetchAnalyticsFilters(token),
        ]);
        if (!mounted) return;
        setSurveys(surveyList);
        setLocations(filterOpts.locations);
        setQrCodes(filterOpts.qr_codes);
      } catch {
        // Non-critical
      } finally {
        if (mounted) setMetaLoading(false);
      }
    });
    return () => { mounted = false; };
  }, []);

  const handleGenerate = useCallback(() => {
    if (!filters.surveyId) return;
    setGenerated(filters.surveyId);
    setAppliedFilters(filters);
    setAppliedDates(resolvedDates);
    setLastGenerated(Date.now());
  }, [filters, resolvedDates]);

  const handleExpandChart = useCallback((context: ExpandChartContext, title: string) => {
    setExpandedChart({ context, title });
  }, []);

  const { data, isLoading, error, lastFetched, refetch } = useDashboardData(
    generated,
    appliedFilters,
    appliedDates
  );

  const filtersAreDirty = useMemo(() => {
    if (!data) return false;
    return (
      filters.surveyId !== appliedFilters.surveyId ||
      filters.locationIds.join(",") !== appliedFilters.locationIds.join(",") ||
      filters.qrCodeIds.join(",") !== appliedFilters.qrCodeIds.join(",") ||
      resolvedDates.dateStart.toISOString() !== appliedDates.dateStart.toISOString() ||
      resolvedDates.dateEnd.toISOString() !== appliedDates.dateEnd.toISOString()
    );
  }, [data, filters, appliedFilters, resolvedDates, appliedDates]);

  const secondsLeft = useRefreshCooldown(lastFetched);
  const regenerateSecondsLeft = useRefreshCooldown(lastGenerated, REGENERATE_COOLDOWN_SECONDS);

  return (
    <div className="flex flex-col gap-6 p-6">
      {/* Page header */}
      <div>
        <h1 className="text-2xl font-semibold text-zinc-900">Survey Dashboard</h1>
        <p className="mt-1 text-sm text-zinc-500">
          Select a survey and generate aggregated response analytics per question.
        </p>
      </div>

      {/* Survey selector */}
      <SurveySelector
        surveys={surveys}
        selectedSurveyId={filters.surveyId}
        onSelect={(id) => updateFilters({ surveyId: id })}
        onGenerate={handleGenerate}
        isLoading={metaLoading || isLoading}
      />

      {/* Filter bar */}
      {filters.surveyId && (
        <>
          <DashboardFilterBar
            locations={locations}
            qrCodes={qrCodes}
            filters={filters}
            onFilterChange={updateFilters}
          />
          {filtersAreDirty && (
            <div className="flex items-center justify-between rounded-lg border border-amber-200 bg-amber-50 px-4 py-2.5">
              <p className="text-sm text-amber-700">
                Filters have changed. Regenerate to update the dashboard.
                {regenerateSecondsLeft > 0 && (
                  <span className="ml-2 text-amber-500">Next regenerate available in {regenerateSecondsLeft}s</span>
                )}
              </p>
              <button
                type="button"
                onClick={handleGenerate}
                disabled={isLoading || regenerateSecondsLeft > 0}
                className="shrink-0 rounded-lg bg-amber-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-amber-700 disabled:cursor-not-allowed disabled:opacity-50 transition-colors"
              >
                {isLoading ? "Generating…" : "Regenerate Dashboard"}
              </button>
            </div>
          )}
        </>
      )}

      {/* Loading state */}
      {isLoading && (
        <LoadingBlock message="Generating dashboard…" className="py-12" />
      )}

      {/* Error state */}
      {!isLoading && error && (
        <div className="rounded-xl border border-red-200 bg-red-50 px-5 py-4 text-sm text-red-700">
          {error}
        </div>
      )}

      {/* Empty state — no scans and no questions */}
      {!isLoading && !error && data && data.questions.length === 0 && (data.engagement?.total_scans ?? 0) === 0 && (
        <div className="rounded-xl border border-zinc-200 bg-zinc-50 px-6 py-12 text-center">
          <p className="text-sm font-medium text-zinc-600">No submissions found</p>
          <p className="mt-1 text-xs text-zinc-400">
            This survey has no responses in the selected date range. Try expanding the time period or clearing location/QR code filters.
          </p>
        </div>
      )}

      {/* Dashboard content */}
      {!isLoading && !error && data && (data.questions.length > 0 || (data.engagement?.total_scans ?? 0) > 0) && (
        <>
          <DashboardMeta
            data={data}
            secondsLeft={secondsLeft}
            isRefreshing={isLoading}
            onRefresh={refetch}
          />

          {/* Engagement section */}
          {data.engagement && (
            <EngagementSection
              engagement={data.engagement}
              onExpandScanCompletion={() =>
                handleExpandChart({ kind: "engagement", subChart: "scan_completion" }, "Scans vs Completions")
              }
            />
          )}

          {data.questions.length > 0 && (
            <div className="flex flex-col gap-8">
              {data.questions.map((q) => (
                <QuestionRow
                  key={q.stable_question_id}
                  question={q}
                  onExpand={handleExpandChart}
                />
              ))}
            </div>
          )}

          <OldQuestionsAccordion
            surveyId={data.survey_id}
            filters={appliedFilters}
            resolvedDates={appliedDates}
          />
        </>
      )}

      {/* Expanded chart modal */}
      {expandedChart && generated && (
        <ExpandedChartModal
          surveyId={generated}
          context={expandedChart.context}
          title={expandedChart.title}
          filters={buildAPIParams(appliedFilters, appliedDates)}
          availableLocations={locations}
          availableQrCodes={qrCodes}
          onClose={() => setExpandedChart(null)}
        />
      )}

      {/* Initial empty state */}
      {!generated && !isLoading && (
        <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-zinc-300 py-16 text-center">
          <p className="text-sm font-medium text-zinc-500">
            Select a survey above and click Generate Dashboard to view analytics.
          </p>
        </div>
      )}
    </div>
  );
}

function DashboardMeta({
  data,
  secondsLeft,
  isRefreshing,
  onRefresh,
}: {
  data: SurveyDashboardResponse;
  secondsLeft: number;
  isRefreshing: boolean;
  onRefresh: () => void;
}) {
  const start = new Date(data.date_start).toLocaleDateString(undefined, {
    month: "short", day: "numeric", year: "numeric",
  });
  const end = new Date(data.date_end).toLocaleDateString(undefined, {
    month: "short", day: "numeric", year: "numeric",
  });

  const canRefresh = secondsLeft === 0 && !isRefreshing;

  return (
    <div className="flex items-center justify-between">
      <div>
        <h2 className="text-lg font-semibold text-zinc-800">{data.survey_name}</h2>
        <span className="text-xs text-zinc-500">{start} – {end}</span>
      </div>

      <div className="flex items-center gap-3">
        {secondsLeft > 0 && (
          <span className="text-xs text-zinc-400">
            Next refresh in {secondsLeft}s
          </span>
        )}
        <button
          type="button"
          onClick={onRefresh}
          disabled={!canRefresh}
          className={[
            "flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition-colors",
            canRefresh
              ? "bg-violet-600 text-white hover:bg-violet-700"
              : "cursor-not-allowed bg-zinc-100 text-zinc-400",
          ].join(" ")}
        >
          <RefreshCw className={`h-3.5 w-3.5 ${isRefreshing ? "animate-spin" : ""}`} />
          {isRefreshing ? "Refreshing…" : "Refresh"}
        </button>
      </div>
    </div>
  );
}

export default function SurveyDashboardPage() {
  return (
    <Suspense fallback={<LoadingBlock message="Loading…" className="py-24" />}>
      <SurveyDashboardInner />
    </Suspense>
  );
}
