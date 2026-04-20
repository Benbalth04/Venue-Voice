"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "@/lib/supabase/client";
import type {
  FilterState,
  OldQuestionsDashboardResponse,
  SurveyDashboardResponse,
} from "@/lib/dashboard/types";
import {
  getSurveyDashboard,
  getSurveyDashboardOldQuestions,
  type SurveyDashboardAPIParams,
} from "@/lib/api/client";
import {
  buildCacheKey,
  deleteCache,
  getCache,
  setCache,
} from "@/lib/dashboard/cache";
import { formatCalendarDateInTimeZone } from "@/lib/datetime/formatInUserTz";

async function getToken(): Promise<string | null> {
  const { data } = await supabase.auth.getSession();
  return data.session?.access_token ?? null;
}

export function buildAPIParams(
  filters: FilterState,
  dates: { dateStart: Date; dateEnd: Date },
  userTimeZone: string,
): SurveyDashboardAPIParams {
  return {
    location_ids: filters.locationIds.length > 0 ? filters.locationIds : undefined,
    qr_code_ids: filters.qrCodeIds.length > 0 ? filters.qrCodeIds : undefined,
    date_start: formatCalendarDateInTimeZone(dates.dateStart, userTimeZone),
    date_end: formatCalendarDateInTimeZone(dates.dateEnd, userTimeZone),
    include_archived: filters.includeArchived ? true : undefined,
  };
}

export function useDashboardData(
  surveyId: string | null,
  filters: FilterState,
  resolvedDates: { dateStart: Date; dateEnd: Date },
  userTimeZone: string,
): {
  data: SurveyDashboardResponse | null;
  isLoading: boolean;
  error: string | null;
  lastFetched: number | null;
  refetch: () => void;
} {
  const [data, setData] = useState<SurveyDashboardResponse | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastFetched, setLastFetched] = useState<number | null>(null);
  const fetchKey = useRef(0);
  const forceRefresh = useRef(false);

  const ds = formatCalendarDateInTimeZone(resolvedDates.dateStart, userTimeZone);
  const de = formatCalendarDateInTimeZone(resolvedDates.dateEnd, userTimeZone);
  const locationIdsKey = [...filters.locationIds].sort().join(",");
  const qrCodeIdsKey = [...filters.qrCodeIds].sort().join(",");
  const cacheKey = surveyId
    ? buildCacheKey(
        surveyId,
        filters.locationIds,
        filters.qrCodeIds,
        ds,
        de,
        userTimeZone,
        filters.includeArchived,
      )
    : null;

  const fetch = useCallback(async () => {
    if (!surveyId || !cacheKey) return;
    const key = ++fetchKey.current;

    // Serve from cache unless a forced refresh was requested
    if (!forceRefresh.current) {
      const cached = getCache<SurveyDashboardResponse>(cacheKey);
      if (cached) {
        if (fetchKey.current === key) {
          setData(cached.data);
          setLastFetched(cached.fetchedAt);
          setError(null);
        }
        return;
      }
    }
    forceRefresh.current = false;

    setIsLoading(true);
    setError(null);
    try {
      const token = await getToken();
      if (!token) throw new Error("Not authenticated");
      const params = buildAPIParams(filters, resolvedDates, userTimeZone);
      const result = await getSurveyDashboard<SurveyDashboardResponse>(token, surveyId, params);
      if (fetchKey.current === key) {
        const fetchedAt = setCache(cacheKey, result);
        setData(result);
        setLastFetched(fetchedAt);
      }
    } catch (e: unknown) {
      if (fetchKey.current === key) {
        setError(e instanceof Error ? e.message : "Failed to load dashboard");
      }
    } finally {
      if (fetchKey.current === key) setIsLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- keys capture filter inputs; `filters` is new ref each render from URL state
  }, [surveyId, userTimeZone, cacheKey, locationIdsKey, qrCodeIdsKey, ds, de, filters.includeArchived]);

  useEffect(() => {
    if (surveyId) fetch();
  }, [fetch, surveyId]);

  const refetch = useCallback(() => {
    if (cacheKey) deleteCache(cacheKey);
    forceRefresh.current = true;
    fetch();
  }, [fetch, cacheKey]);

  return { data, isLoading, error, lastFetched, refetch };
}

export function useOldQuestionsData(
  surveyId: string | null,
  filters: FilterState,
  resolvedDates: { dateStart: Date; dateEnd: Date },
  userTimeZone: string,
  enabled: boolean,
): {
  data: OldQuestionsDashboardResponse | null;
  isLoading: boolean;
  error: string | null;
} {
  const [data, setData] = useState<OldQuestionsDashboardResponse | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fetchKey = useRef(0);

  const ds = formatCalendarDateInTimeZone(resolvedDates.dateStart, userTimeZone);
  const de = formatCalendarDateInTimeZone(resolvedDates.dateEnd, userTimeZone);
  const locationIdsKey = [...filters.locationIds].sort().join(",");
  const qrCodeIdsKey = [...filters.qrCodeIds].sort().join(",");

  useEffect(() => {
    if (!enabled || !surveyId) return;

    const cacheKey = buildCacheKey(
      `old:${surveyId}`,
      filters.locationIds,
      filters.qrCodeIds,
      ds,
      de,
      userTimeZone,
      filters.includeArchived,
    );

    const cached = getCache<OldQuestionsDashboardResponse>(cacheKey);
    if (cached) {
      setData(cached.data);
      return;
    }

    const key = ++fetchKey.current;
    setIsLoading(true);
    setError(null);

    getToken().then((token) => {
      if (!token) {
        setError("Not authenticated");
        setIsLoading(false);
        return;
      }
      const params = buildAPIParams(filters, resolvedDates, userTimeZone);
      return getSurveyDashboardOldQuestions<OldQuestionsDashboardResponse>(token, surveyId, params)
        .then((result) => {
          if (fetchKey.current === key) {
            setCache(cacheKey, result);
            setData(result);
          }
        })
        .catch((e: unknown) => {
          if (fetchKey.current === key) {
            setError(e instanceof Error ? e.message : "Failed to load old questions");
          }
        })
        .finally(() => {
          if (fetchKey.current === key) setIsLoading(false);
        });
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- keys capture filter inputs; `filters` is new ref each render
  }, [enabled, surveyId, userTimeZone, locationIdsKey, qrCodeIdsKey, ds, de, filters.includeArchived]);

  return { data, isLoading, error };
}
