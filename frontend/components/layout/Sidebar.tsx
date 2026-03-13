"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { useRouter } from "next/navigation"
import {
  BarChart3,
  Bell,
  LayoutDashboard,
  Link2,
  LogOut,
  MapPin,
  MessageSquare,
} from "lucide-react"

const items = [
  { href: "/dashboard", label: "Overview", icon: LayoutDashboard },
  { href: "/dashboard/analytics", label: "Analytics", icon: BarChart3 },
  { href: "/dashboard/surveys", label: "Surveys", icon: MessageSquare },
  { href: "/dashboard/distribution", label: "Distribution", icon: Link2 },
  { href: "/dashboard/locations", label: "Locations", icon: MapPin },
  { href: "/dashboard/alerts", label: "Alerts", icon: Bell },
]

export function Sidebar() {
  const pathname = usePathname()
  const router = useRouter()

  async function onLogout() {
    try {
      await fetch("/api/auth/logout", { method: "POST", credentials: "include" })
    } finally {
      router.push("/login")
      router.refresh()
    }
  }

  return (
    <aside className="hidden h-screen w-60 flex-col border-r border-zinc-200 bg-white px-4 py-6 lg:flex">
      <div className="mb-6 px-2 text-sm font-semibold text-violet-700">
        VenueVoice
      </div>
      <nav className="flex-1 space-y-1">
        {items.map((item) => {
          const Icon = item.icon
          const active =
            pathname === item.href || pathname.startsWith(item.href + "/")
          return (
            <Link
              key={item.href}
              href={item.href}
              className={[
                "flex items-center gap-2 rounded-xl px-3 py-2 text-sm font-medium transition-colors",
                active
                  ? "bg-violet-50 text-violet-700"
                  : "text-zinc-700 hover:bg-zinc-50",
              ].join(" ")}
            >
              <Icon className="h-4 w-4" />
              <span>{item.label}</span>
            </Link>
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

