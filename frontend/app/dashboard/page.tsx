"use client"

import { useEffect, useState } from "react"
import { MetricCard } from "@/components/dashboard/MetricCard"
import { TrendChart } from "@/components/dashboard/TrendChart"
import { Button } from "@/components/ui/button"
import { supabase } from "@/lib/supabase/client"
import {
  fetchDashboard,
  extractErrorMessage,
  type DashboardData,
} from "@/lib/api/client"
import Link from "next/link"
import { LoadingBlock } from "@/components/ui/LoadingSpinner"

export default function DashboardOverviewPage() {
  const [data, setData] = useState<DashboardData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let mounted = true

    async function load() {
      const {
        data: { session },
      } = await supabase.auth.getSession()
      if (!session?.access_token || !mounted) return

      try {
        const dashboard = await fetchDashboard(session.access_token)
        if (mounted) setData(dashboard)
      } catch (err) {
        if (mounted) setError(extractErrorMessage(err, "Failed to load dashboard"))
      } finally {
        if (mounted) setLoading(false)
      }
    }

    load()
  }, [])

  if (loading) {
    return (
      <div className="flex min-h-[200px] items-center justify-center">
        <LoadingBlock message="Loading dashboard…" />
      </div>
    )
  }

  if (error || !data) {
    return (
      <div className="flex min-h-[200px] items-center justify-center">
        <p className="text-sm text-red-600">{error ?? "Failed to load dashboard"}</p>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-zinc-950">
            Welcome back, {data.user_display_name}
          </h1>
          <p className="mt-1 text-sm text-zinc-600">
            You are managing{" "}
            <span className="font-medium text-zinc-900">{data.company_name || "your company"}</span>.
          </p>
        </div>
        <Link href="/dashboard/surveys">
          <Button>Create a survey</Button>
        </Link>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-5">
        <MetricCard label="Total submissions" value={data.total_submissions} />
        <MetricCard label="Total scans" value={data.total_scans} />
        <MetricCard label="Active surveys" value={data.active_surveys_count} />
        <MetricCard label="Active QR codes" value={data.active_qr_codes_count} />
        <MetricCard label="Active locations" value={data.active_locations_count} />
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <TrendChart title="Submissions over time" points={data.submission_trend} />
        <TrendChart title="Completion rate over time" points={data.completion_rate_trend} isPercentage />
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="space-y-2">
          <h2 className="text-sm font-semibold text-zinc-900">Active surveys</h2>
          <div className="space-y-1 rounded-2xl border border-zinc-200 bg-white p-3 shadow-sm">
            {data.active_surveys.length > 0 ? (
              data.active_surveys.map((s) => (
                <Link
                  key={s.id}
                  href="/dashboard/analytics"
                  className="flex items-center justify-between rounded-xl px-2 py-1.5 text-sm hover:bg-zinc-50"
                >
                  <span>{s.title}</span>
                  <span className="text-xs text-zinc-500">
                    {s.question_count} questions
                  </span>
                </Link>
              ))
            ) : (
              <p className="px-2 py-4 text-center text-sm text-zinc-500">
                No data available
              </p>
            )}
          </div>
        </div>

        <div className="space-y-2">
          <h2 className="text-sm font-semibold text-zinc-900">Active QR codes</h2>
          <div className="space-y-1 rounded-2xl border border-zinc-200 bg-white p-3 shadow-sm">
            {data.active_qr_codes.length > 0 ? (
              data.active_qr_codes.slice(0, 5).map((q) => (
                <Link
                  key={q.id}
                  href="/dashboard/distribution"
                  className="flex items-center justify-between rounded-xl px-2 py-1.5 text-sm hover:bg-zinc-50"
                >
                  <span>{q.title}</span>
                  <span className="text-xs text-zinc-500">
                    {q.scan_count} scans
                  </span>
                </Link>
              ))
            ) : (
              <p className="px-2 py-4 text-center text-sm text-zinc-500">
                No data available
              </p>
            )}
          </div>
        </div>

        <div className="space-y-2">
          <h2 className="text-sm font-semibold text-zinc-900">Active locations</h2>
          <div className="space-y-1 rounded-2xl border border-zinc-200 bg-white p-3 shadow-sm">
            {data.active_locations.length > 0 ? (
              data.active_locations.map((l) => (
                <Link
                  key={l.id}
                  href="/dashboard/locations"
                  className="flex items-center justify-between rounded-xl px-2 py-1.5 text-sm hover:bg-zinc-50"
                >
                  <span>{l.name}</span>
                </Link>
              ))
            ) : (
              <p className="px-2 py-4 text-center text-sm text-zinc-500">
                No data available
              </p>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
