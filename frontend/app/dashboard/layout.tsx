import type { ReactNode } from "react"
import { DashboardLayout } from "@/components/layout/DashboardLayout"
import { AuthGuard } from "@/components/auth/AuthGuard"

export default function DashboardRootLayout({
  children,
}: {
  children: ReactNode
}) {
  return (
    <AuthGuard>
      <DashboardLayout>{children}</DashboardLayout>
    </AuthGuard>
  )
}

