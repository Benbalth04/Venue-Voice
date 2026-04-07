"use client"

import type { ComponentType } from "react"
import Image from "next/image"
import Link from "next/link"
import { usePathname, useRouter } from "next/navigation"
import {
  AlertTriangle,
  BarChart3,
  LayoutDashboard,
  Link2,
  LogOut,
  MapPin,
  MessageSquare,
  Users,
  Zap,
  BookAudio
} from "lucide-react"
import { supabase } from "@/lib/supabase/client"
import { useAuth } from "@/contexts/AuthContext"
import { useUnreadResponses } from "@/components/layout/UnreadResponsesContext"
import { useBrokenRules } from "@/components/layout/BrokenRulesContext"
import { useBrokenFlows } from "@/components/layout/BrokenFlowsContext"
import { useQRSubmissionBlocked } from "@/components/layout/QRSubmissionBlockedContext"

type NavChild = {
  href: string
  label: string
  exact?: boolean
  showUnreadCount?: boolean
  showBrokenFlowCount?: boolean
  showBrokenRuleCount?: boolean
  showSubmissionBlockedQrCount?: boolean
  tourId?: string
}

type NavItem = {
  href?: string
  label: string
  icon?: ComponentType<{ className?: string }>
  disabled?: boolean
  exact?: boolean
  children?: NavChild[]
  tourId?: string
}

function buildNavItems(isViewer: boolean): NavItem[] {
  const distributionChildren: NavChild[] = []
  if (!isViewer) {
    distributionChildren.push({
      href: "/dashboard/distribution/assign_surveys",
      label: "Assign Surveys",
      exact: true,
      tourId: "tour-assign-surveys",
    })
  }
  distributionChildren.push({
    href: "/dashboard/distribution/qr_codes",
    label: "QR Codes",
    exact: true,
    showSubmissionBlockedQrCount: !isViewer,
    tourId: "tour-qr-codes",
  })

  const items: NavItem[] = [
    { href: "/dashboard", label: "Overview", icon: LayoutDashboard, exact: true },
    {
      href: "/dashboard/analytics/view_responses",
      label: "Analytics",
      icon: BarChart3,
      children: [
        {
          href: "/dashboard/analytics/view_responses",
          label: "View Responses",
          exact: true,
          showUnreadCount: true,
          tourId: "tour-view-responses",
        },
        {
          href: "/dashboard/analytics/survey_dashboard",
          label: "Survey Dashboards",
          exact: true,
          tourId: "tour-survey-dashboards",
        },
      ],
    },
    { href: "/dashboard/surveys", label: "Surveys", icon: MessageSquare, tourId: "tour-surveys" },
    { href: "/dashboard/locations", label: "Locations", icon: MapPin, tourId: "tour-locations" },
    {
      href: distributionChildren[0].href,
      label: "Distribution",
      icon: Link2,
      children: distributionChildren,
    },
  ]

  if (!isViewer) {
    items.push({
      href: "/dashboard/automations/flows",
      label: "Automations",
      icon: Zap,
      children: [
        { href: "/dashboard/automations/flows", label: "Flows", exact: true, showBrokenFlowCount: true, tourId: "tour-flows" },
        { href: "/dashboard/automations/rules", label: "Rules", exact: true, showBrokenRuleCount: true, tourId: "tour-rules" },
        { href: "/dashboard/automations/notification_groups", label: "Notification Groups", exact: true },
      ],
    })
  }

  items.push({ label: "Reports", icon: BookAudio, disabled: true })

  if (!isViewer) {
    items.push({ href: "/dashboard/users", label: "User Management", icon: Users })
  }

  return items
}

function isRouteActive(pathname: string, href: string, exact = false) {
  if (exact) return pathname === href
  return pathname === href || pathname.startsWith(`${href}/`)
}

export function Sidebar() {
  const pathname = usePathname()
  const router = useRouter()
  const { activeMembership } = useAuth()
  const { unreadCount } = useUnreadResponses()
  const { brokenRuleCount } = useBrokenRules()
  const { brokenFlowCount } = useBrokenFlows()
  const { submissionBlockedActiveQrCount } = useQRSubmissionBlocked()
  const isViewer = activeMembership?.role === "viewer"
  const items = buildNavItems(isViewer)

  async function onLogout() {
    supabase.auth.signOut().catch((err) => {
      console.error("Supabase signOut failed:", err)
    })

    router.push("/login")
    router.refresh()
  }

  return (
    <aside className="sticky top-0 hidden h-screen w-64 flex-col border-r border-zinc-200 bg-white px-4 py-6 lg:flex">
      <Link href="/dashboard" className="mb-6 flex flex-shrink-0 items-center justify-center px-2">
        <Image
          src="/venue_voice_logo_1.png"
          alt="Venue Voice"
          width={1000}
          height={800}
          className="mb-3s h-17 w-full object-contain"
        />
      </Link>

      <nav className="flex-1 space-y-1 overflow-y-auto">
        {items.map((item) => {
          const Icon = item.icon
          const parentActive =
            item.href != null ? isRouteActive(pathname, item.href, item.exact) : false
          const hasActiveChild = item.children?.some((child) =>
            isRouteActive(pathname, child.href, child.exact),
          )
          const active = parentActive || Boolean(hasActiveChild)

          return (
            <div key={item.label} className="space-y-1">
              {item.disabled ? (
                <div className="flex flex-col rounded-xl px-3 py-2 text-sm font-small text-zinc-400">
                  {/* Level 0 */}
                  <div className="flex items-center gap-2">
                    {Icon ? <Icon className="h-4 w-4" /> : null}
                    <span>{item.label}</span>
                  </div>

                  {/* Level 1 aligned with label */}
                  <span className="ml-6 mt-1 text-xs font-medium text-zinc-400">
                    Coming soon
                  </span>
                </div>
              ) : item.href ? (
                <Link
                  href={item.href}
                  id={item.tourId}
                  className={[
                    "flex items-center gap-2 rounded-xl px-3 py-2 text-sm font-small transition-colors",
                    active ? "bg-violet-50 text-violet-700" : "text-zinc-700 hover:bg-zinc-50",
                  ].join(" ")}
                >
                  {Icon ? <Icon className="h-4 w-4" /> : null}
                  <span>{item.label}</span>
                </Link>
              ) : null}

              {item.children ? (
                <div className="space-y-1 pl-9">
                  {item.children.map((child) => {
                    const childActive = isRouteActive(pathname, child.href, child.exact)
                    return (
                      <Link
                        key={child.href}
                        href={child.href}
                        id={child.tourId}
                        className={[
                          "flex items-center gap-2 rounded-xl px-3 py-2 text-sm font-small transition-colors",
                          childActive
                            ? "bg-violet-50 text-violet-700"
                            : "text-zinc-600 hover:bg-zinc-50 hover:text-zinc-900",
                        ].join(" ")}
                      >
                        <span className="min-w-0 flex-1 truncate">{child.label}</span>
                        {child.showUnreadCount && unreadCount > 0 ? (
                          <span
                            className="inline-flex h-4 shrink-0 items-center justify-center rounded-full bg-emerald-500 px-1 text-[9px] font-bold leading-none text-white tabular-nums"
                            title={`${unreadCount} new response${unreadCount === 1 ? "" : "s"}`}
                            aria-label={`${unreadCount} new response${unreadCount === 1 ? "" : "s"}`}
                          >
                            {unreadCount > 99 ? "99+" : unreadCount}
                          </span>
                        ) : null}
                        {child.showBrokenFlowCount && brokenFlowCount > 0 ? (
                          <AlertTriangle
                            className="h-3 w-3 shrink-0 text-red-500"
                            aria-label={`${brokenFlowCount} broken flow${brokenFlowCount === 1 ? "" : "s"}`}
                          >
                            <title>
                              {`${brokenFlowCount} broken flow${brokenFlowCount === 1 ? "" : "s"}`}
                            </title>
                          </AlertTriangle>
                        ) : null}
                        {child.showBrokenRuleCount && brokenRuleCount > 0 ? (
                          <AlertTriangle
                            className="h-3 w-3 shrink-0 text-amber-500"
                            aria-label={`${brokenRuleCount} broken rule${brokenRuleCount === 1 ? "" : "s"}`}
                          >
                            <title>
                              {`${brokenRuleCount} broken rule${brokenRuleCount === 1 ? "" : "s"}`}
                            </title>
                          </AlertTriangle>
                        ) : null}
                        {child.showSubmissionBlockedQrCount && submissionBlockedActiveQrCount > 0 ? (
                          <AlertTriangle
                            className="h-3 w-3 shrink-0 text-amber-500"
                            aria-label={`${submissionBlockedActiveQrCount} active QR code${submissionBlockedActiveQrCount === 1 ? "" : "s"} not accepting submissions`}
                          >
                            <title>
                              {`${submissionBlockedActiveQrCount} active QR code${submissionBlockedActiveQrCount === 1 ? "" : "s"} not accepting submissions`}
                            </title>
                          </AlertTriangle>
                        ) : null}
                      </Link>
                    )
                  })}
                </div>
              ) : null}
            </div>
          )
        })}
      </nav>

      <button
        type="button"
        className="mt-4 inline-flex items-center gap-2 rounded-xl px-3 py-2 text-sm font-medium text-zinc-500 hover:bg-zinc-50"
        aria-label="Logout"
        onClick={onLogout}
      >
        <LogOut className="h-4 w-4" />
        <span>Logout</span>
      </button>
    </aside>
  )
}
