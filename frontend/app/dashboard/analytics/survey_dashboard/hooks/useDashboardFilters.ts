"use client";

import { useCallback, useMemo } from "react";
import { useRouter, usePathname, useSearchParams } from "next/navigation";
import type { FilterState, TimePreset } from "@/lib/dashboard/types";

function presetToDates(preset: TimePreset, customStart: Date | null, customEnd: Date | null): { dateStart: Date; dateEnd: Date } {
  const now = new Date();
  if (preset === "custom") {
    return {
      dateStart: customStart ?? new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000),
      dateEnd: customEnd ?? now,
    };
  }
  const days = { "24h": 1, "7d": 7, "30d": 30, "90d": 90 }[preset] ?? 30;
  return {
    dateStart: new Date(now.getTime() - days * 24 * 60 * 60 * 1000),
    dateEnd: now,
  };
}

export function useDashboardFilters(): {
  filters: FilterState;
  resolvedDates: { dateStart: Date; dateEnd: Date };
  updateFilters: (update: Partial<FilterState>) => void;
} {
  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();

  const filters: FilterState = {
    surveyId: searchParams.get("survey"),
    locationIds: searchParams.getAll("location"),
    qrCodeIds: searchParams.getAll("qr"),
    timePreset: (searchParams.get("preset") as TimePreset) || "30d",
    dateStart: searchParams.get("from") ? new Date(searchParams.get("from")!) : null,
    dateEnd: searchParams.get("to") ? new Date(searchParams.get("to")!) : null,
  };

  // Memoize resolved dates so the object reference is stable between renders.
  // Without this, presetToDates calls new Date() every render, producing
  // ever-changing ISO strings that cause useDashboardData's useCallback to
  // re-fire on every render → infinite fetch loop.
  const resolvedDates = useMemo(
    () => presetToDates(filters.timePreset, filters.dateStart, filters.dateEnd),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [filters.timePreset, filters.dateStart?.toISOString(), filters.dateEnd?.toISOString()]
  );

  const updateFilters = useCallback(
    (update: Partial<FilterState>) => {
      const next: FilterState = { ...filters, ...update };
      const params = new URLSearchParams();
      if (next.surveyId) params.set("survey", next.surveyId);
      next.locationIds.forEach((id) => params.append("location", id));
      next.qrCodeIds.forEach((id) => params.append("qr", id));
      params.set("preset", next.timePreset);
      if (next.timePreset === "custom") {
        if (next.dateStart) params.set("from", next.dateStart.toISOString());
        if (next.dateEnd) params.set("to", next.dateEnd.toISOString());
      }
      router.replace(`${pathname}?${params.toString()}`);
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [searchParams, pathname, router]
  );

  return { filters, resolvedDates, updateFilters };
}
