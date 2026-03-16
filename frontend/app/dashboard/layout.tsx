import type { ReactNode } from "react"
import { DashboardLayout } from "@/components/layout/DashboardLayout"
import { AuthGuard } from "@/components/auth/AuthGuard"
import { SettingsSchemaProvider } from "@/contexts/SettingsSchemaContext"

export default function DashboardRootLayout({
  children,
}: {
  children: ReactNode
}) {
  return (
    <AuthGuard>
      <SettingsSchemaProvider>
        <DashboardLayout>{children}</DashboardLayout>
      </SettingsSchemaProvider>
    </AuthGuard>
  )
}

