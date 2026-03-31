import type { ReactNode } from "react"
import { DashboardLayout } from "@/components/layout/DashboardLayout"
import { AuthGuard } from "@/components/auth/AuthGuard"
import { DashboardAccessGuard } from "@/components/auth/DashboardAccessGuard"
import { SettingsSchemaProvider } from "@/contexts/SettingsSchemaContext"

export default function DashboardRootLayout({
  children,
}: {
  children: ReactNode
}) {
  return (
    <AuthGuard>
      <DashboardAccessGuard>
        <SettingsSchemaProvider>
          <DashboardLayout>{children}</DashboardLayout>
        </SettingsSchemaProvider>
      </DashboardAccessGuard>
    </AuthGuard>
  )
}
