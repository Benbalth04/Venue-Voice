import type { ReactNode } from "react"
import { DashboardLayout } from "@/components/layout/DashboardLayout"
import { AuthGuard } from "@/components/auth/AuthGuard"
import { SettingsSchemaProvider } from "@/contexts/SettingsSchemaContext"
import { OnboardingGuard } from "@/components/auth/OnboardingGuard"

export default function DashboardRootLayout({
  children,
}: {
  children: ReactNode
}) {
  return (
    <AuthGuard>
      <OnboardingGuard>
        <SettingsSchemaProvider>
          <DashboardLayout>{children}</DashboardLayout>
        </SettingsSchemaProvider>
      </OnboardingGuard>
    </AuthGuard>
  )
}