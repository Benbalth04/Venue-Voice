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

async function getToken(): Promise<string | null> {
  const { data } = await supabase.auth.getSession();
  return data.session?.access_token ?? null;
}

function buildAPIParams(filters: FilterState, dates: { dateStart: Date; dateEnd: Date }): SurveyDashboardAPIParams {
  return {
    location_ids: filters.locationIds.length > 0 ? filters.locationIds : undefined,
    qr_code_ids: filters.qrCodeIds.length > 0 ? filters.qrCodeIds : undefined,
    date_start: dates.dateStart.toISOString(),
    date_end: dates.dateEnd.toISOString(),
  };
}

export function useDashboardData(
  surveyId: string | null,
  filters: FilterState,
  resolvedDates: { dateStart: Date; dateEnd: Date }
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

  const cacheKey = surveyId
    ? buildCacheKey(
        surveyId,
        filters.locationIds,
        filters.qrCodeIds,
        resolvedDates.dateStart.toISOString(),
        resolvedDates.dateEnd.toISOString(),
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
      const params = buildAPIParams(filters, resolvedDates);
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
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [surveyId, filters.locationIds.join(","), filters.qrCodeIds.join(","), resolvedDates.dateStart.toISOString(), resolvedDates.dateEnd.toISOString()]);

  useEffect(() => {
    if (surveyId) fetch();
  }, [fetch]);

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
  enabled: boolean
): {
  data: OldQuestionsDashboardResponse | null;
  isLoading: boolean;
  error: string | null;
} {
  const [data, setData] = useState<OldQuestionsDashboardResponse | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const hasFetched = useRef(false);
  const fetchKey = useRef(0);

  useEffect(() => {
    if (!enabled || !surveyId || hasFetched.current) return;

    const cacheKey = buildCacheKey(
      `old:${surveyId}`,
      filters.locationIds,
      filters.qrCodeIds,
      resolvedDates.dateStart.toISOString(),
      resolvedDates.dateEnd.toISOString(),
    );

    // Serve from module-level cache — persists across accordion open/close and page navigations
    const cached = getCache<OldQuestionsDashboardResponse>(cacheKey);
    if (cached) {
      setData(cached.data);
      hasFetched.current = true;
      return;
    }

    const key = ++fetchKey.current;
    hasFetched.current = true;
    setIsLoading(true);
    setError(null);

    getToken().then((token) => {
      if (!token) {
        setError("Not authenticated");
        setIsLoading(false);
        return;
      }
      const params = buildAPIParams(filters, resolvedDates);
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
            hasFetched.current = false; // allow retry on error
          }
        })
        .finally(() => {
          if (fetchKey.current === key) setIsLoading(false);
        });
    });
  }, [enabled, surveyId]); // Only trigger on expand, not on filter change

  return { data, isLoading, error };
}
