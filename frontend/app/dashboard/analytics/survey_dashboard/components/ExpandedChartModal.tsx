"use client";

import { useEffect, useRef, useState } from "react";
import { GripVertical, X, Plus } from "lucide-react";
import { supabase } from "@/lib/supabase/client";
import { BarChart } from "@/components/charts/BarChart";
import { LineChart } from "@/components/charts/LineChart";
import { PieChart } from "@/components/charts/PieChart";
import { LoadingBlock } from "@/components/ui/LoadingSpinner";
import {
  getQuestionBreakdown,
  getEngagementBreakdown,
  type SurveyDashboardAPIParams,
  type AnalyticsFilterOption,
} from "@/lib/api/client";
import {
  transformBreakdown,
  SERIES_PALETTE,
  type BreakdownChartResult,
} from "@/lib/dashboard/transformers";
import type {
  ExpandChartContext,
  QuestionBreakdownResponse,
  EngagementBreakdownResponse,
} from "@/lib/dashboard/types";

export type { ExpandChartContext };

// ── Types ─────────────────────────────────────────────────────────────────────

type BreakdownData = QuestionBreakdownResponse | EngagementBreakdownResponse;
type BreakdownBy = "location" | "qr_code";
type AnySeriesItem = { series_id: string; series_name: string };

// ── Constants ─────────────────────────────────────────────────────────────────

const MIN_W = 420;
const MIN_H = 280;
const DEFAULT_W = () => Math.min(window.innerWidth * 0.82, 1100);
const DEFAULT_H = () => Math.min(window.innerHeight * 0.82, 750);

// ── useBreakdownData hook ─────────────────────────────────────────────────────

function useBreakdownData(
  surveyId: string,
  context: ExpandChartContext,
  breakdownBy: BreakdownBy,
  filters: SurveyDashboardAPIParams
): { data: BreakdownData | null; isLoading: boolean; error: string | null } {
  const [data, setData] = useState<BreakdownData | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fetchKeyRef = useRef(0);

  const stableQuestionId =
    context.kind === "question" ? context.stableQuestionId : null;

  const filterKey = [
    filters.date_start,
    filters.date_end,
    (filters.location_ids ?? []).join(","),
    (filters.qr_code_ids ?? []).join(","),
  ].join("|");

  useEffect(() => {
    let mounted = true;
    const key = ++fetchKeyRef.current;
    setIsLoading(true);
    setError(null);
    setData(null);

    supabase.auth.getSession().then(async ({ data: sessionData }) => {
      const token = sessionData.session?.access_token ?? null;
      if (!token) {
        if (mounted && fetchKeyRef.current === key) {
          setError("Not authenticated");
          setIsLoading(false);
        }
        return;
      }
      try {
        let result: BreakdownData;
        if (context.kind === "question" && stableQuestionId) {
          result = await getQuestionBreakdown<QuestionBreakdownResponse>(
            token,
            surveyId,
            { ...filters, question_id: stableQuestionId, breakdown_by: breakdownBy }
          );
        } else {
          result = await getEngagementBreakdown<EngagementBreakdownResponse>(
            token,
            surveyId,
            { ...filters, breakdown_by: breakdownBy }
          );
        }
        if (mounted && fetchKeyRef.current === key) setData(result);
      } catch (e: unknown) {
        if (mounted && fetchKeyRef.current === key)
          setError(e instanceof Error ? e.message : "Failed to load breakdown data");
      } finally {
        if (mounted && fetchKeyRef.current === key) setIsLoading(false);
      }
    });

    return () => {
      mounted = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [surveyId, context.kind, stableQuestionId, breakdownBy, filterKey]);

  return { data, isLoading, error };
}

// ── Props ─────────────────────────────────────────────────────────────────────

interface Props {
  surveyId: string;
  context: ExpandChartContext;
  title: string;
  filters: SurveyDashboardAPIParams;
  availableLocations: AnalyticsFilterOption[];
  availableQrCodes: AnalyticsFilterOption[];
  onClose: () => void;
}

// ── ExpandedChartModal ────────────────────────────────────────────────────────

export function ExpandedChartModal({
  surveyId,
  context,
  title,
  filters,
  onClose,
}: Props) {
  // ── Position ───────────────────────────────────────────────────────────────
  const [pos, setPos] = useState<{ x: number; y: number } | null>(null);

  // ── Size ───────────────────────────────────────────────────────────────────
  const [size, setSize] = useState({ w: 0, h: 0 });

  // ── Drag ───────────────────────────────────────────────────────────────────
  const [isDragging, setIsDragging] = useState(false);
  const dragRef = useRef<{ mx: number; my: number; px: number; py: number } | null>(null);

  // ── Resize ─────────────────────────────────────────────────────────────────
  const [isResizing, setIsResizing] = useState(false);
  const resizeRef = useRef<{ mx: number; my: number; w0: number; h0: number } | null>(null);

  // ── Breakdown state ────────────────────────────────────────────────────────
  const [breakdownBy, setBreakdownBy] = useState<BreakdownBy>("location");
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [seriesColors, setSeriesColors] = useState<Record<string, string>>({});

  // ── DnD state ──────────────────────────────────────────────────────────────
  const [draggedSeriesId, setDraggedSeriesId] = useState<string | null>(null);

  // ── Data fetch ─────────────────────────────────────────────────────────────
  const { data, isLoading, error } = useBreakdownData(
    surveyId,
    context,
    breakdownBy,
    filters
  );

  // ── Centre + set default size on mount ────────────────────────────────────
  useEffect(() => {
    const w = DEFAULT_W();
    const h = DEFAULT_H();
    setSize({ w, h });
    setPos({
      x: Math.max(0, (window.innerWidth - w) / 2),
      y: Math.max(0, (window.innerHeight - h) / 2),
    });
  }, []);

  // ── Initialise selected IDs + colours after each fetch ────────────────────
  useEffect(() => {
    if (!data) return;
    const series = ("series" in data ? data.series : []) as AnySeriesItem[];
    setSelectedIds(new Set(series.map((s) => s.series_id)));
    setSeriesColors(
      Object.fromEntries(
        series.map((s, i) => [s.series_id, SERIES_PALETTE[i % SERIES_PALETTE.length]])
      )
    );
  }, [data]);

  // ── Drag window ────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!isDragging) return;
    document.body.style.cursor = "grabbing";
    document.body.style.userSelect = "none";
    const sw = size.w;
    const sh = size.h;
    const onMove = (e: MouseEvent) => {
      if (!dragRef.current) return;
      const { mx, my, px, py } = dragRef.current;
      setPos({
        x: Math.max(0, Math.min(window.innerWidth - sw, px + (e.clientX - mx))),
        y: Math.max(0, Math.min(window.innerHeight - sh, py + (e.clientY - my))),
      });
    };
    const onUp = () => {
      setIsDragging(false);
      dragRef.current = null;
    };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    return () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isDragging]);

  // ── Resize window ──────────────────────────────────────────────────────────
  useEffect(() => {
    if (!isResizing) return;
    document.body.style.cursor = "se-resize";
    document.body.style.userSelect = "none";
    const onMove = (e: MouseEvent) => {
      if (!resizeRef.current) return;
      const { mx, my, w0, h0 } = resizeRef.current;
      setSize({
        w: Math.max(MIN_W, w0 + (e.clientX - mx)),
        h: Math.max(MIN_H, h0 + (e.clientY - my)),
      });
    };
    const onUp = () => {
      setIsResizing(false);
      resizeRef.current = null;
    };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    return () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
    };
  }, [isResizing]);

  // ── Handlers ───────────────────────────────────────────────────────────────
  const handleBreakdownChange = (val: BreakdownBy) => {
    setBreakdownBy(val);
    setSelectedIds(new Set());
  };

  const addToGraph = (id: string) =>
    setSelectedIds((prev) => new Set([...prev, id]));

  const removeFromGraph = (id: string) =>
    setSelectedIds((prev) => {
      const next = new Set(prev);
      next.delete(id);
      return next;
    });

  const updateColor = (id: string, color: string) =>
    setSeriesColors((prev) => ({ ...prev, [id]: color }));

  // ── Series lists ───────────────────────────────────────────────────────────
  const seriesList = (
    data && "series" in data ? data.series : []
  ) as AnySeriesItem[];
  const inGraph = seriesList.filter((s) => selectedIds.has(s.series_id));
  const outGraph = seriesList.filter((s) => !selectedIds.has(s.series_id));

  // ── Chart ──────────────────────────────────────────────────────────────────
  const subChart = context.subChart;
  // Sentiment colours are semantic (green/grey/red) and cannot be customised.
  const colourPickerDisabled =
    context.kind === "question" && context.subChart === "sentiment_bar";
  const chartResult: BreakdownChartResult =
    data && selectedIds.size > 0
      ? transformBreakdown(data, selectedIds, subChart, seriesColors)
      : null;

  const chartBodyH = Math.max(240, size.h - 100);

  function renderChart(result: BreakdownChartResult) {
    if (!result) {
      return (
        <div className="flex h-full items-center justify-center">
          <p className="text-sm text-zinc-400">No data for selected series</p>
        </div>
      );
    }
    if (result.chartType === "bar") {
      return <BarChart {...result.props} height={chartBodyH} xLabelAngled showLegend />;
    }
    if (result.chartType === "line") {
      return <LineChart {...result.props} showLegend height={chartBodyH} xLabelAngled />;
    }
    if (result.chartType === "stacked") {
      return (
        <LineChart
          labels={result.props.labels}
          datasets={result.props.datasets.map((d) => ({
            label: d.label,
            data: d.data,
            borderColor: d.backgroundColor,
            tension: 0.3,
            fill: false,
          }))}
          showLegend
          height={chartBodyH}
          xLabelAngled
        />
      );
    }
    if (result.chartType === "pies") {
      return (
        <div
          className="grid gap-4 overflow-auto"
          style={{ gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))" }}
        >
          {result.propsList.map((p, i) => (
            <div key={i} className="flex flex-col items-center gap-1">
              <p className="text-xs font-medium text-zinc-600">
                {inGraph[i]?.series_name}
              </p>
              <PieChart {...p} />
            </div>
          ))}
        </div>
      );
    }
    return null;
  }

  // ── Guard: not yet positioned ──────────────────────────────────────────────
  if (!pos || size.w === 0) return null;

  return (
    <div className="fixed inset-0 z-50 pointer-events-none">
      <div
        className="pointer-events-auto absolute flex flex-col rounded-xl border border-zinc-200 bg-white shadow-2xl overflow-hidden"
        style={{ left: pos.x, top: pos.y, width: size.w, height: size.h }}
      >
        {/* ── Title bar / drag handle ──────────────────────────────────────── */}
        <div className="flex shrink-0 items-center justify-between gap-3 border-b border-zinc-100 px-4 py-3 bg-white select-none">
          {/* Left: grip + title — this is the drag zone */}
          <div
            className="flex items-center gap-2 min-w-0 flex-1"
            style={{ cursor: isDragging ? "grabbing" : "grab" }}
            onMouseDown={(e) => {
              e.preventDefault();
              if (!pos) return;
              dragRef.current = {
                mx: e.clientX,
                my: e.clientY,
                px: pos.x,
                py: pos.y,
              };
              setIsDragging(true);
            }}
          >
            <GripVertical className="h-4 w-4 shrink-0 text-zinc-300" />
            <span className="text-sm font-semibold text-zinc-800 truncate">
              {title}
            </span>
          </div>

          {/* Right: controls (NOT part of drag zone) */}
          <div className="flex items-center gap-2 shrink-0">
            {/* Compare-by toggle */}
            <div className="flex rounded-lg border border-zinc-200 bg-zinc-50 p-0.5 text-xs font-medium">
              {(["location", "qr_code"] as const).map((val) => (
                <button
                  key={val}
                  type="button"
                  onClick={() => handleBreakdownChange(val)}
                  className={[
                    "rounded-md px-2.5 py-1 transition-colors",
                    breakdownBy === val
                      ? "bg-white text-violet-700 shadow-sm"
                      : "text-zinc-500 hover:text-zinc-700",
                  ].join(" ")}
                >
                  {val === "location" ? "Location" : "QR Code"}
                </button>
              ))}
            </div>

            <button
              type="button"
              onClick={onClose}
              aria-label="Close"
              className="rounded p-1 text-zinc-400 hover:bg-zinc-100 hover:text-zinc-700 transition-colors"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>

        {/* ── Body ─────────────────────────────────────────────────────────── */}
        <div className="flex flex-1 overflow-hidden">
          {/* Chart area */}
          <div className="flex-1 overflow-auto p-4">
            {isLoading && (
              <LoadingBlock message="Loading breakdown…" className="py-8" />
            )}
            {!isLoading && error && (
              <p className="text-sm text-red-500">{error}</p>
            )}
            {!isLoading && !error && data && renderChart(chartResult)}
            {!isLoading && !error && !data && (
              <div className="flex h-full items-center justify-center">
                <p className="text-sm text-zinc-400">No data available</p>
              </div>
            )}
          </div>

          {/* ── Sidebar ──────────────────────────────────────────────────── */}
          {!isLoading && !error && seriesList.length > 0 && (
            <div className="w-56 shrink-0 overflow-y-auto border-l border-zinc-100 p-3 flex flex-col gap-4">
              {/* IN GRAPH section */}
              <div
                onDragOver={(e) => e.preventDefault()}
                onDrop={(e) => {
                  e.preventDefault();
                  if (draggedSeriesId && !selectedIds.has(draggedSeriesId)) {
                    addToGraph(draggedSeriesId);
                  }
                  setDraggedSeriesId(null);
                }}
              >
                <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-zinc-500">
                  In Graph{inGraph.length > 0 ? ` (${inGraph.length})` : ""}
                </p>
                <div className="flex flex-col gap-1">
                  {inGraph.map((s) => (
                    <div
                      key={s.series_id}
                      draggable
                      onDragStart={() => setDraggedSeriesId(s.series_id)}
                      onDragEnd={() => setDraggedSeriesId(null)}
                      className={[
                        "flex items-center gap-1.5 rounded-md border border-zinc-200 bg-zinc-50 px-1.5 py-1 cursor-grab transition-opacity",
                        draggedSeriesId === s.series_id ? "opacity-40" : "",
                      ].join(" ")}
                    >
                      <GripVertical className="h-3 w-3 shrink-0 text-zinc-300" />

                      {/* Colour picker swatch — hidden when colours are semantic */}
                      {!colourPickerDisabled && (
                        <label
                          className="h-3.5 w-3.5 shrink-0 rounded cursor-pointer border border-zinc-300 overflow-hidden"
                          title="Change colour"
                        >
                          <span
                            className="block h-full w-full"
                            style={{ backgroundColor: seriesColors[s.series_id] ?? "#7c3aed" }}
                          />
                          <input
                            type="color"
                            value={seriesColors[s.series_id] ?? "#7c3aed"}
                            onChange={(e) => updateColor(s.series_id, e.target.value)}
                            className="sr-only"
                          />
                        </label>
                      )}

                      <span className="flex-1 truncate text-xs text-zinc-700 leading-tight">
                        {s.series_name}
                      </span>

                      {/* Remove button */}
                      <button
                        type="button"
                        onClick={() => removeFromGraph(s.series_id)}
                        aria-label="Remove from graph"
                        className="shrink-0 text-zinc-300 hover:text-zinc-600 transition-colors"
                      >
                        <X className="h-3 w-3" />
                      </button>
                    </div>
                  ))}
                  {inGraph.length === 0 && (
                    <p className="px-1 text-xs italic text-zinc-400">
                      Drag series here to add
                    </p>
                  )}
                </div>
              </div>

              {/* NOT IN GRAPH section */}
              {outGraph.length > 0 && (
                <div
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={(e) => {
                    e.preventDefault();
                    if (draggedSeriesId && selectedIds.has(draggedSeriesId)) {
                      removeFromGraph(draggedSeriesId);
                    }
                    setDraggedSeriesId(null);
                  }}
                >
                  <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-zinc-400">
                    Not in Graph ({outGraph.length})
                  </p>
                  <div className="flex flex-col gap-1">
                    {outGraph.map((s) => (
                      <div
                        key={s.series_id}
                        draggable
                        onDragStart={() => setDraggedSeriesId(s.series_id)}
                        onDragEnd={() => setDraggedSeriesId(null)}
                        className={[
                          "flex items-center gap-1.5 rounded-md border border-dashed border-zinc-200 px-1.5 py-1 cursor-grab transition-opacity",
                          draggedSeriesId === s.series_id ? "opacity-40" : "",
                        ].join(" ")}
                      >
                        <GripVertical className="h-3 w-3 shrink-0 text-zinc-200" />
                        <span className="h-3.5 w-3.5 shrink-0 rounded border border-dashed border-zinc-200" />
                        <span className="flex-1 truncate text-xs text-zinc-400 leading-tight">
                          {s.series_name}
                        </span>
                        {/* Add button */}
                        <button
                          type="button"
                          onClick={() => addToGraph(s.series_id)}
                          aria-label="Add to graph"
                          className="shrink-0 text-zinc-300 hover:text-violet-600 transition-colors"
                        >
                          <Plus className="h-3 w-3" />
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* ── Resize handle (bottom-right corner) ──────────────────────────── */}
        <div
          className="absolute bottom-0 right-0 h-5 w-5 cursor-se-resize"
          title="Drag to resize"
          onMouseDown={(e) => {
            e.preventDefault();
            e.stopPropagation();
            resizeRef.current = {
              mx: e.clientX,
              my: e.clientY,
              w0: size.w,
              h0: size.h,
            };
            setIsResizing(true);
          }}
        >
          {/* Visual indicator: three diagonal lines */}
          <svg
            width="12"
            height="12"
            viewBox="0 0 12 12"
            className="absolute bottom-1 right-1 text-zinc-300"
            fill="none"
          >
            <line x1="12" y1="4" x2="4" y2="12" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
            <line x1="12" y1="8" x2="8" y2="12" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
          </svg>
        </div>
      </div>
    </div>
  );
}
