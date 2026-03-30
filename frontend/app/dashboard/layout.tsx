import type { ReactNode } from "react"
import { DashboardLayout } from "@/components/layout/DashboardLayout"
import { AuthGuard } from "@/components/auth/AuthGuard"
import { DashboardAccessGuard } from "@/components/auth/DashboardAccessGuard"
import { SettingsSchemaProvider } from "@/contexts/SettingsSchemaContext"
import { CrispChat } from "@/components/crisp/CrispChat"

export default function DashboardRootLayout({
  children,
}: {
  children: ReactNode
}) {
  return (
    <AuthGuard>
      <DashboardAccessGuard>
        <SettingsSchemaProvider>
          <CrispChat />
          <DashboardLayout>{children}</DashboardLayout>
        </SettingsSchemaProvider>
      </DashboardAccessGuard>
    </AuthGuard>
  )
}
